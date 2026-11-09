// The request and response shapes every route uses, plus input checks.
// handlers/api.ts turns an API Gateway event into a Req; dev/local.ts does the
// same for the local dev server.

export type Req = {
  method: string;
  path: string;
  query: Record<string, string | undefined>;
  body: unknown;
  userId?: string; // set only when the caller is signed in
  client?: { ip?: string; ua?: string; host?: string }; // for anonymous page counts only
};
export type Res = { status: number; body: unknown };

// Throw one of these from a route to send that status and message back.
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export const bad = (msg: string) => new HttpError(400, msg);
export const notFound = (msg: string) => new HttpError(404, msg);

// The signed-in user's id, or a 401 with the given message.
export function signedIn(req: Req, msg = "Sign in first"): string {
  if (!req.userId) throw new HttpError(401, msg);
  return req.userId;
}

// The JSON body as an object ({} if there is none).
export function bodyOf(req: Req): Record<string, unknown> {
  return (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
}

// A number from the query string, within min..max.
export function num(v: string | undefined, name: string, min: number, max: number, fallback?: number): number {
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw bad(`${name} is required`);
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw bad(`${name} must be between ${min} and ${max}`);
  return n;
}

// A 1 to 5 rating.
export function score(v: unknown, name: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5) throw bad(`${name} must be a whole number from 1 to 5`);
  return v;
}

// Optional free text, trimmed, at most max characters.
export function text(v: unknown, name: string, max: number): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw bad(`${name} must be text`);
  const t = v.trim();
  if (t.length > max) throw bad(`${name} must be ${max} characters or fewer`);
  return t || null;
}
