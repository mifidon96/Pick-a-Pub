import type { OsmElement } from "./osm-to-pub.mjs";
export const OVERPASS_SERVERS: string[];
export function overpass(
  query: string,
  opts?: { fetchFn?: typeof fetch; servers?: string[]; waitMs?: number; log?: (m: string) => void },
): Promise<OsmElement[]>;
