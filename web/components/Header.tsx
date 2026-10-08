"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function Header() {
  const { ready, signedIn, available, signIn, signOut } = useAuth();
  const devMode = Boolean(process.env.NEXT_PUBLIC_DEV_USER);
  return (
    <header className="bg-pitch text-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Pick-a-Pub <span className="font-normal text-amber">match day</span>
        </Link>
        {devMode ? (
          <span className="rounded bg-pitch-dark px-2 py-1 text-xs">dev user</span>
        ) : ready && available ? (
          <button
            onClick={signedIn ? signOut : signIn}
            className="rounded border border-white/40 px-3 py-1 text-sm hover:bg-pitch-dark"
          >
            {signedIn ? "Sign out" : "Sign in"}
          </button>
        ) : null}
      </div>
    </header>
  );
}
