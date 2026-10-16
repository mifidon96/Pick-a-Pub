"use client";

import { useState } from "react";
import {
  FACT_KEYS, FACT_LABELS, SCORE_KEYS, SCORE_LABELS, VIBE_LABELS, putReview,
  type FactKey, type Review, type ReviewInput, type ScoreKey,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Props = { pubId: number; existing?: Review; onSaved: () => void };

export default function ReviewForm({ pubId, existing, onSaved }: Props) {
  const { headers } = useAuth();
  const [scores, setScores] = useState<Partial<Record<ScoreKey, number>>>(
    existing ? Object.fromEntries(SCORE_KEYS.map((k) => [k, existing[k]])) : {},
  );
  const [food, setFood] = useState<number | null>(existing?.food ?? null);
  const [vibe, setVibe] = useState<number | null>(existing?.vibe ?? null);
  const [facts, setFacts] = useState<Partial<Record<FactKey, boolean>>>(() => {
    // Carry over earlier answers so an update does not wipe them.
    const prev: Partial<Record<FactKey, boolean>> = {};
    for (const k of FACT_KEYS) {
      const v = existing?.[k];
      if (typeof v === "boolean") prev[k] = v;
    }
    return prev;
  });
  const [displayName, setDisplayName] = useState(existing?.display_name ?? "");
  const [matchLabel, setMatchLabel] = useState(existing?.match_label ?? "");
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const missing = SCORE_KEYS.filter((k) => !scores[k]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (missing.length || !vibe) {
      const names = missing.map((k) => SCORE_LABELS[k].label);
      if (!vibe) names.push("Vibe");
      setError(`Score every category first: ${names.join(", ")}`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const input = { ...(scores as Record<ScoreKey, number>), ...facts, food, vibe, display_name: displayName, match_label: matchLabel, comment } satisfies ReviewInput;
      await putReview(pubId, input, headers);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your review");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-xl border border-line bg-card p-4">
      <h2 className="font-semibold">How was it for watching football?</h2>

      <div className="space-y-3">
        {SCORE_KEYS.map((k) => (
          <Picker key={k} label={SCORE_LABELS[k].label} hint={SCORE_LABELS[k].hint} value={scores[k] ?? null} onChange={(v) => setScores((s) => ({ ...s, [k]: v ?? undefined }))} />
        ))}
        <Picker label={SCORE_LABELS.food.label} hint={SCORE_LABELS.food.hint} value={food} onChange={setFood} clearable />
      </div>

      <div className="space-y-2">
        <div className="text-sm">
          <div className="font-medium">Vibe</div>
          <div className="text-xs text-muted">Not a score: some people want calm, some want loud</div>
        </div>
        <div className="grid grid-cols-5 gap-1" role="group" aria-label="Vibe">
          {VIBE_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              aria-pressed={vibe === i + 1}
              onClick={() => setVibe(i + 1)}
              className={`rounded border px-1 py-2 text-xs ${vibe === i + 1 ? "border-pitch bg-pitch text-white" : "border-line bg-chalk"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">What did you notice? Skip any you are not sure about.</legend>
        {FACT_KEYS.map((k) => (
          <div key={k} className="flex items-center justify-between gap-3 text-sm">
            <span>{FACT_LABELS[k]}</span>
            <span className="flex gap-1">
              {([true, false] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  aria-pressed={facts[k] === v}
                  onClick={() => setFacts((f) => {
                    const next = { ...f };
                    if (f[k] === v) delete next[k];
                    else next[k] = v;
                    return next;
                  })}
                  className={`w-12 rounded border px-2 py-1 ${facts[k] === v ? "border-pitch bg-pitch text-white" : "border-line bg-chalk"}`}
                >
                  {v ? "Yes" : "No"}
                </button>
              ))}
            </span>
          </div>
        ))}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Display name</span>
          <input required minLength={2} maxLength={30} value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1 w-full rounded border border-line px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Match you watched (optional)</span>
          <input maxLength={80} value={matchLabel} onChange={(e) => setMatchLabel(e.target.value)} className="mt-1 w-full rounded border border-line px-3 py-2" />
        </label>
      </div>
      <label className="block text-sm">
        <span className="font-medium">Comment (optional)</span>
        <textarea maxLength={500} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} className="mt-1 w-full rounded border border-line px-3 py-2" />
      </label>

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button disabled={saving} className="rounded bg-pitch px-4 py-2 font-medium text-white disabled:opacity-60">
        {saving ? "Saving..." : existing ? "Update review" : "Post review"}
      </button>
    </form>
  );
}

function Picker(props: { label: string; hint: string; value: number | null; onChange: (v: number | null) => void; clearable?: boolean }) {
  const { label, hint, value, onChange, clearable } = props;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="min-w-0 text-sm">
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted">{hint}</div>
      </div>
      <div className="flex shrink-0 gap-1" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            onClick={() => onChange(clearable && value === n ? null : n)}
            className={`h-10 w-10 rounded border text-sm ${value === n ? "border-amber bg-amber font-bold text-ink" : "border-line bg-chalk"}`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
