#!/usr/bin/env python3
"""Turn the Google Form export into rating weights for the app.

    python3 scripts/survey_weights.py "What makes a good pub for watching football?.csv"

Prints a summary and the SQL to load into the rating_weights table.
Only reads the importance columns: emails and free text are never printed.

Method: a factor's weight is proportional to how far its average importance
sits above 1 ("not important"). The survey did not ask about crowd or service
speed directly, so those two use the estimates below until it does.
"""
import csv, statistics, sys

# survey column prefix -> app category
ASKED = {
    "Being able to see a screen": "sightlines",
    "Screen size": "screens",
    "Getting a seat": "seating",
    "Commentary": "commentary",
    "Drink prices": "drink_prices",
}
# Not asked yet. Estimates (on the same 1-5 importance scale) from the free-text
# answers and the "fast service vs range of drinks" question.
ESTIMATED = {"crowd": 4.25, "service_speed": 3.7}

rows = list(csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")))
cols = list(rows[0])
means = {}
for prefix, cat in ASKED.items():
    col = next(c for c in cols if c.startswith(prefix))
    vals = [int(r[col]) for r in rows if r[col].strip().isdigit()]
    means[cat] = statistics.mean(vals)
means.update(ESTIMATED)

raw = {c: m - 1 for c, m in means.items()}
total = sum(raw.values())
# Whole percentages that add up to exactly 100 (largest remainder).
exact = {c: 100 * v / total for c, v in raw.items()}
pct = {c: int(v) for c, v in exact.items()}
for c in sorted(exact, key=lambda c: exact[c] - pct[c], reverse=True)[: 100 - sum(pct.values())]:
    pct[c] += 1

print(f"-- {len(rows)} responses")
for c in sorted(pct, key=pct.get, reverse=True):
    note = " (estimate)" if c in ESTIMATED else ""
    print(f"--   {c:<14} importance {means[c]:.2f}  weight {pct[c]}%{note}")
print("insert into rating_weights (category, weight) values")
print(",\n".join(f"  ('{c}', {pct[c] / 100:.2f})" for c in sorted(pct, key=pct.get, reverse=True)))
print("on conflict (category) do update set weight = excluded.weight;")
