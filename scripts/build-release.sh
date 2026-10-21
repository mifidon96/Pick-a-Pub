#!/usr/bin/env bash
# Builds the release: the Lambda bundles (api/dist) and the website (web/out).
# The same build is deployed to every environment (build once, promote), so
# nothing environment-specific goes in:
#   - API address and Cognito pool: deploy.sh writes them to /config.js
#   - Site address (share previews): a placeholder that deploy.sh replaces
#
#   ./scripts/build-release.sh
#
# GitHub Actions runs this once per merge and deploys the result to dev, then
# prod. deploy.sh runs it too when deploying from a laptop.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export SITE_URL_PLACEHOLDER="https://site-url.pickapub.invalid"

echo "==> Building the API"
(cd "$ROOT/api" && npm ci --no-audit --no-fund && npm run build)

echo "==> Building the website"
(
  cd "$ROOT/web"
  npm ci --no-audit --no-fund
  # Set to empty so nothing from a local .env file ends up in the release.
  NEXT_PUBLIC_DEV_USER="" \
  NEXT_PUBLIC_API_URL="" \
  NEXT_PUBLIC_COGNITO_AUTHORITY="" \
  NEXT_PUBLIC_COGNITO_CLIENT_ID="" \
  NEXT_PUBLIC_SITE_URL="$SITE_URL_PLACEHOLDER" \
  npm run build
)

if grep -rqE "dev-user-[0-9]" "$ROOT/web/out"; then
  echo "Error: the build contains the local dev user; check web/.env* files" >&2
  exit 1
fi
grep -rq "site-url.pickapub.invalid" "$ROOT/web/out" \
  || { echo "Error: the site address placeholder is missing from the build" >&2; exit 1; }

# Record what was built, so each environment can show which commit it runs.
commit="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
printf '{"commit":"%s","built":"%s"}\n' "$commit" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$ROOT/web/out/version.json"
echo "Built release $commit"
