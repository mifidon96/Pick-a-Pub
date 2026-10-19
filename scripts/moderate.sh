#!/usr/bin/env bash
# Deal with reported reviews.
#
#   AWS_PROFILE=personal ./scripts/moderate.sh list            reviews with open reports
#   AWS_PROFILE=personal ./scripts/moderate.sh hide <id>       keep it hidden, close the reports
#   AWS_PROFILE=personal ./scripts/moderate.sh restore <id>    show it again, close the reports
#   AWS_PROFILE=personal ./scripts/moderate.sh delete <id>     delete the review for good
#
# Three open reports hide a review automatically until you decide.
# Works on prod. For dev: PICKAPUB_ENV=dev ./scripts/moderate.sh list
set -euo pipefail
export AWS_PAGER=""
FN="pickapub-${PICKAPUB_ENV:-prod}-admin"

invoke() {
  local out; out="$(mktemp)"
  local err
  err="$(aws lambda invoke --function-name "$FN" --cli-binary-format raw-in-base64-out \
    --payload "$1" --query FunctionError --output text "$out")"
  if [[ "$err" != "None" ]]; then cat "$out"; echo; rm -f "$out"; exit 1; fi
  cat "$out"; rm -f "$out"
}

id_arg() { [[ "${1:-}" =~ ^[0-9]+$ ]] || { echo "Give a review id, e.g. $0 hide 42" >&2; exit 1; }; echo "$1"; }

case "${1:-}" in
  list)
    invoke '{"action":"list_reports"}' | node -e '
      let d=""; process.stdin.on("data", c => d += c).on("end", () => {
        const { reports } = JSON.parse(d);
        if (!reports.length) return console.log("No open reports.");
        for (const r of reports) {
          console.log(`\nReview ${r.id} at ${r.pub} by ${r.author}${r.hidden ? " (hidden)" : ""}, ${r.reports} report(s)`);
          if (r.comment) console.log(`  "${r.comment}"`);
          for (const why of r.reasons) console.log(`  - ${why}`);
        }
        console.log("\nDecide with: ./scripts/moderate.sh hide|restore|delete <id>");
      });'
    ;;
  hide) invoke "{\"action\":\"hide_review\",\"id\":$(id_arg "${2:-}")}"; echo ;;
  restore) invoke "{\"action\":\"restore_review\",\"id\":$(id_arg "${2:-}")}"; echo ;;
  delete) invoke "{\"action\":\"delete_review\",\"id\":$(id_arg "${2:-}")}"; echo ;;
  *) sed -n '2,10p' "$0"; exit 1 ;;
esac
