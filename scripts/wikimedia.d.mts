import type { OsmElement, PubInput } from "./osm-to-pub.mjs";
export function normaliseTitle(name: string): string | null;
export function commonsFileFromTags(tags?: Record<string, string>): string | null;
export function attachWikimediaPhotos(pubs: PubInput[], elements: OsmElement[], fetchFn?: typeof fetch): Promise<number>;
