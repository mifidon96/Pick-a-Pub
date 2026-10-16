import { createHash } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Copies Wikimedia photos into our photos bucket (public/wikimedia/...), so the
// site does not depend on Wikimedia staying the same. Runs in the importer
// Lambda, which has internet access. Credits and source links are unchanged.

const MAX_BYTES = 5 * 1024 * 1024;
const UA = "pick-a-pub/0.4 (photo copy; https://github.com/mifidon96/Pick-a-Pub)";

export type ToCopy = { id: number; url: string };
export type Copied = { id: number; key?: string; gone?: boolean };

let s3: S3Client | undefined;
const client = () => (s3 ??= new S3Client({ region: process.env.AWS_REGION ?? "eu-west-2" }));

export const keyFor = (url: string) => `public/wikimedia/${createHash("sha1").update(url).digest("hex").slice(0, 20)}.jpg`;

// Returns what happened to each photo; failures are left to retry next time.
export async function copyPhotos(items: ToCopy[], bucket: string, fetchFn: typeof fetch = fetch): Promise<Copied[]> {
  const out: Copied[] = [];
  for (const item of items) {
    try {
      const res = await fetchFn(item.url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15_000) });
      if (res.status === 404 || res.status === 410) {
        out.push({ id: item.id, gone: true }); // deleted on Wikimedia
        continue;
      }
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !/^image\/(jpeg|png|webp)/.test(type)) continue;
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length === 0 || body.length > MAX_BYTES) continue;
      const key = keyFor(item.url);
      await client().send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: type.split(";")[0],
        CacheControl: "public, max-age=31536000, immutable",
      }));
      out.push({ id: item.id, key });
    } catch (e) {
      console.warn(`photo copy failed for pub ${item.id}: ${(e as Error).message}`);
    }
  }
  return out;
}
