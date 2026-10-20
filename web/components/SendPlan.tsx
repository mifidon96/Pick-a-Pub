"use client";

import { useState } from "react";
import type { Fixture, Pub } from "@/lib/api";

// "Send the plan to the group": the match, kick-off, channel and pub in one
// message for the group chat. Uses the phone's share sheet where there is one,
// otherwise opens WhatsApp.
export function planText(f: Fixture, pub: Pub, origin: string) {
  const when = new Date(f.kickoff).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
  });
  const where = [pub.name, pub.address].filter(Boolean).join(", ");
  const rating = pub.stars !== null ? ` (${pub.stars.toFixed(1)} stars for football)` : "";
  return [
    `${f.home_name} v ${f.away_name}`,
    `${when}, ${f.channel_name}`,
    `Watching at ${where}${rating}`,
    `${origin}/pub/?id=${pub.id}`,
  ].join("\n");
}

export default function SendPlan({ fixture, pub }: { fixture: Fixture; pub: Pub }) {
  const [sent, setSent] = useState(false);

  async function send() {
    const text = planText(fixture, pub, window.location.origin);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        setSent(true);
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // they closed the share sheet
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    setSent(true);
  }

  return (
    <button
      type="button"
      onClick={send}
      className="inline-flex items-center gap-2 rounded border border-pitch px-3 py-1.5 text-sm font-medium text-pitch"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 2 11 13" />
        <path d="M22 2 15 22l-4-9-9-4 20-7z" />
      </svg>
      {sent ? "Plan sent" : "Send the plan to the group"}
    </button>
  );
}
