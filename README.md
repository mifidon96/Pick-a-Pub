# Pick-a-Pub

Find a pub near you that is good for watching football. Pubs are scored by people
who watched a match there. Launch area: Balham.

## The star rating

Reviewers score 7 things from 1 to 5. The weights come from a survey of what
football fans say matters (`scripts/survey_weights.py`, 30 responses so far):

| Category | Question | Weight |
| --- | --- | --- |
| View of a screen | Could you see it from where you sat? | 19% |
| Screens | Size and picture quality | 15% |
| Crowd | There to watch, not too packed | 15% (estimate) |
| Commentary | Sound on and audible | 14% |
| Seating | Chance of getting a seat | 13% |
| Bar service | How quick | 13% (estimate) |
| Drink prices | Value for money | 11% |

Crowd and bar service were not asked directly in the survey, so they are estimates.

How a pub's stars are worked out (`pub_scores` view in `db/schema.sql`):
1. Newer reviews count more: a review's weight halves every 365 days.
2. Each category is smoothed towards the average of all pubs, as if every pub had 3 extra average reviews. One glowing review cannot top the chart.
3. Overall = weighted sum of the categories.
4. Capped at the pub's own view-of-a-screen score + 1. If you cannot see the TV, it cannot rate highly.
5. Rounded to the nearest half star. Stars show from the first review; pubs with fewer than 3 reviews say the rating may change. Equal stars are ordered by number of reviews.

Not in the stars: **vibe** (calm to lively, a filter instead because people want
opposite things), **food**, and yes/no facts (Sky, TNT, Amazon, bookable, outdoor
screen, away fans, family friendly, step-free).

Tuning: weights live in the `rating_weights` table and the knobs in
`rating_settings`, so both can change without a code deploy. Tests:
`db/tests/rating_test.sql`.

To update the weights after more survey responses (export without the email column):

```bash
python3 scripts/survey_weights.py responses.csv > weights.sql
# then run weights.sql against the database
```

## Areas

Pubs are imported per area from OpenStreetMap. Areas are listed in
`web/lib/areas.json` (currently Balham and Reading), which also drives the area
picker on the site. To add one, add an entry (centre and import radius) and
redeploy without `--skip-pubs`.

Each pub page shows details from OpenStreetMap where listed: opening hours,
website, phone, food, beer garden, real ale, wheelchair access, plus a
directions link. Reviews are on a separate page, `/pub/review/?id=`.

## Pick-a-Pub verdicts

Our own reviews live in `content/pubs.yaml`: a rating (1 to 5 in halves), summary,
best for, tip and visit date, plus pub details (screens, food, booking, hours...)
that override OpenStreetMap. They show as a "Pick-a-Pub verdict" panel on the pub
page and an "Our verdict" badge in the list, and are never part of the customer
star rating.

Edit the file, then `./scripts/deploy.sh --skip-pubs`. The file is the source of
truth: remove a pub from it and its verdict is removed from the site. Mistakes
(bad rating, unknown field) stop the deploy step and change nothing. Names are matched loosely ("The Regent" = "Regent"); a name that matches no pub is skipped with a warning in the deploy output. To check the
file without deploying: `cd api && npm run admin -- content-json ../content/pubs.yaml /tmp/out.json`.

## Search anywhere

The search box finds any UK town, area or postcode (postcodes.io). The first
search in a new area imports its pubs from OpenStreetMap in the background
(about 30 to 60 seconds), using the `importer` Lambda, which runs outside the
private network so no NAT gateway is needed. Areas are 4 km tiles, re-imported
at most every 30 days. UK only, and the import route is throttled.

## Photos

- Visitors who have left a review can add photos from the pub page. Photos are
  shrunk on the phone (which also strips GPS data) and uploaded straight to S3.
- Nothing appears until approved:
  `AWS_PROFILE=sandpit ./scripts/photos.sh list`, then `approve <id>` or `reject <id>`.
  Unreviewed uploads are deleted after 14 days.
