import type { OsmElement, PubInput } from "./osm-to-pub.mjs";
export const BATCH: number;
export function featureToElement(feature: unknown): OsmElement | null;
export function readPubs(lines: AsyncIterable<string> | Iterable<string>): Promise<{ elements: OsmElement[]; pubs: PubInput[]; tiles: { tile: string; pub_count: number }[] }>;
