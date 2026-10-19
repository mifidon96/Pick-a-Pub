import Link from "next/link";

// Shown by the service worker when there is no connection and the page was not saved.
export default function OfflinePage() {
  return (
    <div className="space-y-3 text-sm">
      <h1 className="text-2xl font-bold">You are offline</h1>
      <p>Pick-a-Pub needs a connection to find pubs and ratings. Pages you opened recently still work.</p>
      <Link href="/" className="inline-block rounded bg-pitch px-4 py-2 font-medium text-white">Try again</Link>
    </div>
  );
}
