import type { ReactNode } from "react";
import { teamName } from "@/lib/ratings";
import type { PubDetail, PubInfo } from "@/lib/types";

// "About this pub": opening hours, facilities, phone, directions.
// Details come from Pick-a-Pub (content/pubs.yaml) and OpenStreetMap.

// Shown in this order. Values are text or yes/no.
const INFO_ROWS: [keyof PubInfo, string][] = [
  ["opening_hours", "Opening hours"],
  ["screens", "Screens"],
  ["drinks", "Drinks"],
  ["beer_garden", "Beer garden"],
  ["booking", "Booking"],
  ["real_ale", "Real ale"],
  ["low_no_alcohol", "Low/no alcohol"],
  ["dog", "Dogs welcome"],
  ["wheelchair", "Wheelchair access"],
  ["shows_sport", "Sport on TV"],
  ["fans", "Whose fans"],
  ["away_fans", "Away fans welcome"],
  ["operator", "Run by"],
  ["notes", "Notes"],
];

export default function PubInfoCard({ pub }: { pub: PubDetail }) {
  const info: PubInfo = pub.info ?? {};
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${pub.lat},${pub.lng}`;
  const rows: [string, ReactNode][] = [];

  for (const [key, label] of INFO_ROWS) {
    const v = info[key];
    if (v === undefined || v === "") continue;
    if (typeof v === "boolean") rows.push([label, v ? "Yes" : "No"]);
    else if (key === "opening_hours") rows.push([label, <span key={key} className="whitespace-pre-line">{formatHours(v)}</span>]);
    else if (key === "fans") rows.push([label, teamName(v) ?? v]);
    else if (key === "wheelchair") rows.push([label, ({ yes: "Yes", limited: "Limited", no: "No" } as Record<string, string>)[v] ?? v]);
    else rows.push([label, v]);
  }
  if (typeof info.phone === "string") {
    rows.push(["Phone", <a key="p" href={`tel:${info.phone.replace(/\s+/g, "")}`} className="text-pitch underline">{info.phone}</a>]);
  }
  const website = typeof info.website === "string" && /^https?:\/\//.test(info.website) ? info.website : null;

  return (
    <section className="space-y-3 rounded-xl border border-line bg-card p-4">
      <h2 className="font-semibold">About this pub</h2>
      {rows.length > 0 ? (
        <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted">No extra details listed for this pub yet.</p>
      )}
      <div className="flex flex-wrap gap-3 text-sm">
        <a href={directions} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-pitch underline">Directions</a>
        {website && (
          <a href={website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center font-semibold text-pitch underline">Website</a>
        )}
      </div>
      <p className="text-xs text-muted">Details from Pick-a-Pub and OpenStreetMap, so check with the pub before you go.</p>
    </section>
  );
}

// OpenStreetMap hours look like "Mo-Th 12:00-23:00; Fr,Sa 12:00-00:00". Make them readable.
const DAYS: Record<string, string> = { Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun", PH: "Bank holidays" };
function formatHours(raw: string): string {
  return raw
    .split(";")
    .map((part) => part.trim().replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => DAYS[d] ?? d).replace(/-/g, " to ").replace(/,/g, ", "))
    .filter(Boolean)
    .join("\n");
}
