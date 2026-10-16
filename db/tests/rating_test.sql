-- Star rating tests. Run against an EMPTY database that has db/schema.sql loaded:
--   createdb pickapub_test && psql -d pickapub_test -f db/schema.sql -f db/tests/rating_test.sql
-- Everything runs in a transaction that is rolled back.
\set ON_ERROR_STOP on
begin;

insert into users (id, display_name)
select 'u' || g, 'User ' || g from generate_series(1, 40) g;

insert into pubs (source, source_id, name, lat, lng) values
  ('test', 'baseline', 'Baseline', 51.44, -0.15),  -- sets the area average to 3 in every category
  ('test', 'a', 'One perfect review', 51.44, -0.15),
  ('test', 'b', 'Twenty good reviews', 51.44, -0.15),
  ('test', 'c', 'Cannot see the screen', 51.44, -0.15),
  ('test', 'd', 'Old reviews only', 51.44, -0.15),
  ('test', 'e', 'No reviews', 51.44, -0.15);

create temp table ids as select source_id as k, id from pubs where source = 'test';

-- helper: insert n reviews with the same scores
create temp table spec (k text, n int, sl int, cr int, sc int, se int, co int, sv int, dp int, age_days int);
insert into spec values
  ('baseline', 10, 3, 3, 3, 3, 3, 3, 3, 0),
  ('a',         1, 5, 5, 5, 5, 5, 5, 5, 0),
  ('b',        20, 4, 4, 4, 4, 4, 4, 4, 0),
  ('c',         5, 1, 5, 5, 5, 5, 5, 5, 0),
  ('d',         3, 5, 5, 5, 5, 5, 5, 5, 730);

insert into reviews (pub_id, user_id, sightlines, crowd, screens, seating, commentary, service_speed, drink_prices, vibe, updated_at)
select i.id, 'u' || g, s.sl, s.cr, s.sc, s.se, s.co, s.sv, s.dp, 3, now() - make_interval(days => s.age_days)
from spec s join ids i on i.k = s.k
cross join lateral generate_series(1, s.n) g;

do $$
declare
  a record; b record; c record; d record; e_count int;
begin
  select * into a from pub_scores where pub_id = (select id from ids where k = 'a');
  select * into b from pub_scores where pub_id = (select id from ids where k = 'b');
  select * into c from pub_scores where pub_id = (select id from ids where k = 'c');
  select * into d from pub_scores where pub_id = (select id from ids where k = 'd');
  select count(*) into e_count from pub_scores where pub_id = (select id from ids where k = 'e');

  -- 1. One perfect review gets no stars yet, and its score is pulled well below 5.
  assert a.stars is null, format('A should have no stars, got %s', a.stars);
  assert a.score < 4.5, format('A score should be smoothed well below 5, got %s', a.score);

  -- 2. Twenty 4s outrank a single 5. The API sorts by stars first (pubs with
  --    fewer than min_reviews have none and sit below), then by score.
  assert b.stars is not null and a.stars is null, 'B should be ranked and A should not';
  assert b.stars = 4, format('B should be 4 stars, got %s', b.stars);

  -- 3. Great everything but no view: capped at sightlines + 1.
  assert c.score <= c.sightlines + 1.01, format('C should be capped near sightlines + 1, got %s', c.score);
  assert c.stars <= 2, format('C should be 2 stars or fewer, got %s', c.stars);

  -- 4. Two-year-old perfect reviews count for less than fresh ones.
  assert d.score < 4.5, format('D old reviews should be smoothed down, got %s', d.score);

  -- 5. A pub with no reviews is simply absent (the API shows "No reviews yet").
  assert e_count = 0, 'E should have no row';

  raise notice 'PASS  A score % stars %', a.score, a.stars;
  raise notice 'PASS  B score % stars %', b.score, b.stars;
  raise notice 'PASS  C score % stars % (sightlines %)', c.score, c.stars, c.sightlines;
  raise notice 'PASS  D score % stars %', d.score, d.stars;
end $$;

rollback;
