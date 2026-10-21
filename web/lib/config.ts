// Settings that differ between dev and prod (where the API is, which Cognito pool).
//
// Build once, promote: the same website build is deployed to dev and then prod,
// so these are not baked in when it is built. Instead deploy.sh writes
// /config.js for each environment, which sets window.__PICKAPUB_CONFIG__ before
// the app starts (layout.tsx loads it first).
//
// Local dev (next dev) has no config.js values, so it falls back to the
// NEXT_PUBLIC_* settings in web/.env.development.local.
export type RuntimeConfig = { apiUrl: string; cognitoAuthority: string; cognitoClientId: string };

declare global {
  interface Window {
    __PICKAPUB_CONFIG__?: Partial<RuntimeConfig>;
  }
}

export function config(): RuntimeConfig {
  const live = typeof window === "undefined" ? undefined : window.__PICKAPUB_CONFIG__;
  return {
    apiUrl: (live?.apiUrl || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/+$/, ""),
    cognitoAuthority: live?.cognitoAuthority || process.env.NEXT_PUBLIC_COGNITO_AUTHORITY || "",
    cognitoClientId: live?.cognitoClientId || process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "",
  };
}

export const apiUrl = () => config().apiUrl;
