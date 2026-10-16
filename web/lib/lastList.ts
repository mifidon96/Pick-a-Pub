// Remembers the pub list the visitor was last on (area, sort, filters), so
// "Back to pubs" returns there however they moved between pub and review pages.
// Per-browser convenience only: if storage is unavailable it falls back to "/".
const KEY = "pickapub:lastList";

export function saveLastList(url: string) {
  try {
    sessionStorage.setItem(KEY, url);
  } catch {
    /* storage blocked: ignore */
  }
}

export function lastList(): string {
  try {
    const v = sessionStorage.getItem(KEY);
    return v && v.startsWith("/") && !v.startsWith("//") ? v : "/";
  } catch {
    return "/";
  }
}
