import crypto from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { recipeImages, recipes } from "../db/schema.js";
import { requireAuth } from "../middleware.js";
import { S3_BUCKET, s3 } from "../s3.js";
import type { AppEnv } from "../types.js";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const PRESIGN_EXPIRY = 300; // 5 minutes

const app = new Hono<AppEnv>();

app.use("*", requireAuth);

// Get a presigned upload URL
app.post("/upload-url", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { recipeId, contentType } = body as { recipeId: string; contentType: string };

  if (!recipeId || !contentType) {
    return c.json({ error: "recipeId and contentType are required" }, 400);
  }

  if (!ALLOWED_TYPES.includes(contentType)) {
    return c.json({ error: `Unsupported type. Allowed: ${ALLOWED_TYPES.join(", ")}` }, 400);
  }

  // Verify recipe belongs to user
  const recipe = await db.query.recipes.findFirst({
    where: sql`${recipes.id} = ${recipeId} AND ${recipes.userId} = ${user.id}`,
  });
  if (!recipe) return c.json({ error: "Recipe not found" }, 404);

  const ext = contentType.split("/")[1];
  const key = `recipes/${recipeId}/${crypto.randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: MAX_SIZE, // Max allowed size
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRY });

  return c.json({ uploadUrl, key });
});

// Confirm upload and save to database
app.post("/confirm", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { recipeId, key, isPrimary } = body as {
    recipeId: string;
    key: string;
    isPrimary?: boolean;
  };

  if (!recipeId || !key) {
    return c.json({ error: "recipeId and key are required" }, 400);
  }

  // Verify recipe belongs to user
  const recipe = await db.query.recipes.findFirst({
    where: sql`${recipes.id} = ${recipeId} AND ${recipes.userId} = ${user.id}`,
  });
  if (!recipe) return c.json({ error: "Recipe not found" }, 404);

  // Verify file exists in S3
  try {
    await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  } catch {
    return c.json({ error: "File not found in storage" }, 404);
  }

  // If setting as primary, unset other primary images
  if (isPrimary) {
    await db
      .update(recipeImages)
      .set({ isPrimary: false })
      .where(eq(recipeImages.recipeId, recipeId));
  }

  const [image] = await db
    .insert(recipeImages)
    .values({
      recipeId,
      url: key, // Store the S3 key, not a full URL
      isPrimary: isPrimary ?? true,
    })
    .returning();

  return c.json(image, 201);
});

// Delete an image
app.delete("/:imageId", async (c) => {
  const imageId = c.req.param("imageId");
  const user = c.get("user")!;

  // Find image and verify ownership via recipe
  const image = await db.query.recipeImages.findFirst({
    where: eq(recipeImages.id, imageId),
    with: { recipe: true },
  });

  if (!image || image.recipe.userId !== user.id) {
    return c.json({ error: "Image not found" }, 404);
  }

  // Delete from S3
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: image.url }));
  } catch {
    // Continue even if S3 delete fails — clean up DB anyway
  }

  // Delete from database
  await db.delete(recipeImages).where(eq(recipeImages.id, imageId));

  return c.json({ ok: true });
});

export default app;
