// Types for osm-to-pub.mjs, so the API (TypeScript) can reuse the same mapping.
export type OsmElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};
export type PubInput = {
  source: string;
  source_id: string;
  name: string | undefined;
  address: string | null;
  postcode: string | null;
  lat: number | undefined;
  lng: number | undefined;
  info: Record<string, unknown>;
};
export function osmToPub(e: OsmElement): PubInput;
