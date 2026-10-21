#!/usr/bin/env bash
# Quick checks that a deployed environment works. Run after every deploy:
#
#   ./scripts/smoke.sh <site_url> <api_url>
#
# deploy-env.yml runs it after each deploy. If dev fails, prod never starts.
# Retries a few times because CloudFront can take a minute to serve new files.
set -uo pipefail

SITE="${1:?usage: smoke.sh <site_url> <api_url>}"
API="${2:?usage: smoke.sh <site_url> <api_url>}"
SITE="${SITE%/}"; API="${API%/}"
failed=0

pass() { printf '\033[32mPASS\033[0m %s\n' "$*"; }
fail() { printf '\033[31mFAIL\033[0m %s\n' "$*"; failed=1; }

# check <name> <url> <expected status> [text the body must contain]
check() {
  local name="$1" url="$2" want="$3" text="${4:-}" body status
  for attempt in 1 2 3 4 5; do
    body="$(curl -sS --max-time 20 -w '\n%{http_code}' "$url" 2>&1)"
    status="${body##*$'\n'}"; body="${body%$'\n'*}"
    if [[ "$status" == "$want" && ( -z "$text" || "$body" == *"$text"* ) ]]; then
      pass "$name ($status)"; return
    fi
    [[ $attempt -lt 5 ]] && sleep 15
  done
  fail "$name: wanted $want${text:+ containing \"$text\"}, got $status"
}

# check_header <name> <url> <header>
check_header() {
  if curl -sSI --max-time 20 "$2" | grep -qi "^$3:"; then pass "$1"; else fail "$1: no $3 header"; fi
}

echo "Site: $SITE"
echo "API:  $API"

check "Home page loads"            "$SITE/"                                      200 "Pick-a-Pub"
check "Pub page loads"             "$SITE/pub/"                                  200
check "PWA manifest is served"     "$SITE/manifest.json"                         200 "Pick-a-Pub"
check_header "Security headers: CSP"  "$SITE/" "content-security-policy"
check_header "Security headers: HSTS" "$SITE/" "strict-transport-security"

check "API: pubs near a point"     "$API/pubs?lat=51.5074&lng=-0.1278"           200 '"pubs"'
check "API: rejects a bad request" "$API/pubs?lat=999&lng=0"                     400
check "API: match listings"        "$API/fixtures"                               200 '"fixtures"'
check "API: account needs sign-in" "$API/me"                                     401

if [[ $failed -ne 0 ]]; then
  echo "Smoke tests failed."
  exit 1
fi
echo "All smoke tests passed."
