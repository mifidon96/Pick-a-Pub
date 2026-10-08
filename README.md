# Pick-a-Pub

Find a pub near you that is good for watching football. Pubs are scored by people
who watched a match there. Launch area: Balham.

## What gets rated

Scored 1 to 5: TVs, sightlines, atmosphere, seating, drinks, bar service, food (optional).
Overall score weights: TVs 25%, sightlines 20%, atmosphere 20%, seating 15%, drinks 10%, service 10%.
Food is shown but not counted. Change the weights in `db/schema.sql` (`pub_scores` view).

Yes/no facts: commentary on, Sky, TNT, Amazon, bookable tables, outdoor screen,
away fans welcome, family friendly, step-free. A fact shows when at least half of
the people who answered said yes.

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
PGPASSWORD=postgres psql -h localhost -U postgres -d pickapub -f ../db/dev_seed.sql
PGPASSWORD=postgres npm run dev            # API on :4000
```

```bash
cd web && npm ci
cp .env.example .env.development.local
npm run dev                                # site on :3000
```

Locally you are signed in as a fake user (`NEXT_PUBLIC_DEV_USER`), so you can post reviews without Cognito.

## Deploy to AWS

```bash
# 1. Build the Lambda bundle
cd api && npm ci && npm run build

# 2. Create the infrastructure
cd ../infra
cp example.tfvars terraform.tfvars         # set cognito_domain_prefix
terraform init && terraform apply

# 3. Create the tables
aws lambda invoke --function-name pickapub-admin --cli-binary-format raw-in-base64-out \
  --payload '{"action":"migrate"}' /dev/stdout

# 4. Import Balham pubs
cd .. && node scripts/import-osm-pubs.mjs
aws lambda invoke --function-name pickapub-admin --cli-binary-format raw-in-base64-out \
  --payload file://pubs.json /dev/stdout

# 5. Build and upload the site
cd web && npm ci
NEXT_PUBLIC_API_URL=$(terraform -chdir=../infra output -raw api_url) \
NEXT_PUBLIC_COGNITO_AUTHORITY=$(terraform -chdir=../infra output -raw cognito_authority) \
NEXT_PUBLIC_COGNITO_CLIENT_ID=$(terraform -chdir=../infra output -raw cognito_client_id) \
npm run build
aws s3 sync out "s3://$(terraform -chdir=../infra output -raw web_bucket)" --delete
aws cloudfront create-invalidation \
  --distribution-id "$(terraform -chdir=../infra output -raw cloudfront_distribution_id)" --paths "/*"

terraform -chdir=../infra output site_url
```

## Known gaps

- [ ] Terraform has been syntax checked only. It has not been through `terraform validate` or applied.
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
