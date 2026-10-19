"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteMyData, exportMyData } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// Download my data, delete my account.
export default function AccountPage() {
  const { ready, signedIn, available, headers, signIn, deleteSignIn } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "export" | "delete">("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState("");

  if (!ready) return <p className="text-sm text-muted">Loading...</p>;
  if (!signedIn) {
    return (
      <div className="space-y-3 text-sm">
        <h1 className="text-2xl font-bold">Your account</h1>
        {available ? (
          <>
            <p>Sign in to download or delete your data.</p>
            <button onClick={signIn} className="rounded bg-pitch px-4 py-2 font-medium text-white">Sign in</button>
          </>
        ) : (
          <p className="text-muted">Accounts are not available right now.</p>
        )}
      </div>
    );
  }

  async function download() {
    setBusy("export");
    setError("");
    try {
      const data = await exportMyData(headers);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "pick-a-pub-my-data.json";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    setBusy("delete");
    setError("");
    try {
      await deleteMyData(headers); // reviews, photos, reports, profile
      await deleteSignIn(); // the Cognito sign-in and email address
      router.replace("/");
    } catch (e) {
      setError(`${(e as Error).message}. Nothing has been lost that you wanted to keep; try again.`);
      setBusy("");
    }
  }

  return (
    <div className="space-y-6 text-sm">
      <h1 className="text-2xl font-bold">Your account</h1>
      {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-red-800">{error}</p>}

      <section className="space-y-2 rounded-xl border border-line bg-card p-4">
        <h2 className="font-semibold">Download your data</h2>
        <p className="text-muted">Your name, reviews, photos and reports, as a JSON file.</p>
        <button onClick={download} disabled={busy !== ""} className="rounded border border-pitch px-4 py-2 font-medium text-pitch disabled:opacity-50">
          {busy === "export" ? "Preparing..." : "Download my data"}
        </button>
      </section>

      <section className="space-y-2 rounded-xl border border-red-200 bg-card p-4">
        <h2 className="font-semibold">Delete your account</h2>
        <p className="text-muted">
          Removes your reviews, photos, reports and sign-in, including your email address. This cannot be undone.
          Pub ratings update straight away.
        </p>
        <label className="block">
          <span className="text-muted">Type DELETE to confirm</span>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 block w-40 rounded border border-line px-2 py-1"
            autoComplete="off"
          />
        </label>
        <button
          onClick={remove}
          disabled={confirm !== "DELETE" || busy !== ""}
          className="rounded bg-red-700 px-4 py-2 font-medium text-white disabled:opacity-40"
        >
          {busy === "delete" ? "Deleting..." : "Delete my account"}
        </button>
      </section>

      <p className="text-xs text-muted">
        See the <Link href="/privacy/" className="underline">privacy notice</Link> for what we store and why.
      </p>
    </div>
  );
}
