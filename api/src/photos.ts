import { randomUUID } from "node:crypto";
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Bucket layout:
//   pending/<id>.jpg      uploads waiting for approval (never public)
//   public/<id>.jpg       approved uploads, served by CloudFront at /public/...
//   public/editorial/...  our own photos from content/photos/
// Read when used, not at load time, so tests and local runs can set them late.
const bucket = () => process.env.PHOTOS_BUCKET;
const baseUrl = () => (process.env.PHOTOS_BASE_URL ?? "").replace(/\/+$/, "");
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

let s3: S3Client | undefined;
const client = () => (s3 ??= new S3Client({ region: process.env.AWS_REGION ?? "eu-west-2" }));

export const photosEnabled = () => Boolean(bucket() && baseUrl());
export const publicPhotoUrl = (id: string) => `${baseUrl()}/public/${id}.jpg`;
// Our copy of a photo (e.g. public/wikimedia/...); falls back to nothing if photos are not set up.
export const photoKeyUrl = (key: string | null | undefined): string | null => (baseUrl() && key ? `${baseUrl()}/${key}` : null);
export const editorialPhotoUrl = (file: string) => `${baseUrl()}/public/editorial/${encodeURIComponent(file)}`;

// A one-off upload form the browser posts the image to, straight to S3.
// S3 itself enforces the key, the type and the size limit.
export async function presignUpload(): Promise<{ id: string; url: string; fields: Record<string, string> }> {
  const BUCKET = bucket();
  if (!BUCKET) throw new Error("PHOTOS_BUCKET not set");
  const id = randomUUID();
  const { url, fields } = await createPresignedPost(client(), {
    Bucket: BUCKET,
    Key: `pending/${id}.jpg`,
    Conditions: [
      ["content-length-range", 1, MAX_PHOTO_BYTES],
      ["eq", "$Content-Type", "image/jpeg"],
    ],
    Fields: { "Content-Type": "image/jpeg" },
    Expires: 600,
  });
  return { id, url, fields };
}

export async function pendingExists(id: string): Promise<boolean> {
  try {
    await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: `pending/${id}.jpg` }));
    return true;
  } catch {
    return false;
  }
}

// Short-lived private link so the owner can look at a pending photo.
export function previewUrl(id: string): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket(), Key: `pending/${id}.jpg` }), { expiresIn: 3600 });
}

export async function publish(id: string): Promise<void> {
  await client().send(new CopyObjectCommand({
    Bucket: bucket(),
    CopySource: `${bucket()}/pending/${id}.jpg`,
    Key: `public/${id}.jpg`,
    ContentType: "image/jpeg",
    CacheControl: "public, max-age=31536000, immutable",
    MetadataDirective: "REPLACE",
  }));
  await removePending(id);
}

export async function removePending(id: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: `pending/${id}.jpg` }));
}
