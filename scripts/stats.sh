#!/usr/bin/env bash
# Visitors, page views, top pages and new reviews (cookie-free counts).
#
#   AWS_PROFILE=personal ./scripts/stats.sh         last 7 days
#   AWS_PROFILE=personal ./scripts/stats.sh 30      last 30 days
#
# Works on prod. For dev: PICKAPUB_ENV=dev ./scripts/stats.sh
set -euo pipefail
export AWS_PAGER=""
DAYS="${1:-7}"
[[ "$DAYS" =~ ^[0-9]+$ ]] || { echo "Give a number of days, e.g. $0 30" >&2; exit 1; }
out="$(mktemp)"
aws lambda invoke --function-name "pickapub-${PICKAPUB_ENV:-prod}-admin" --cli-binary-format raw-in-base64-out \
  --payload "{\"action\":\"stats\",\"days\":$DAYS}" "$out" >/dev/null
node -e '
  const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (s.errorMessage) { console.error(s.errorMessage); process.exit(1); }
  console.log(`\nLast ${s.days} days: ${s.visitors} visitors, ${s.page_views} page views, ${s.app_percent ?? 0}% from the app`);
  console.log(`New reviews: ${s.reviews}   New reviewers: ${s.new_reviewers}\n`);
  console.log("By day");
  for (const d of s.by_day) console.log(`  ${d.day}  ${String(d.visitors).padStart(5)} visitors  ${String(d.views).padStart(6)} views`);
  console.log("\nTop pages");
  for (const p of s.top_pages) console.log(`  ${String(p.views).padStart(6)}  ${p.path}${p.pub ? `  (${p.pub})` : ""}`);
  if (s.referrers.length) {
    console.log("\nCame from");
    for (const r of s.referrers) console.log(`  ${String(r.views).padStart(6)}  ${r.referrer}`);
  }
' "$out"
rm -f "$out"
