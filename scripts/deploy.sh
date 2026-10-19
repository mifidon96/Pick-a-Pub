#!/usr/bin/env bash
# Deploy Pick-a-Pub to AWS. GitHub Actions runs this on every merge to main;
# you can also run it from your laptop.
#
#   ./scripts/deploy.sh --env dev              deploy to dev
#   ./scripts/deploy.sh --env prod             deploy to prod
#
# Options:
#   --skip-pubs   do not re-import pubs from OpenStreetMap (a new, empty database
#                 is always imported)
#   --yes         do not ask before changing anything (used by GitHub Actions)
#
# Needs: aws CLI v2 (signed in), terraform >= 1.10, node 22, npm, and the
# one-off account setup in scripts/bootstrap.sh.
# Use AWS_PROFILE=<name> to pick an account.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INFRA="$ROOT/infra"
ENV=""
SKIP_PUBS=false
YES=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV="${2:-}"; shift 2 ;;
    --skip-pubs) SKIP_PUBS=true; shift ;;
    --yes) YES=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

step() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }
tf_out() { terraform -chdir="$INFRA" output -raw "$1"; }

# Invoke the admin Lambda with a JSON payload file and fail loudly on errors.
admin_invoke() {
  local payload="$1" out
  out="$(mktemp)"
  local fn_error
  fn_error="$(aws lambda invoke --function-name "$(tf_out admin_function)" \
    --cli-binary-format raw-in-base64-out --payload "fileb://$payload" \
    --query FunctionError --output text "$out")"
  cat "$out"; echo
  if [[ "$fn_error" != "None" ]]; then rm -f "$out"; fail "admin Lambda returned an error (see above)"; fi
  rm -f "$out"
}

[[ "$ENV" == "dev" || "$ENV" == "prod" ]] || fail "choose an environment: --env dev or --env prod"

step "Checking tools"
export AWS_PAGER=""
for t in aws terraform node npm; do command -v "$t" >/dev/null || fail "$t is not installed"; done
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' || fail "Node 20 or newer is needed"

step "Checking AWS account"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)" || fail "not signed in to AWS (run: aws configure, or aws sso login)"
ARN="$(aws sts get-caller-identity --query Arn --output text)"
echo "Account: $ACCOUNT"
echo "Identity: $ARN"
echo "Region: eu-west-2"
echo "Environment: $ENV"
if [[ "$YES" == false ]]; then
  read -r -p "Deploy Pick-a-Pub ($ENV) into this account? [y/N] " ok
  [[ "$ok" =~ ^[Yy]$ ]] || fail "cancelled"
fi

STATE_BUCKET="pickapub-tfstate-$ACCOUNT"
aws s3api head-bucket --bucket "$STATE_BUCKET" 2>/dev/null \
  || fail "no state bucket $STATE_BUCKET in this account. Run ./scripts/bootstrap.sh once first."

# The football-data.org key: GitHub Actions passes TF_VAR_football_data_api_key.
# On a laptop, export it first (export TF_VAR_football_data_api_key=...), or the
# match listings are switched off for this deploy.
if [[ -z "${TF_VAR_football_data_api_key:-}" ]]; then
  printf '\033[1;33mNote: TF_VAR_football_data_api_key is not set, so match listings will be off.\033[0m\n'
fi

# Alarm emails: GitHub Actions passes TF_VAR_alert_email. On a laptop, reuse the
# address given to bootstrap.sh.
if [[ -z "${TF_VAR_alert_email:-}" && -f "$INFRA/bootstrap/terraform.tfvars" ]]; then
  TF_VAR_alert_email="$(sed -n 's/^alert_email *= *"\(.*\)"/\1/p' "$INFRA/bootstrap/terraform.tfvars")"
  export TF_VAR_alert_email
fi

step "Building the API"
(cd "$ROOT/api" && npm ci --no-audit --no-fund && npm run build)

step "Creating or updating AWS resources (first run takes 10 to 15 minutes, mostly the database)"
terraform -chdir="$INFRA" init -input=false -reconfigure \
  -backend-config="bucket=$STATE_BUCKET" -backend-config="key=$ENV/terraform.tfstate"
APPROVE=(); [[ "$YES" == true ]] && APPROVE=(-auto-approve)
terraform -chdir="$INFRA" apply -input=false -var-file="envs/$ENV.tfvars" ${APPROVE[@]+"${APPROVE[@]}"}

step "Waiting for the Lambdas to be ready"
aws lambda wait function-updated-v2 --function-name "$(tf_out admin_function)"
aws lambda wait function-updated-v2 --function-name "$(tf_out importer_function)"

