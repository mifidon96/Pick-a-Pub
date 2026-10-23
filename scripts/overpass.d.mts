import type { OsmElement } from "./osm-to-pub.mjs";
export const OVERPASS_SERVERS: string[];
export function overpass(
  query: string,
  opts?: {
    fetchFn?: typeof fetch;
    servers?: string[];
    waitMs?: number;
    log?: (m: string) => void;
    /** Give up by this time (ms since 1970). */
    deadline?: number;
    now?: () => number;
  },
): Promise<OsmElement[]>;
