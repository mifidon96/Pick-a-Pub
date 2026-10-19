"use client";

import { useEffect, useState } from "react";

// Registers the service worker (public/sw.js) on the live site, and offers
// "Install the app" on phones: Android gets the browser's own prompt, iPhone
// gets the Share > Add to Home Screen tip. Dismissing it is remembered.
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const KEY = "pickapub:installHint";

function dismissed() {
  try {
    return localStorage.getItem(KEY) === "dismissed";
  } catch {
    return false;
  }
}

export default function AppInstall() {
  const [android, setAndroid] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    // Production builds only: `next dev` serves fresh files and a worker would get in the way.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* site works without it */ });
    }

    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone || dismissed()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setAndroid(e as InstallEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const t = setTimeout(() => {
      if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
        setIos(true);
        setHidden(false);
      }
    }, 0);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      clearTimeout(t);
    };
  }, []);

  function close() {
    setHidden(true);
    try {
      localStorage.setItem(KEY, "dismissed");
    } catch {
      /* storage blocked */
    }
  }

  async function install() {
    if (!android) return;
    await android.prompt();
    await android.userChoice;
    close();
  }

  if (hidden || (!android && !ios)) return null;
  return (
    <div className="mx-auto mt-3 flex w-full max-w-3xl items-center gap-3 px-4 text-sm">
      <div className="flex flex-1 items-center gap-3 rounded-xl border border-line bg-card p-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- static export */}
        <img src="/icons/icon-192.png" alt="" className="h-10 w-10 rounded-lg" />
        <p className="flex-1">
          {android ? "Get Pick-a-Pub on your home screen." : <>Add Pick-a-Pub to your home screen: tap <b>Share</b>, then <b>Add to Home Screen</b>.</>}
        </p>
        {android && <button onClick={install} className="rounded bg-pitch px-3 py-1.5 font-medium text-white">Install</button>}
        <button onClick={close} aria-label="Dismiss" className="px-1 text-lg leading-none text-muted">×</button>
      </div>
    </div>
  );
}