step "Setting up the app's database login (IAM, no password)"
# The master password goes to the admin Lambda for this one call only. It is
# never printed and the payload file is removed straight away.
tmp="$(mktemp)"; chmod 600 "$tmp"
terraform -chdir="$INFRA" output -raw db_master_password \
  | node -e 'let p="";process.stdin.on("data",c=>p+=c).on("end",()=>process.stdout.write(JSON.stringify({action:"setup_db_user",master_password:p})))' > "$tmp"
admin_invoke "$tmp"; rm -f "$tmp"

step "Creating or updating database tables"
tmp="$(mktemp)"; echo '{"action":"migrate"}' > "$tmp"
admin_invoke "$tmp"; rm -f "$tmp"

if [[ "$SKIP_PUBS" == true ]]; then
  tmp="$(mktemp)"; echo '{"action":"pub_count"}' > "$tmp"
  aws lambda invoke --function-name "$(tf_out admin_function)" --cli-binary-format raw-in-base64-out \
    --payload "fileb://$tmp" "$tmp.out" >/dev/null
  if grep -q '"pubs":0' "$tmp.out"; then
    echo "The database has no pubs yet, so importing them anyway."
    SKIP_PUBS=false
  fi
  rm -f "$tmp" "$tmp.out"
fi

if [[ "$SKIP_PUBS" == false ]]; then
  step "Importing pubs for every area from OpenStreetMap"
  # A busy OpenStreetMap should not stop the deploy: existing pubs stay as they are.
  if (cd "$ROOT" && node scripts/import-osm-pubs.mjs); then
    admin_invoke "$ROOT/pubs.json"
  else
    printf '\033[1;33mWarning: could not reach OpenStreetMap, so pubs were not refreshed. Carrying on; run a full deploy later.\033[0m\n'
  fi
fi

step "Copying Wikimedia photos into our bucket"
tmp="$(mktemp)"
aws lambda invoke --function-name "$(tf_out importer_function)" --cli-binary-format raw-in-base64-out \
  --payload '{"copy_photos":true}' --cli-read-timeout 150 "$tmp" >/dev/null && cat "$tmp" && echo
rm -f "$tmp"

step "Refreshing upcoming matches (needs TF_VAR_football_data_api_key)"
tmp="$(mktemp)"
aws lambda invoke --function-name "$(tf_out importer_function)" --cli-binary-format raw-in-base64-out \
  --payload '{"fixtures":true}' --cli-read-timeout 60 "$tmp" >/dev/null && cat "$tmp" && echo \
  || echo "Could not refresh matches; the 6-hourly schedule will try again."
rm -f "$tmp"

if compgen -G "$ROOT/content/photos/*" >/dev/null; then
  step "Uploading our own photos (content/photos/)"
  aws s3 sync "$ROOT/content/photos" "s3://$(tf_out photos_bucket)/public/editorial/" \
    --exclude "*" --include "*.jpg" --include "*.jpeg" --include "*.png" --include "*.webp" \
    --cache-control "public, max-age=86400" --only-show-errors
fi

step "Loading Pick-a-Pub verdicts and details (content/pubs.yaml)"
tmp="$(mktemp)"
(cd "$ROOT/api" && node dist/admin-cli.js content-json "$ROOT/content/pubs.yaml" "$tmp")
admin_invoke "$tmp"; rm -f "$tmp"

step "Building the website"
(
  cd "$ROOT/web"
  npm ci --no-audit --no-fund
  # Make sure no local dev settings (fake user, localhost API) end up in the live site.
  NEXT_PUBLIC_DEV_USER="" \
  NEXT_PUBLIC_SITE_URL="$(tf_out site_url)" \
  NEXT_PUBLIC_API_URL="$(tf_out api_url)" \
  NEXT_PUBLIC_COGNITO_AUTHORITY="$(tf_out cognito_authority)" \
  NEXT_PUBLIC_COGNITO_CLIENT_ID="$(tf_out cognito_client_id)" \
  npm run build
)
if grep -rqE "dev-user-[0-9]|localhost:4000" "$ROOT/web/out"; then
  fail "the build still contains local dev settings; check web/.env* files"
fi

step "Writing sitemap.xml and robots.txt"
node "$ROOT/scripts/sitemap.mjs" "$(tf_out api_url)" "$(tf_out site_url)" "$ROOT/web/out" \
  || echo "Could not write the sitemap; carrying on."

step "Uploading the website"
aws s3 sync "$ROOT/web/out" "s3://$(tf_out web_bucket)" --delete --only-show-errors
aws cloudfront create-invalidation --distribution-id "$(tf_out cloudfront_distribution_id)" \
  --paths '/*' --query Invalidation.Id --output text >/dev/null

step "Checking the API"
curl -fsS "$(tf_out api_url)/pubs?lat=51.4431&lng=-0.1525" | head -c 300; echo

step "Done"
echo "Site ($ENV): $(tf_out site_url)"
echo "Dashboard: $(tf_out dashboard_url)"
echo "It can take a few minutes for CloudFront to serve the new version."
