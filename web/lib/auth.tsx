"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { UserManager, WebStorageStateStore } from "oidc-client-ts";
import { config } from "./config";

// Two modes:
//  - Local dev: NEXT_PUBLIC_DEV_USER is set, so every request carries x-dev-user.
//  - Production: Cognito hosted sign-in. API Gateway checks the token. The pool
//    comes from /config.js at runtime (see config.ts), not from the build.
const DEV_USER = process.env.NEXT_PUBLIC_DEV_USER;

// Sign-in works when the dev user is set or Cognito is configured.
function signInConfigured(): boolean {
  const c = config();
  return Boolean(DEV_USER || (c.cognitoAuthority && c.cognitoClientId));
}

const noSubscribe = () => () => {};

let mgr: UserManager | undefined;
export function userManager(): UserManager | null {
  const { cognitoAuthority, cognitoClientId } = config();
  if (typeof window === "undefined" || !cognitoAuthority || !cognitoClientId) return null;
  mgr ??= new UserManager({
    authority: cognitoAuthority,
    client_id: cognitoClientId,
    redirect_uri: `${window.location.origin}/auth/callback/`,
    response_type: "code",
    // aws.cognito.signin.user.admin: lets "Delete my account" remove the sign-in itself.
    scope: "openid email aws.cognito.signin.user.admin",
    userStore: new WebStorageStateStore({ store: window.localStorage }),
  });
  return mgr;
}

type Auth = {
  ready: boolean;
  signedIn: boolean;
  available: boolean; // false when neither mode is configured
  headers: Record<string, string>;
  signIn: () => void;
  signOut: () => void;
  deleteSignIn: () => Promise<void>; // removes the Cognito account, then signs out
};

// Cognito's own API, called from the browser with the user's access token.
async function cognitoDeleteUser(accessToken: string) {
  const region = /cognito-idp\.([a-z0-9-]+)\.amazonaws\.com/.exec(config().cognitoAuthority)?.[1];
  if (!region) throw new Error("Sign-in is not set up");
  const res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "content-type": "application/x-amz-json-1.1",
      "x-amz-target": "AWSCognitoIdentityProviderService.DeleteUser",
    },
    body: JSON.stringify({ AccessToken: accessToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Could not delete the sign-in (${res.status})`);
  }
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // The pages are pre-built without the runtime config, so sign-in details are
  // only read in the browser, after hydration. Before that (and in the pre-built
  // HTML) auth counts as not ready, so the two always agree.
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  const available = inBrowser && signInConfigured();
  // Nothing to load when using the dev user or when sign-in is not configured.
  const needsLoad = inBrowser && !DEV_USER && Boolean(userManager());
  const ready = inBrowser && (!needsLoad || loaded);

  useEffect(() => {
    if (!needsLoad) return;
    userManager()!
      .getUser()
      .then((u) => setToken(u && !u.expired ? (u.id_token ?? null) : null))
      .finally(() => setLoaded(true));
  }, [needsLoad]);

  const signIn = useCallback(() => {
    // Remember where to come back to after the hosted sign-in page.
    userManager()?.signinRedirect({ state: window.location.pathname + window.location.search });
  }, []);

  const signOut = useCallback(() => {
    userManager()?.removeUser().then(() => setToken(null));
  }, []);

  const deleteSignIn = useCallback(async () => {
    if (DEV_USER) return; // nothing to delete locally
    const m = userManager();
    const user = await m?.getUser();
    if (!m || !user?.access_token) throw new Error("Sign in again, then try once more");
    await cognitoDeleteUser(user.access_token);
    await m.removeUser();
    setToken(null);
  }, []);

  const value = useMemo<Auth>(() => {
    const headers: Record<string, string> = DEV_USER
      ? { "x-dev-user": DEV_USER }
      : token
        ? { authorization: `Bearer ${token}` }
        : {};
    return {
      ready,
      signedIn: Boolean(DEV_USER || token),
      available,
      headers,
      signIn,
      signOut,
      deleteSignIn,
    };
  }, [ready, available, token, signIn, signOut, deleteSignIn]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
