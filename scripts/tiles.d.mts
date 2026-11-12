export const TILE_IMPORT_RADIUS_M: number;
export const TILE_MAX_AGE_DAYS: number;
export function inUk(lat: number, lng: number): boolean;
export function tileFor(lat: number, lng: number): { tile: string; lat: number; lng: number };
