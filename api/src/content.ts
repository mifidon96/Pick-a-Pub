import { parse } from "yaml";

// content/pubs.yaml -> validated entries for the "apply_content" admin action.
// Errors name the entry so they are easy to fix.

export type ContentEntry = {
  pub?: string;            // "osm:node/123", shown at the bottom of each pub page
  name?: string;           // or match by exact name...
  area?: string;           // ...within an area from web/lib/areas.json
  about?: Record<string, string | boolean>;
  verdict?: {
    rating: number;
    summary?: string;
    best_for?: string;
    tip?: string;
    visited?: string;
  };
};

// Details you can set under "about". Shown in this order on the pub page.
export const ABOUT_KEYS = [
  "opening_hours", "screens", "food", "drinks", "beer_garden", "booking",
  "real_ale", "wheelchair", "website", "phone", "operator", "notes",
] as const;

const str = (v: unknown, max: number, where: string): string | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" && typeof v !== "number") throw new Error(`${where} must be text`);
  const s = String(v).trim();
  if (s.length > max) throw new Error(`${where} must be ${max} characters or fewer`);
  return s;
};

export function parseContent(yamlText: string): ContentEntry[] {
  const doc = parse(yamlText) ?? [];
  if (!Array.isArray(doc)) throw new Error("content/pubs.yaml must be a list (each entry starts with '- ')");

  return doc.map((raw, i): ContentEntry => {
    const where = `entry ${i + 1}${raw?.pub ? ` (${raw.pub})` : raw?.name ? ` (${raw.name})` : ""}`;
    if (typeof raw !== "object" || raw === null) throw new Error(`${where} is not a valid entry`);
    const unknown = Object.keys(raw).filter((k) => !["pub", "name", "area", "about", "verdict"].includes(k));
    if (unknown.length) throw new Error(`${where}: unknown field(s) ${unknown.join(", ")}`);

    const entry: ContentEntry = {};
    if (raw.pub) {
      if (!/^[a-z]+:[a-z0-9/]+$/.test(String(raw.pub))) throw new Error(`${where}: pub should look like osm:node/123456`);
      entry.pub = String(raw.pub);
    } else if (raw.name && raw.area) {
      entry.name = str(raw.name, 120, `${where} name`);
      entry.area = str(raw.area, 40, `${where} area`);
    } else {
      throw new Error(`${where}: needs either pub: <id>, or name: and area:`);
    }

    if (raw.about !== undefined) {
      if (typeof raw.about !== "object" || raw.about === null) throw new Error(`${where}: about must be a list of details`);
      const about: Record<string, string | boolean> = {};
      for (const [k, v] of Object.entries(raw.about)) {
        if (!(ABOUT_KEYS as readonly string[]).includes(k)) throw new Error(`${where}: about.${k} is not a known detail (use ${ABOUT_KEYS.join(", ")})`);
        if (typeof v === "boolean") about[k] = v;
        else {
          const s = str(v, 200, `${where} about.${k}`);
          if (s !== undefined) about[k] = s;
        }
      }
      if (typeof about.website === "string" && !/^https:\/\//.test(about.website)) throw new Error(`${where}: about.website must start with https://`);
      entry.about = about;
    }

    if (raw.verdict !== undefined) {
      const v = raw.verdict;
      const rating = Number(v?.rating);
      if (!(rating >= 1 && rating <= 5 && Number.isInteger(rating * 2))) throw new Error(`${where}: verdict.rating must be 1 to 5 in halves (e.g. 4.5)`);
      const visited = str(v.visited, 7, `${where} verdict.visited`);
      if (visited && !/^\d{4}-\d{2}$/.test(visited)) throw new Error(`${where}: verdict.visited must look like 2026-10`);
      entry.verdict = {
        rating,
        summary: str(v.summary, 400, `${where} verdict.summary`),
        best_for: str(v.best_for, 80, `${where} verdict.best_for`),
        tip: str(v.tip, 250, `${where} verdict.tip`),
        visited,
      };
    }
    if (!entry.about && !entry.verdict) throw new Error(`${where}: add about: and/or verdict:`);
    return entry;
  });
}
