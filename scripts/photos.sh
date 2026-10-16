#!/usr/bin/env bash
# Review uploaded photos before they go public.
#
#   AWS_PROFILE=sandpit ./scripts/photos.sh list            photos waiting, with private preview links
#   AWS_PROFILE=sandpit ./scripts/photos.sh approve <id>    make it public on the pub page
#   AWS_PROFILE=sandpit ./scripts/photos.sh reject <id>     delete it
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export AWS_PAGER=""
FN="$(terraform -chdir="$ROOT/infra" output -raw admin_function)"

invoke() {
  local out; out="$(mktemp)"
  local err
  err="$(aws lambda invoke --function-name "$FN" --cli-binary-format raw-in-base64-out \
    --payload "$1" --query FunctionError --output text "$out")"
  if [[ "$err" != "None" ]]; then cat "$out"; echo; rm -f "$out"; exit 1; fi
  cat "$out"; rm -f "$out"
}

case "${1:-}" in
  list)
    invoke '{"action":"list_pending_photos"}' | node -e '
      let d=""; process.stdin.on("data", c => d += c).on("end", () => {
        const { pending } = JSON.parse(d);
        if (!pending.length) return console.log("No photos waiting.");
        for (const p of pending) console.log(`\n${p.id}\n  ${p.pub} (by ${p.uploader ?? "unknown"}, ${p.uploaded.slice(0, 10)})\n  Preview (1 hour): ${p.preview}`);
        console.log(`\n${pending.length} waiting. Approve with: ./scripts/photos.sh approve <id>`);
      });'
    ;;
  approve|reject)
    [[ "${2:-}" =~ ^[0-9a-f-]{36}$ ]] || { echo "Usage: $0 $1 <photo id>"; exit 1; }
    invoke "{\"action\":\"${1}_photo\",\"id\":\"$2\"}"; echo
    ;;
  *)
    echo "Usage: $0 list | approve <id> | reject <id>"; exit 1 ;;
esac
