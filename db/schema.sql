-- Pick-a-Pub schema. Idempotent: safe to run on every deploy.
-- Distance search uses cube + earthdistance (both available on RDS Postgres).

create extension if not exists cube;
create extension if not exists earthdistance;

create table if not exists pubs (
  id          integer generated always as identity primary key,
  source      text not null default 'osm',      -- where the listing came from
  source_id   text not null,                    -- e.g. "node/123456"
  name        text not null,
  address     text,
  postcode    text,
  lat         double precision not null,
  lng         double precision not null,
  created_at  timestamptz not null default now(),
  unique (source, source_id)
);

-- Extra details from OpenStreetMap: opening_hours, website, phone, operator,
-- beer_garden, food, real_ale, wheelchair, shows_sport. Shape set by scripts/osm-to-pub.mjs.
alter table pubs add column if not exists info jsonb not null default '{}'::jsonb;

create index if not exists pubs_geo_idx on pubs using gist (ll_to_earth(lat, lng));

create table if not exists users (
  id            text primary key,               -- Cognito "sub"
  display_name  text not null check (char_length(display_name) between 2 and 30),
  created_at    timestamptz not null default now()
);

-- One review per user per pub.
create table if not exists reviews (
  id          integer generated always as identity primary key,
  pub_id      integer not null references pubs(id) on delete cascade,
  user_id     text    not null references users(id) on delete cascade,

  -- Scored 1 to 5. These feed the star rating.
  sightlines     smallint not null check (sightlines between 1 and 5),     -- see a screen from your seat
  crowd          smallint not null check (crowd between 1 and 5),          -- there to watch, not too packed
  screens        smallint not null check (screens between 1 and 5),        -- size and picture quality
  seating        smallint not null check (seating between 1 and 5),        -- getting a seat
  commentary     smallint not null check (commentary between 1 and 5),     -- sound on and audible
  service_speed  smallint not null check (service_speed between 1 and 5),  -- the half-time queue
  drink_prices   smallint not null check (drink_prices between 1 and 5),   -- value for money

  -- Shown but not part of the stars.
  food  smallint check (food between 1 and 5),                             -- null = did not eat
  vibe  smallint not null check (vibe between 1 and 5),                    -- 1 calm ... 5 lively

  -- Facts. null = reviewer did not know.
  shows_sky       boolean,
  shows_tnt       boolean,
  shows_amazon    boolean,
  bookable        boolean,
  outdoor_screen  boolean,
  away_friendly   boolean,
  family_friendly boolean,
  step_free       boolean,

  match_label text check (char_length(match_label) <= 80),                 -- e.g. "Arsenal v Spurs"
  comment     text check (char_length(comment) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (pub_id, user_id)
);

-- Added after launch (feedback round 1).
alter table reviews add column if not exists dog_friendly   boolean;
alter table reviews add column if not exists low_no_alcohol boolean;  -- decent low or no alcohol drinks

create index if not exists reviews_pub_idx on reviews (pub_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Star rating
-- ---------------------------------------------------------------------------

-- How much each category counts. Generated from the survey by
-- scripts/survey_weights.py. "do nothing" keeps any weights loaded since.
create table if not exists rating_weights (
  category text primary key
    check (category in ('sightlines','crowd','screens','seating','commentary','service_speed','drink_prices')),
  weight   numeric(4,2) not null check (weight > 0)
);

insert into rating_weights (category, weight) values
  ('sightlines', 0.19),
  ('screens', 0.15),
  ('crowd', 0.15),
  ('seating', 0.13),
  ('commentary', 0.13),
  ('service_speed', 0.13),
  ('drink_prices', 0.12)
on conflict (category) do nothing;

-- Tuning knobs, one row.
create table if not exists rating_settings (
  id              boolean primary key default true check (id),
  prior_reviews   numeric not null default 3,    -- smoothing: pretend every pub has this many "average" reviews
  half_life_days  numeric not null default 365,  -- a review counts half as much after this long
  min_reviews     integer not null default 3,    -- show stars from this many reviews
  sightline_cap   numeric not null default 1     -- overall can be at most this far above sightlines
);
insert into rating_settings default values on conflict (id) do nothing;

-- Per pub: plain averages for display, plus the star rating.
--  1. Each review is weighted by age (half-life decay).
--  2. Each category is smoothed towards the average across all pubs.
--  3. Overall = weighted sum of the smoothed categories.
--  4. Overall is capped at sightlines + sightline_cap.
--  5. Stars = overall rounded to the nearest half, once a pub has min_reviews.
-- Dropped and recreated so new columns can be added anywhere in it.
drop view if exists pub_scores;
create view pub_scores as
with s as (select * from rating_settings),
weighted as (
  select r.*,
         power(0.5, extract(epoch from (now() - r.updated_at)) / 86400.0 / s.half_life_days) as w
  from reviews r cross join s
),
long as (
  select wt.pub_id, wt.w, c.category, c.score
  from weighted wt
  cross join lateral (values
    ('sightlines', wt.sightlines), ('crowd', wt.crowd), ('screens', wt.screens),
    ('seating', wt.seating), ('commentary', wt.commentary),
    ('service_speed', wt.service_speed), ('drink_prices', wt.drink_prices)
  ) as c(category, score)
),
prior as (
  select category, sum(w * score) / nullif(sum(w), 0) as mean
  from long group by category
),
smoothed as (
  select l.pub_id, l.category,
         (s.prior_reviews * p.mean + sum(l.w * l.score)) / (s.prior_reviews + sum(l.w)) as score
  from long l
  join prior p using (category)
  cross join s
  group by l.pub_id, l.category, s.prior_reviews, p.mean
),
-- The cap uses the pub's own (unsmoothed) sightline average: if its reviewers
-- say they could not see the screen, the area average should not rescue it.
own_sightlines as (
  select pub_id, sum(w * score) / sum(w) as sightlines
  from long where category = 'sightlines' group by pub_id
),
overall as (
  select sm.pub_id,
         sum(sm.score * rw.weight) / sum(rw.weight) as raw,
         os.sightlines
  from smoothed sm
  join rating_weights rw using (category)
  join own_sightlines os using (pub_id)
  group by sm.pub_id, os.sightlines
),
agg as (
  select pub_id,
    count(*)::int                                     as review_count,
    round(avg(sightlines), 1)::float8                 as sightlines,
    round(avg(crowd), 1)::float8                      as crowd,
    round(avg(screens), 1)::float8                    as screens,
    round(avg(seating), 1)::float8                    as seating,
    round(avg(commentary), 1)::float8                 as commentary,
    round(avg(service_speed), 1)::float8              as service_speed,
    round(avg(drink_prices), 1)::float8               as drink_prices,
    round(avg(food), 1)::float8                       as food,
    round(avg(vibe), 1)::float8                       as vibe,
    -- A fact is true when at least half of the reviewers who answered said yes.
    avg(shows_sky::int)       >= 0.5                  as shows_sky,
    avg(shows_tnt::int)       >= 0.5                  as shows_tnt,
    avg(shows_amazon::int)    >= 0.5                  as shows_amazon,
    avg(bookable::int)        >= 0.5                  as bookable,
    avg(outdoor_screen::int)  >= 0.5                  as outdoor_screen,
    avg(away_friendly::int)   >= 0.5                  as away_friendly,
    avg(family_friendly::int) >= 0.5                  as family_friendly,
    avg(step_free::int)       >= 0.5                  as step_free,
    avg(dog_friendly::int)    >= 0.5                  as dog_friendly,
    avg(low_no_alcohol::int)  >= 0.5                  as low_no_alcohol,
    max(updated_at)                                   as last_reviewed_at
  from reviews group by pub_id
)
select a.*,
  round(least(o.raw, o.sightlines + s.sightline_cap)::numeric, 2)::float8 as score,
  case when a.review_count >= s.min_reviews
       then (round(least(o.raw, o.sightlines + s.sightline_cap) * 2) / 2)::float8
  end                                                                    as stars
from agg a
join overall o using (pub_id)
cross join s;

-- ---------------------------------------------------------------------------
-- Pick-a-Pub's own verdicts and pub details (content/pubs.yaml)
-- Kept apart from customer reviews: never part of the star rating.
-- ---------------------------------------------------------------------------
create table if not exists pub_editorial (
  pub_id      integer primary key references pubs(id) on delete cascade,
  about       jsonb not null default '{}'::jsonb,   -- overrides the OpenStreetMap details in pubs.info
  rating      numeric(2,1) check (rating between 1 and 5 and rating * 2 = round(rating * 2)),
  summary     text check (char_length(summary) <= 400),
  best_for    text check (char_length(best_for) <= 80),
  tip         text check (char_length(tip) <= 250),
  visited     text check (visited ~ '^\d{4}-\d{2}$'),  -- YYYY-MM
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Search anywhere: which map tiles have had their pubs imported
-- ---------------------------------------------------------------------------
create table if not exists import_tiles (
  tile         text primary key,               -- e.g. "1286_-17", see api/src/tiles.ts
  imported_at  timestamptz not null default now(),
  pub_count    integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Photos. Uploaded photos stay pending until approved (scripts/photos.sh).
-- Our own photos live in content/photos/ and are listed in content/pubs.yaml.
-- ---------------------------------------------------------------------------
create table if not exists pub_photos (
  id           uuid primary key,
  pub_id       integer not null references pubs(id) on delete cascade,
  user_id      text references users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz
);
create index if not exists pub_photos_pub_idx on pub_photos (pub_id, status, created_at);

alter table pub_editorial add column if not exists photos jsonb not null default '[]'::jsonb;  -- filenames in content/photos/
