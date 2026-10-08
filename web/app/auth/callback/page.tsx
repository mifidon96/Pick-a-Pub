"use client";

import { useEffect, useState } from "react";
import { userManager } from "@/lib/auth";

// Cognito sends the visitor back here after sign-in.
export default function AuthCallback() {
  const [error, setError] = useState("");

  useEffect(() => {
    const m = userManager();
    if (!m) {
      window.location.replace("/");
      return;
    }
    m.signinRedirectCallback()
      .then((user) => {
        const back = typeof user.state === "string" && user.state.startsWith("/") && !user.state.startsWith("//") ? user.state : "/";
        window.location.replace(back);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  return <p className="text-sm text-muted">{error ? `Sign-in failed: ${error}` : "Signing you in..."}</p>;
}