- Free photos from Wikimedia Commons are added automatically during pub imports
  when OpenStreetMap links the pub to one (directly or through Wikidata). Only
  CC0, CC BY, CC BY-SA and public domain photos are used, credited with author
  and licence and linked to their Commons page. Shown after our own photos and uploads.
  A copy of each is saved in our photos bucket (`public/wikimedia/`) by the importer
  Lambda, so the site does not depend on Wikimedia; each deploy catches up any
  missing copies, and photos deleted on Wikimedia are dropped.
- Our own photos: add them to `content/photos/` and list them in `content/pubs.yaml`
  (see `content/photos/README.md`). They go live on the next deploy.

## Layout

| Folder | What it is |
| --- | --- |
| `db/` | Postgres schema, plus fake reviews for local development |
| `api/` | TypeScript API. Runs as a local server or as AWS Lambda |
| `web/` | Next.js frontend, built as a static site |
| `infra/` | Terraform for AWS (eu-west-2) |
| `scripts/` | Import pubs from OpenStreetMap |

## Architecture

```
Browser -> CloudFront -> S3 (static Next.js export)
Browser -> API Gateway (checks Cognito token on writes) -> Lambda -> RDS Postgres
```

- Lambda and RDS sit in private subnets with no internet or NAT gateway.
- Pubs come from OpenStreetMap and are imported into the database. Only ratings are user generated.
- `GET /pubs` and `GET /pubs/{id}` are public. Anything under `/pubs/{id}/review` needs sign-in.

## Run it locally

Needs Node 22 and Docker.

```bash
docker compose up -d
cd api && npm ci
PGPASSWORD=postgres npm run admin -- migrate
docker compose exec -T db psql -U postgres -d pickapub < ../db/dev_seed.sql
PGPASSWORD=postgres npm run dev            # API on :4000
```

```bash
cd web && npm ci
cp .env.example .env.development.local
npm run dev                                # site on :3000
```

Locally you are signed in as a fake user (`NEXT_PUBLIC_DEV_USER`), so you can post reviews without Cognito.

## Deploy to AWS

Needs the AWS CLI v2 (signed in to your own account), Terraform 1.6+ and Node 22.

```bash
./scripts/deploy.sh
```

It shows which AWS account it is about to use and asks before doing anything.
The first run asks for a sign-in page prefix (e.g. `pickapub-morgan`) and takes
10 to 15 minutes, mostly creating the database. It then:

1. builds the API and runs `terraform apply` (Terraform shows the plan and asks again)
2. creates the database tables
3. imports pubs for every area in `web/lib/areas.json` from OpenStreetMap
4. builds the site with the live API and sign-in settings, uploads it to S3 and clears the CloudFront cache
5. prints the site URL

Run the same command to deploy changes. Use `--skip-pubs` to skip the pub import.
To pick an AWS profile: `AWS_PROFILE=personal ./scripts/deploy.sh`.

To take it all down (deletes the database): `terraform -chdir=infra destroy`.

## Known gaps

- [ ] Terraform passes `validate` against the real AWS provider but has not been applied yet.
- [ ] Cognito sign-in has not been tested against a live user pool.
- [ ] The OpenStreetMap import has not been run. Check the pub list it produces before importing.
- [ ] The database password is a Lambda environment variable and sits in Terraform state. Move state to S3 (see `infra/versions.tf`) and consider Secrets Manager.
- [ ] No moderation yet: no report button, no admin delete, no per-user rate limit beyond API Gateway throttling.
- [ ] No privacy policy or delete-my-account flow (needed under UK GDPR before real users sign up).
- [ ] No CI/CD. A GitHub Actions workflow for steps 1, 2 and 5 is the natural next piece.

## Cost

The always-on cost is the RDS instance (`db.t4g.micro`). Everything else is
pay-per-use and close to zero at low traffic. Run `terraform destroy` when you are
not using it, and set an AWS Budgets alert.
