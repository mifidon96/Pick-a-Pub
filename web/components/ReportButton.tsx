"use client";

import { useState } from "react";
import { REPORT_REASONS, reportReview, type ReportReason } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// Small "Report" link under a review. Opens a short form in place.
export default function ReportButton({ reviewId }: { reviewId: number }) {
  const { signedIn, available, headers, signIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | "">("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"" | "sending" | "done">("");
  const [error, setError] = useState("");

  if (!available) return null;
  if (state === "done") return <p className="mt-2 text-xs text-muted">Thanks, we will take a look.</p>;
  if (!open) {
    return (
      <button onClick={() => (signedIn ? setOpen(true) : signIn())} className="mt-2 text-xs text-muted underline">
        Report
      </button>
    );
  }

  async function send() {
    if (!reason) return;
    setState("sending");
    setError("");
    try {
      await reportReview(reviewId, reason, note, headers);
      setState("done");
    } catch (e) {
      setError((e as Error).message);
      setState("");
    }
  }

  return (
    <div className="mt-3 space-y-2 rounded border border-line p-3 text-xs">
      <p className="font-medium">What is wrong with this review?</p>
      <div className="space-y-1">
        {(Object.keys(REPORT_REASONS) as ReportReason[]).map((r) => (
          <label key={r} className="flex items-center gap-2">
            <input type="radio" name={`report-${reviewId}`} checked={reason === r} onChange={() => setReason(r)} />
            {REPORT_REASONS[r]}
          </label>
        ))}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
        placeholder="Anything else we should know (optional)"
        className="block w-full rounded border border-line px-2 py-1"
      />
      {error && <p className="text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button onClick={send} disabled={!reason || state === "sending"} className="rounded bg-pitch px-3 py-1 text-white disabled:opacity-40">
          {state === "sending" ? "Sending..." : "Send report"}
        </button>
        <button onClick={() => setOpen(false)} className="rounded px-3 py-1 text-muted">Cancel</button>
      </div>
    </div>
  );
}
