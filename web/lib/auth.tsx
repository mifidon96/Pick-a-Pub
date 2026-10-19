"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { UserManager, WebStorageStateStore } from "oidc-client-ts";

// Two modes:
//  - Local dev: NEXT_PUBLIC_DEV_USER is set, so every request carries x-dev-user.
//  - Production: Cognito hosted sign-in. API Gateway checks the token.
const DEV_USER = process.env.NEXT_PUBLIC_DEV_USER;
const AUTHORITY = process.env.NEXT_PUBLIC_COGNITO_AUTHORITY;
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

let mgr: UserManager | undefined;
export function userManager(): UserManager | null {
  if (typeof window === "undefined" || !AUTHORITY || !CLIENT_ID) return null;
  mgr ??= new UserManager({
    authority: AUTHORITY,
    client_id: CLIENT_ID,
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
  const region = /cognito-idp\.([a-z0-9-]+)\.amazonaws\.com/.exec(AUTHORITY ?? "")?.[1];
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
  // Nothing to load when using the dev user or when sign-in is not configured.
  const [ready, setReady] = useState(Boolean(DEV_USER) || !(AUTHORITY && CLIENT_ID));

  useEffect(() => {
    const m = DEV_USER ? null : userManager();
    if (!m) return;
    m.getUser()
      .then((u) => setToken(u && !u.expired ? (u.id_token ?? null) : null))
      .finally(() => setReady(true));
  }, []);

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
      available: Boolean(DEV_USER || (AUTHORITY && CLIENT_ID)),
      headers,
      signIn,
      signOut,
      deleteSignIn,
    };
  }, [ready, token, signIn, signOut, deleteSignIn]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
