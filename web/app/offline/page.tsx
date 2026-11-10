import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };

// Shown by the service worker when there is no connection and the page was not saved.
export default function OfflinePage() {
  return (
    <div className="space-y-3 text-sm">
      <h1 className="text-2xl font-bold">You are offline</h1>
      <p>Pick-a-Pub needs a connection to find pubs and ratings. Pages you opened recently still work.</p>
      <Link href="/" className="inline-flex h-12 items-center rounded-xl bg-pitch px-5 font-bold text-on-pitch">Try again</Link>
    </div>
  );
}
