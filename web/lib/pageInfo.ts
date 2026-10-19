"use client";

import { useEffect } from "react";

// Pages like /pub/?id= are one static page for every pub, so their title and
// description are set in the browser once the data has loaded.
export function usePageInfo(info: { title: string; description: string } | null) {
  const title = info?.title;
  const description = info?.description;
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
