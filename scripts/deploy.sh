#!/usr/bin/env bash
# Deploy Pick-a-Pub to AWS from your laptop.
#
#   ./scripts/deploy.sh              full deploy (first time and every time after)
#   ./scripts/deploy.sh --skip-pubs  same, but do not re-import pubs from OpenStreetMap
#
# Needs: aws CLI v2 (signed in), terraform >= 1.6, node 22, npm.
# Use AWS_PROFILE=<name> to pick an account. The script shows which account it
# will deploy to and asks before changing anything.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INFRA="$ROOT/infra"
SKIP_PUBS=false
[[ "${1:-}" == "--skip-pubs" ]] && SKIP_PUBS=true

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
read -r -p "Deploy Pick-a-Pub into this account? [y/N] " ok
[[ "$ok" =~ ^[Yy]$ ]] || fail "cancelled"

if [[ ! -f "$INFRA/terraform.tfvars" ]]; then
  step "First run: choosing a name for the sign-in page"
  echo "Pick a prefix for the sign-in page, e.g. pickapub-morgan."
  echo "It becomes https://<prefix>.auth.eu-west-2.amazoncognito.com and must be unique."
  read -r -p "Prefix: " prefix
  [[ "$prefix" =~ ^[a-z0-9-]{3,60}$ ]] || fail "use 3 to 60 lowercase letters, numbers or dashes"
  printf 'cognito_domain_prefix = "%s"\n' "$prefix" > "$INFRA/terraform.tfvars"
fi

step "Building the API"
(cd "$ROOT/api" && npm ci --no-audit --no-fund && npm run build)

step "Creating or updating AWS resources (first run takes 10 to 15 minutes, mostly the database)"
terraform -chdir="$INFRA" init -input=false
terraform -chdir="$INFRA" apply

step "Waiting for the Lambdas to be ready"
aws lambda wait function-updated-v2 --function-name "$(tf_out admin_function)"
aws lambda wait function-updated-v2 --function-name "$(tf_out importer_function)"

step "Creating or updating database tables"
tmp="$(mktemp)"; echo '{"action":"migrate"}' > "$tmp"
admin_invoke "$tmp"; rm -f "$tmp"

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
  NEXT_PUBLIC_API_URL="$(tf_out api_url)" \
  NEXT_PUBLIC_COGNITO_AUTHORITY="$(tf_out cognito_authority)" \
  NEXT_PUBLIC_COGNITO_CLIENT_ID="$(tf_out cognito_client_id)" \
  npm run build
)
if grep -rqE "dev-user-[0-9]|localhost:4000" "$ROOT/web/out"; then
  fail "the build still contains local dev settings; check web/.env* files"
fi

step "Uploading the website"
aws s3 sync "$ROOT/web/out" "s3://$(tf_out web_bucket)" --delete --only-show-errors
aws cloudfront create-invalidation --distribution-id "$(tf_out cloudfront_distribution_id)" \
  --paths '/*' --query Invalidation.Id --output text >/dev/null

step "Checking the API"
curl -fsS "$(tf_out api_url)/pubs?lat=51.4431&lng=-0.1525" | head -c 300; echo

step "Done"
echo "Site: $(tf_out site_url)"
echo "It can take a few minutes for CloudFront to serve the new version."
