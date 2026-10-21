"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { apiUrl } from "@/lib/config";

// Cookie-free page count: sends the page and the referring site, nothing else.
// The server keeps no IP address and no lasting ID (see db/schema.sql, page_views).
// Respects the browser's Do Not Track setting.
function Counter() {
  const path = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  useEffect(() => {
    if (navigator.doNotTrack === "1") return;
    const app = window.matchMedia("(display-mode: standalone)").matches;
    const body = JSON.stringify({ path: `${path}${query ? `?${query}` : ""}`, referrer: document.referrer, app });
    // text/plain keeps it a simple request: no CORS preflight.
    const blob = new Blob([body], { type: "text/plain" });
    const url = `${apiUrl()}/events`;
    if (!navigator.sendBeacon?.(url, blob)) {
      fetch(url, { method: "POST", body, headers: { "content-type": "text/plain" }, keepalive: true }).catch(() => {});
    }
  }, [path, query]);
  return null;
}

export default function PageCount() {
  return (
    <Suspense fallback={null}>
      <Counter />
    </Suspense>
  );
}
