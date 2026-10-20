"use client";

import { useState } from "react";
import {
  FACT_KEYS, FACT_LABELS, QUICK_KEYS, SCORE_KEYS, SCORE_LABELS, TEAMS, VIBE_LABELS, putReview,
  type FactKey, type Review, type ReviewInput, type ScoreKey,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Props = { pubId: number; existing?: Review; defaultName?: string; onSaved: () => void };

const QUICK = new Set<ScoreKey>(QUICK_KEYS);
const EXTRA_KEYS = SCORE_KEYS.filter((k) => !QUICK.has(k));

// Quick review: three scores, then post. "Add more detail" opens the rest.
export default function ReviewForm({ pubId, existing, defaultName, onSaved }: Props) {
  const { headers } = useAuth();
  const [scores, setScores] = useState<Partial<Record<ScoreKey, number>>>(() => {
    const out: Partial<Record<ScoreKey, number>> = {};
    for (const k of SCORE_KEYS) if (existing?.[k] != null) out[k] = existing[k]!;
    return out;
  });
  // Food is no longer asked (the app is about the football); an old answer is kept as it was.
  const food = existing?.food ?? null;
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
  const [fanTeam, setFanTeam] = useState(existing?.fan_team ?? "");
  const [displayName, setDisplayName] = useState(existing?.display_name ?? defaultName ?? "");
  // Open the full form when updating a review that already has more than the quick scores.
  const [more, setMore] = useState(() =>
    Boolean(existing && (EXTRA_KEYS.some((k) => existing[k] != null) || existing.vibe != null || existing.match_label)),
  );
  const [matchLabel, setMatchLabel] = useState(existing?.match_label ?? "");
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const missing = QUICK_KEYS.filter((k) => !scores[k]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (missing.length) {
      setError(`Score these first: ${missing.map((k) => SCORE_LABELS[k].label).join(", ")}`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const all = Object.fromEntries(SCORE_KEYS.map((k) => [k, scores[k] ?? null])) as Record<ScoreKey, number | null>;
      const input = {
        ...all, ...facts, food, vibe, fan_team: fanTeam || null,
        display_name: displayName, match_label: matchLabel, comment,
      } satisfies ReviewInput;
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
      <div>
        <h2 className="font-semibold">How was it for watching football?</h2>
        <p className="text-xs text-muted">Three taps is enough. Add more detail if you have a minute.</p>
      </div>

      <div className="space-y-3">
        {QUICK_KEYS.map((k) => (
          <Picker key={k} label={SCORE_LABELS[k].label} hint={SCORE_LABELS[k].hint} value={scores[k] ?? null} onChange={(v) => setScores((s) => ({ ...s, [k]: v ?? undefined }))} />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Display name</span>
          <input required minLength={2} maxLength={30} value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1 w-full rounded border border-line px-3 py-2 text-base" />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Whose fans mostly watch here? (optional)</span>
          <select value={fanTeam} onChange={(e) => setFanTeam(e.target.value)} className="mt-1 w-full rounded border border-line bg-card px-2 py-2 text-base">
            <option value="">Not sure, or a mix</option>
            {TEAMS.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Ticked = yes. Left unticked = not answered (never counted as "no"). */}
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={facts.arrive_early === true}
          onChange={(e) => setFacts((f) => {
            const next = { ...f };
            if (e.target.checked) next.arrive_early = true;
            else delete next.arrive_early;
            return next;
          })}
          className="h-5 w-5 accent-pitch"
        />
        <span>Get there early for a seat on big games</span>
      </label>

      <label className="block text-sm">
        <span className="font-medium">Your review (optional)</span>
        <textarea
          maxLength={500}
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What was it like for the game? Value for money, music over the commentary, anything that spoiled it."
          className="mt-1 w-full rounded border border-line px-3 py-2 text-base"
        />
      </label>

      {!more ? (
        <button type="button" onClick={() => setMore(true)} className="text-sm text-pitch underline">
          Add more detail: seating, sound, bar, prices, vibe, channels
        </button>
      ) : (
        <>
          <div className="space-y-3 border-t border-line pt-4">
            <p className="text-xs text-muted">All optional. Skip anything you did not notice.</p>
            {EXTRA_KEYS.map((k) => (
              <Picker key={k} label={SCORE_LABELS[k].label} hint={SCORE_LABELS[k].hint} value={scores[k] ?? null} onChange={(v) => setScores((s) => ({ ...s, [k]: v ?? undefined }))} clearable />
            ))}
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
                  onClick={() => setVibe(vibe === i + 1 ? null : i + 1)}
                  className={`rounded border px-1 py-2 text-xs ${vibe === i + 1 ? "border-pitch bg-pitch text-white" : "border-line bg-chalk"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">What did you notice? Skip any you are not sure about.</legend>
            {FACT_KEYS.filter((k) => k !== "arrive_early").map((k) => (
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

          <label className="block text-sm">
            <span className="font-medium">Match you watched (optional)</span>
            <input maxLength={80} value={matchLabel} onChange={(e) => setMatchLabel(e.target.value)} className="mt-1 w-full rounded border border-line px-3 py-2 text-base" />
          </label>
        </>
      )}

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

