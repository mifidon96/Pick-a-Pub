"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function Header() {
  const { ready, signedIn, available, signIn, signOut } = useAuth();
  const devMode = Boolean(process.env.NEXT_PUBLIC_DEV_USER);
  return (
    <header className="border-b border-line bg-header text-ink">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-1.5">
        <div className="flex items-center gap-3">
          <Link href="/" className="inline-flex min-h-11 items-center gap-1 text-lg font-extrabold tracking-tight">
            Pick-a-Pub <span className="hidden font-normal text-amber sm:inline">match day</span>
          </Link>
          <Link href="/match/" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium hover:bg-card">Matches</Link>
        </div>
        {devMode ? (
          <Link href="/account/" className="inline-flex min-h-11 items-center rounded-lg bg-card px-3 text-xs">dev user</Link>
        ) : ready && available ? (
          <div className="flex items-center gap-2">
            {signedIn && (
              <Link href="/account/" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-card">
                Account
              </Link>
            )}
            <button
              onClick={signedIn ? signOut : signIn}
              className="min-h-11 rounded-lg border border-line px-4 text-sm font-medium hover:bg-card"
            >
              {signedIn ? "Sign out" : "Sign in"}
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
