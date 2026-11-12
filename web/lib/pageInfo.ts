"use client";

import { useEffect } from "react";

// Pages like /pub/?id= are one static page for every pub, so their title and
// description are set in the browser once the data has loaded.
// canonical: the address search engines should file this page under (a pub's
// own page at /pubs/<name>-<id>/, built by the admin Lambda).
export function usePageInfo(info: { title: string; description: string; canonical?: string | null } | null) {
  const title = info?.title;
  const description = info?.description;
  const canonical = info?.canonical;
  useEffect(() => {
    if (!canonical) return;
    const link = document.createElement("link");
    link.rel = "canonical";
    link.href = new URL(canonical, window.location.origin).href;
    document.head.appendChild(link);
    return () => link.remove();
  }, [canonical]);
  useEffect(() => {
    if (!title) return;
    const before = document.title;
    document.title = `${title} | Pick-a-Pub`;
    const meta = document.querySelector('meta[name="description"]');
    const beforeDesc = meta?.getAttribute("content");
    if (meta && description) meta.setAttribute("content", description);
    return () => {
      document.title = before;
      if (meta && beforeDesc) meta.setAttribute("content", beforeDesc);
    };
  }, [title, description]);
}
