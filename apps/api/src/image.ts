import crypto from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { S3_BUCKET, s3 } from "./s3.js";

const ALLOWED_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

/**
 * Uploads a base64-encoded image to S3.
 * Returns the S3 key, or null if the upload fails.
 */
export async function uploadBase64Image(
  base64: string,
  mediaType: string,
  recipeId: string,
): Promise<string | null> {
  try {
    const ext = ALLOWED_EXTENSIONS[mediaType] ?? "jpeg";
    const buffer = Buffer.from(base64, "base64");
    const key = `recipes/${recipeId}/${crypto.randomUUID()}.${ext}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mediaType,
      }),
    );

    return key;
  } catch (err: unknown) {
    console.error("Failed to upload base64 image:", err);
    return null;
  }
}

/**
 * Downloads an external image and uploads it to S3.
 * Returns the S3 key, or null if the download/upload fails.
 */
export async function uploadExternalImage(
  externalUrl: string,
  recipeId: string,
): Promise<string | null> {
  try {
    const response = await fetch(externalUrl);
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
    const ext = ALLOWED_EXTENSIONS[contentType] ?? "jpeg";
    const buffer = Buffer.from(await response.arrayBuffer());

    const key = `recipes/${recipeId}/${crypto.randomUUID()}.${ext}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    return key;
  } catch (err: unknown) {
    console.error("Failed to upload external image:", err);
    return null;
  }
}
