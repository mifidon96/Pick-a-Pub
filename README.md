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

Edit the file and merge to main (or `./scripts/deploy.sh --env prod --skip-pubs`). The file is the source of
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
| `scripts/` | Deploy, one-off account setup, pub import, photo moderation |
| `.github/workflows/` | CI on pull requests, deploy on merge |

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

Two environments, **dev** and **prod**, each a full copy of the stack
(`infra/envs/<env>.tfvars`). Terraform state lives in S3, one file per environment.

### One-off account setup

Needs the AWS CLI v2 (signed in to your account), Terraform 1.10+, Node 22 and,
ideally, the GitHub CLI (`gh auth login`).

```bash
AWS_PROFILE=personal ./scripts/bootstrap.sh
```

This creates (`infra/bootstrap/`):

- the state bucket `pickapub-tfstate-<account id>` (versioned, encrypted, HTTPS only)
- GitHub Actions sign-in to AWS with OIDC, so no AWS keys are stored in GitHub
- three roles: `pickapub-github-plan` (read-only, pull requests),
  `pickapub-github-deploy-dev` and `pickapub-github-deploy-prod`
- a monthly budget alert (25 USD)

With `gh` it also sets up the repo: the `AWS_ACCOUNT_ID` variable, the
`ALERT_EMAIL` secret, and the `dev` and `prod` environments (prod needs your
approval; both deploy from `main` only). Without `gh` it prints the steps.

### Day to day: GitHub Actions

| When | What runs |
| --- | --- |
| Pull request | API tests, star rating tests, site lint and build, Terraform fmt and validate, Terraform plan against prod |
| Merge to main | The same checks, then deploy to **dev**, then wait for you to approve **prod** in the Actions tab |
| Actions > Deploy > Run workflow | Same, with an option to re-import pubs |
| Actions > Tear down dev > Run workflow | Destroys dev to save money. The next deploy recreates it |

### From your laptop

```bash
AWS_PROFILE=personal ./scripts/deploy.sh --env dev
AWS_PROFILE=personal ./scripts/deploy.sh --env prod
```

It shows the account and environment and asks before doing anything. It then:

1. builds the API and runs `terraform apply` (Terraform shows the plan and asks again)
2. creates or updates the database tables
3. imports pubs from OpenStreetMap (`--skip-pubs` skips this, except on an empty database)
4. copies Wikimedia photos, uploads `content/photos/` and applies `content/pubs.yaml`
5. builds the site with the live API and sign-in settings, uploads it and clears the CloudFront cache
6. prints the site and dashboard URLs

### Monitoring

Each environment has a CloudWatch dashboard (URL printed by the deploy) and
alarms emailed to `ALERT_EMAIL`: Lambda errors, API throttles, API 5xx, slow API
(p95 over 3 s), and database CPU, memory and storage. AWS emails a confirmation
link the first time; click it or no alarms arrive.

### Custom domain and email

Off until you set it. To switch on:

1. Buy a domain in Route 53 (Domains > Register), e.g. `pickapub.co.uk`. Route 53
   creates the hosted zone for you. (Bought elsewhere? Create a hosted zone in
   Route 53 and point the domain's name servers at it.)
2. In `infra/envs/prod.tfvars` set `domain_name = "pickapub.co.uk"`, and in
   `infra/envs/dev.tfvars` set `domain_name = "dev.pickapub.co.uk"` and
   `hosted_zone_name = "pickapub.co.uk"`. Merge to main.
   Terraform creates the certificate, DNS records, and verifies the domain for
   email (DKIM and DMARC).
3. SES > Account dashboard > Request production access (use case: sign-up codes
   for a small website). AWS usually answers within a day.
4. Then set `use_ses_email = true` in both files and merge. Sign-up and password
   emails now come from `no-reply@<domain>` instead of Cognito's address, without
   the 50-a-day limit.

### Security headers

CloudFront adds a Content-Security-Policy, HSTS, X-Frame-Options, nosniff,
Referrer-Policy and Permissions-Policy to every response (`infra/web.tf`). The
CSP lists every outside site the browser may talk to: add a new service there
or the browser will block it.

### Taking it down

- dev: Actions > Tear down dev, or `terraform -chdir=infra destroy -var-file=envs/dev.tfvars`
  after a dev deploy.
- prod has deletion protection on the database. Set `deletion_protection = false`
  in `infra/envs/prod.tfvars` and deploy before destroying. The photos bucket
  must be emptied first.

## Privacy and moderation

- `/privacy/` explains what is stored and why. Set `CONTACT_EMAIL` in
  `web/lib/site.ts` once you have an address for data requests.
- `/account/` lets a signed-in user download everything held about them (JSON)
  or delete their account: reviews, photos, reports and the Cognito sign-in.
- Every review has a Report link. Three open reports hide the review from the pub
  page and the star rating until you decide:

```bash
AWS_PROFILE=personal ./scripts/moderate.sh list
AWS_PROFILE=personal ./scripts/moderate.sh hide|restore|delete <review id>
```

## Known gaps

- [ ] The database password is a Lambda environment variable and sits in Terraform
  state (S3, encrypted). Secrets Manager needs a VPC endpoint, which costs money.
- [ ] Deleted photos are removed from S3 but CloudFront may serve a cached copy
  at the same (unguessable) address until it expires.
- [ ] The deploy roles use AdministratorAccess. Fine for a personal account; scope
  them down before anyone else can merge to main.

## Cost

The always-on cost is the RDS instance (`db.t4g.micro`), about 12 GBP a month per
environment. Everything else is pay-per-use and close to zero at low traffic, plus
a few pence for alarms. Two environments is roughly 25 GBP a month: tear down dev
when you are not using it.
