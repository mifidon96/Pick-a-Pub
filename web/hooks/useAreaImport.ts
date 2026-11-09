import { useEffect, useState } from "react";
import { areaStatus, ensureArea } from "@/lib/api";
import type { Centre } from "@/lib/areas";

// Makes sure a searched-for place has its pubs imported before we list them.
//
// Featured areas are always imported, so they are ready straight away. For
// anywhere else we ask the importer Lambda to start (POST /areas/import), then
// check every 4 seconds. OpenStreetMap is sometimes slow and the importer
// retries by itself (up to 3 tries over a few minutes), so after 25 checks
// (about 100 seconds) we say it's busy and check every 10 seconds instead,
// giving up after about 8 minutes.
const FAST_CHECKS = 25;
const MAX_CHECKS = 63;

type State = { key: string; state: "ready" | "importing" | "failed"; message?: string; busy?: boolean };

export function useAreaImport(centre: Centre) {
  const key = `${centre.lat.toFixed(4)},${centre.lng.toFixed(4)}`;
  const [area, setArea] = useState<State>({ key: "", state: "ready" });

  useEffect(() => {
    if (centre.areaId) return;
    let live = true;
    let checks = 0;
    const check = () =>
      setTimeout(() => {
        areaStatus(centre.lat, centre.lng)
          .then((r) => {
            if (!live) return;
            if (r.status === "ready") setArea({ key, state: "ready" });
            else if (++checks < MAX_CHECKS) {
              if (checks === FAST_CHECKS) setArea({ key, state: "importing", busy: true });
              check();
            } else setArea({ key, state: "failed", message: "OpenStreetMap is still busy. Try again in a few minutes." });
          })
          .catch(() => live && setArea({ key, state: "failed", message: "Could not check this area." }));
      }, checks < FAST_CHECKS ? 4000 : 10000);
    ensureArea(centre.lat, centre.lng)
      .then((r) => {
        if (!live) return;
        setArea({ key, state: r.status });
        if (r.status === "importing") check();
      })
      .catch((e: Error) => live && setArea({ key, state: "failed", message: e.message }));
    return () => {
      live = false;
    };
  }, [centre, key]);

  const featured = Boolean(centre.areaId);
  const current = area.key === key;
  const pending = !featured && (!current || area.state === "importing");
  return {
    ready: featured || (current && area.state === "ready"),
    pending,
    busy: pending && current && Boolean(area.busy), // still going after ~100 seconds
    failed: !featured && current && area.state === "failed" ? area.message : null, // the message to show
  };
}
