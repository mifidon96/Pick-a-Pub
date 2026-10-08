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

create index if not exists pubs_geo_idx on pubs using gist (ll_to_earth(lat, lng));

create table if not exists users (
  id            text primary key,               -- Cognito "sub"
  display_name  text not null check (char_length(display_name) between 2 and 30),
  created_at    timestamptz not null default now()
);

-- One review per user per pub. Scores are 1 to 5.
create table if not exists reviews (
  id          integer generated always as identity primary key,
  pub_id      integer not null references pubs(id) on delete cascade,
  user_id     text    not null references users(id) on delete cascade,

  tvs         smallint not null check (tvs between 1 and 5),         -- size and quality
  sightlines  smallint not null check (sightlines between 1 and 5),  -- can you see a screen from most seats
  atmosphere  smallint not null check (atmosphere between 1 and 5),
  seating     smallint not null check (seating between 1 and 5),     -- getting a seat on match day
  drinks      smallint not null check (drinks between 1 and 5),      -- price and range
  service     smallint not null check (service between 1 and 5),     -- half-time queue
  food        smallint check (food between 1 and 5),                 -- null = did not eat

  -- Facts. null = reviewer did not know.
  sound_on        boolean,
  shows_sky       boolean,
  shows_tnt       boolean,
  shows_amazon    boolean,
  bookable        boolean,
  outdoor_screen  boolean,
  away_friendly   boolean,
  family_friendly boolean,
  step_free       boolean,

  match_label text check (char_length(match_label) <= 80),           -- e.g. "Arsenal v Spurs"
  comment     text check (char_length(comment) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (pub_id, user_id)
);

create index if not exists reviews_pub_idx on reviews (pub_id, updated_at desc);

-- Aggregated scores per pub.
-- Overall is weighted towards what matters for watching a match. Food is shown but not counted.
-- A fact is true when at least half of the reviewers who answered said yes.
create or replace view pub_scores as
select
  pub_id,
  count(*)::int                                 as review_count,
  round(avg(tvs), 1)::float8                    as tvs,
  round(avg(sightlines), 1)::float8             as sightlines,
  round(avg(atmosphere), 1)::float8             as atmosphere,
  round(avg(seating), 1)::float8                as seating,
  round(avg(drinks), 1)::float8                 as drinks,
  round(avg(service), 1)::float8                as service,
  round(avg(food), 1)::float8                   as food,
  round(
      avg(tvs)        * 0.25
    + avg(sightlines) * 0.20
    + avg(atmosphere) * 0.20
    + avg(seating)    * 0.15
    + avg(drinks)     * 0.10
    + avg(service)    * 0.10
  , 1)::float8                                  as overall,
  avg(sound_on::int)        >= 0.5              as sound_on,
  avg(shows_sky::int)       >= 0.5              as shows_sky,
  avg(shows_tnt::int)       >= 0.5              as shows_tnt,
  avg(shows_amazon::int)    >= 0.5              as shows_amazon,
  avg(bookable::int)        >= 0.5              as bookable,
  avg(outdoor_screen::int)  >= 0.5              as outdoor_screen,
  avg(away_friendly::int)   >= 0.5              as away_friendly,
  avg(family_friendly::int) >= 0.5              as family_friendly,
  avg(step_free::int)       >= 0.5              as step_free,
  max(updated_at)                               as last_reviewed_at
from reviews
group by pub_id;
