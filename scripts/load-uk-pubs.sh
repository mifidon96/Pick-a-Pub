#!/usr/bin/env bash
# Loads the batches written by scripts/uk-pubs-batches.mjs into one environment.
# Run by .github/workflows/uk-pubs.yml; can also be run by hand:
#
#   AWS_PROFILE=personal ./scripts/load-uk-pubs.sh <out dir> <dev|prod>
set -euo pipefail

dir="${1:?usage: load-uk-pubs.sh <out dir> <dev|prod>}"
env="${2:?usage: load-uk-pubs.sh <out dir> <dev|prod>}"
[[ "$env" == dev || "$env" == prod ]] || { echo "environment must be dev or prod" >&2; exit 1; }
admin="pickapub-$env-admin"
importer="pickapub-$env-importer"

# Invoke a Lambda with a payload file; fail if the function itself failed.
invoke() {
  local fn="$1" payload="$2" out err
  out="$(mktemp)"
  err="$(aws lambda invoke --function-name "$fn" --cli-binary-format raw-in-base64-out \
    --payload "fileb://$payload" --cli-read-timeout 180 \
    --query FunctionError --output text "$out")"
  if [[ "$err" != "None" && -n "$err" ]]; then
    echo "$fn failed:" >&2; cat "$out" >&2; echo >&2; rm -f "$out"; return 1
  fi
  cat "$out"; echo; rm -f "$out"
}

shopt -s nullglob
batches=("$dir"/pubs-*.json)
(( ${#batches[@]} > 0 )) || { echo "No batches in $dir" >&2; exit 1; }

echo "Loading ${#batches[@]} batches of pubs into $env"
for f in "${batches[@]}"; do
  printf '%s: ' "$(basename "$f")"
  invoke "$admin" "$f"
done

echo "Marking every tile with a pub as imported"
invoke "$admin" "$dir/tiles.json"

# Best effort from here: the pubs are loaded, so a problem below only delays photos or pages.
echo "Copying new Wikimedia photos into our bucket (more are copied on later runs)"
tmp="$(mktemp)"; echo '{"copy_photos":true}' > "$tmp"
invoke "$importer" "$tmp" || echo "Photo copy failed; it will catch up on the next deploy or import."
echo "Rebuilding the pages for search engines"
echo '{"action":"render_pages"}' > "$tmp"
invoke "$admin" "$tmp" || echo "Page rebuild failed; the nightly run will catch up."
rm -f "$tmp"
echo "Done."
