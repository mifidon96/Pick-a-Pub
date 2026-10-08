-- LOCAL DEVELOPMENT ONLY. Do not load this into AWS.
-- Pub names are real Balham pubs but the coordinates are approximate and the
-- reviews are made up so the UI has something to show.
-- For real data run scripts/import-osm-pubs.mjs instead.

insert into pubs (source, source_id, name, address, postcode, lat, lng) values
  ('dev', '1', 'The Bedford',          '77 Bedford Hill',      'SW12 9HD', 51.4427, -0.1497),
  ('dev', '2', 'The Exhibit',          '12 Balham Station Rd', 'SW12 9SG', 51.4429, -0.1513),
  ('dev', '3', 'The Devonshire',       '39 Balham High Rd',    'SW12 9AN', 51.4466, -0.1487),
  ('dev', '4', 'The Regent',           '21 Chestnut Grove',    'SW12 8JB', 51.4424, -0.1541),
  ('dev', '5', 'The Grove',            '39 Oldridge Rd',       'SW12 8PN', 51.4478, -0.1515),
  ('dev', '6', 'The Clarence',         '90 Balham High Rd',    'SW12 9AG', 51.4452, -0.1500),
  ('dev', '7', 'The Moon Under Water', '194 Balham High Rd',   'SW12 9BP', 51.4425, -0.1527),
  ('dev', '8', 'The Avalon',           '16 Balham Hill',       'SW12 9EB', 51.4513, -0.1470)
on conflict (source, source_id) do nothing;

insert into users (id, display_name) values
  ('dev-user-1', 'Dev One'),
  ('dev-user-2', 'Dev Two'),
  ('dev-user-3', 'Dev Three')
on conflict (id) do nothing;

insert into reviews
  (pub_id, user_id, tvs, sightlines, atmosphere, seating, drinks, service, food,
   sound_on, shows_sky, shows_tnt, bookable, outdoor_screen, away_friendly, match_label, comment)
select p.id, v.user_id, v.tvs, v.sightlines, v.atmosphere, v.seating, v.drinks, v.service, v.food,
       v.sound_on, v.shows_sky, v.shows_tnt, v.bookable, v.outdoor_screen, v.away_friendly, v.match_label, v.comment
from (values
  ('1', 'dev-user-1', 5, 4, 5, 3, 3, 3, 4,    true,  true,  true,  true,  false, true,  'Sample match A', 'Sample review: big screens, loud for the big games.'),
  ('1', 'dev-user-2', 4, 4, 5, 2, 3, 2, null, true,  true,  true,  true,  false, true,  'Sample match B', 'Sample review: get there an hour early.'),
  ('2', 'dev-user-1', 4, 5, 4, 4, 3, 4, 4,    true,  true,  false, true,  true,  true,  'Sample match A', 'Sample review: screen visible from every table.'),
  ('2', 'dev-user-3', 4, 4, 3, 4, 3, 4, 3,    false, true,  null,  true,  true,  null,  null,             'Sample review: sound was off downstairs.'),
  ('4', 'dev-user-2', 3, 3, 4, 4, 4, 4, 5,    false, true,  false, false, false, true,  'Sample match C', 'Sample review: better for food than football.'),
  ('7', 'dev-user-3', 2, 2, 3, 5, 5, 3, 3,    false, false, false, false, false, true,  null,             'Sample review: cheap pints, small screens, no sound.')
) as v(source_id, user_id, tvs, sightlines, atmosphere, seating, drinks, service, food,
       sound_on, shows_sky, shows_tnt, bookable, outdoor_screen, away_friendly, match_label, comment)
join pubs p on p.source = 'dev' and p.source_id = v.source_id
on conflict (pub_id, user_id) do nothing;
