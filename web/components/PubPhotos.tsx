"use client";

import { useRef, useState } from "react";
import { uploadPhoto, type Photo } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { resizePhoto } from "@/lib/resize";

// Photo strip on the pub page, plus "Add a photo" for signed-in visitors.
export default function PubPhotos({ pubId, pubName, photos }: { pubId: number; pubName: string; photos: Photo[] }) {
  const { signedIn, available, headers, signIn } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ busy: boolean; message?: string; error?: string }>({ busy: false });

  async function onFile(file: File | undefined) {
    if (!file) return;
    setState({ busy: true });
    try {
      const image = await resizePhoto(file);
      await uploadPhoto(pubId, image, headers);
      setState({ busy: false, message: "Thanks! Your photo will appear once we have checked it." });
    } catch (e) {
      setState({ busy: false, error: e instanceof Error ? e.message : "Upload failed" });
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section className="space-y-2">
      {photos.length > 0 && (
        <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1" aria-label={`Photos of ${pubName}`}>
          {photos.map((p) => (
            <li key={p.url} className="relative shrink-0 snap-start">
              {/* eslint-disable-next-line @next/next/no-img-element -- static export, no image optimiser */}
              <img src={p.url} alt={`${pubName}`} loading="lazy" className="h-44 w-64 rounded-xl object-cover" />
              {p.credit && (
                <span className="absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
                  {p.link ? (
                    // Wikimedia photos: author and licence, linking to the source page (required by the licence)
                    <a href={p.link} target="_blank" rel="noopener noreferrer" className="underline">
                      Photo: {p.credit}, Wikimedia Commons
                    </a>
                  ) : p.credit === "Pick-a-Pub" ? "Pick-a-Pub" : `by ${p.credit}`}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {available && (
        <div className="text-sm">
          <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <button
            type="button"
            disabled={state.busy}
            onClick={() => (signedIn ? input.current?.click() : signIn())}
            className="inline-flex items-center gap-2 rounded border border-pitch px-3 py-1.5 font-medium text-pitch disabled:opacity-60"
          >
            <CameraIcon /> {state.busy ? "Uploading..." : photos.length ? "Add a photo" : "Add the first photo"}
          </button>
          <p className="mt-1 text-xs text-muted">The screens, the bar, the garden. Please no close-ups of people.</p>
          {state.message && <p className="mt-1 text-xs text-pitch">{state.message}</p>}
          {state.error && <p role="alert" className="mt-1 text-xs text-red-700">{state.error}</p>}
        </div>
      )}
    </section>
  );
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}
