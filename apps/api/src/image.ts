import crypto from "node:crypto";
import { CopyObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { S3_BUCKET, s3 } from "./s3.js";

const MAX_DIMENSION = 1200;
const WEBP_QUALITY = 90;

/**
 * Comprimeert een afbeelding naar webp (max 1200px, quality 0.9).
 * Retourneert de gecomprimeerde buffer.
 */
async function compressToWebp(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

/**
 * Uploads a base64-encoded image to S3 (compressed to webp).
 * Returns the S3 key, or null if the upload fails.
 */
export async function uploadBase64Image(
  base64: string,
  mediaType: string,
  recipeId: string,
): Promise<string | null> {
  try {
    const raw = Buffer.from(base64, "base64");
    const buffer = await compressToWebp(raw);
    const key = `recipes/${recipeId}/${crypto.randomUUID()}.webp`;

    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: "image/webp",
      }),
    );

    return key;
  } catch (err: unknown) {
    console.error("Failed to upload base64 image:", err);
    return null;
  }
}

/**
 * Downloads an external image, compresses to webp, and uploads to S3.
 * Returns the S3 key, or null if the download/upload fails.
 */
export async function uploadExternalImage(
  externalUrl: string,
  recipeId: string,
): Promise<string | null> {
  try {
    const response = await fetch(externalUrl);
    if (!response.ok) return null;

    const raw = Buffer.from(await response.arrayBuffer());
    const buffer = await compressToWebp(raw);
    const key = `recipes/${recipeId}/${crypto.randomUUID()}.webp`;

    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: "image/webp",
      }),
    );

    return key;
  } catch (err: unknown) {
    console.error("Failed to upload external image:", err);
    return null;
  }
}

/**
 * Copies an existing S3 image to a new key under a different recipe.
 * Returns the new S3 key, or null if the copy fails.
 */
export async function copyS3Image(sourceKey: string, newRecipeId: string): Promise<string | null> {
  try {
    const ext = sourceKey.split(".").pop() || "webp";
    const newKey = `recipes/${newRecipeId}/${crypto.randomUUID()}.${ext}`;

    await s3.send(
      new CopyObjectCommand({
        Bucket: S3_BUCKET,
        CopySource: `${S3_BUCKET}/${sourceKey}`,
        Key: newKey,
      }),
    );

    return newKey;
  } catch (err: unknown) {
    console.error("Failed to copy S3 image:", err);
    return null;
  }
}
