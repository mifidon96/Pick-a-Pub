"use client";

import type { Pub } from "@/lib/types";

// Most people pick a pub because "mates decide", so make it easy to drop one into a group chat.
export default function ShareButton({ pub }: { pub: Pub }) {
  function share() {
    const url = window.location.href;
    const rating = pub.stars !== null ? ` (${pub.stars.toFixed(1)}★ for watching football)` : "";
    const text = `${pub.name}${rating}`;
    if (navigator.share) {
      navigator.share({ title: pub.name, text, url }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank", "noopener");
    }
  }
  return (
    <button onClick={share} className="h-12 rounded-xl border border-pitch px-4 text-sm font-semibold text-pitch hover:bg-pitch/10">
      Share with mates
    </button>
  );
}
