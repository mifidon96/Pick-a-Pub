// Test double for the S3 client: an in-memory bucket. Everything else is the
// real package (local exports below take priority over the re-export).
// @ts-expect-error no types for the direct path
export * from "../node_modules/@aws-sdk/client-s3/dist-cjs/index.js";
export const objects = new Map<string, string>();
export class HeadObjectCommand { constructor(public input: { Key: string }) {} }
export class CopyObjectCommand { constructor(public input: { CopySource: string; Key: string }) {} }
export class DeleteObjectCommand { constructor(public input: { Key: string }) {} }
export class GetObjectCommand { constructor(public input: { Key: string }) {} }
// Extends the real client (imported by file path, which the alias does not catch)
// so request signing still works; only network calls are faked.
// @ts-expect-error no types for the direct path
import { S3Client as RealS3Client } from "../node_modules/@aws-sdk/client-s3/dist-cjs/index.js";
export class S3Client extends RealS3Client {
  // @ts-expect-error simplified signature for tests
  async send(cmd: HeadObjectCommand | CopyObjectCommand | DeleteObjectCommand) {
    if (cmd instanceof HeadObjectCommand) { if (!objects.has(cmd.input.Key)) throw new Error("NotFound"); return {}; }
    if (cmd instanceof CopyObjectCommand) { const src = cmd.input.CopySource.split("/").slice(1).join("/"); objects.set(cmd.input.Key, objects.get(src)!); return {}; }
    if (cmd instanceof DeleteObjectCommand) { objects.delete(cmd.input.Key); return {}; }
    return {};
  }
}
