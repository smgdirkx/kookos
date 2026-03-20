import { createCommentSchema, updateCommentSchema } from "@kookos/shared";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { recipeComments, recipes } from "../db/schema.js";
import { requireAuth } from "../middleware.js";
import type { AppEnv } from "../types.js";

const app = new Hono<AppEnv>();

app.use("*", requireAuth);

// List comments for a recipe
app.get("/", async (c) => {
  const recipeId = c.req.param("recipeId") as string;
  const user = c.get("user")!;

  // Verify recipe belongs to user
  const recipe = await db.query.recipes.findFirst({
    where: sql`${recipes.id} = ${recipeId} AND ${recipes.userId} = ${user.id}`,
  });
  if (!recipe) return c.json({ error: "Not found" }, 404);

  const result = await db.query.recipeComments.findMany({
    where: sql`${recipeComments.recipeId} = ${recipeId}`,
    orderBy: (comments, { desc }) => [desc(comments.createdAt)],
  });
  return c.json(result);
});

// Create comment
app.post("/", async (c) => {
  const recipeId = c.req.param("recipeId") as string;
  const user = c.get("user")!;

  // Verify recipe belongs to user
  const recipe = await db.query.recipes.findFirst({
    where: sql`${recipes.id} = ${recipeId} AND ${recipes.userId} = ${user.id}`,
  });
  if (!recipe) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json();
  const parsed = createCommentSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const [comment] = await db
    .insert(recipeComments)
    .values({
      recipeId: recipeId,
      userId: user.id,
      content: parsed.data.content,
      isImportant: parsed.data.isImportant ?? false,
    })
    .returning();

  return c.json(comment, 201);
});

// Update comment
app.patch("/:commentId", async (c) => {
  const commentId = c.req.param("commentId");
  const user = c.get("user")!;

  const body = await c.req.json();
  const parsed = updateCommentSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const [comment] = await db
    .update(recipeComments)
    .set({
      content: parsed.data.content,
      ...(parsed.data.isImportant !== undefined && { isImportant: parsed.data.isImportant }),
      updatedAt: new Date(),
    })
    .where(sql`${recipeComments.id} = ${commentId} AND ${recipeComments.userId} = ${user.id}`)
    .returning();

  if (!comment) return c.json({ error: "Not found" }, 404);
  return c.json(comment);
});

// Delete comment
app.delete("/:commentId", async (c) => {
  const commentId = c.req.param("commentId");
  const user = c.get("user")!;

  const [deleted] = await db
    .delete(recipeComments)
    .where(sql`${recipeComments.id} = ${commentId} AND ${recipeComments.userId} = ${user.id}`)
    .returning();

  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

export default app;
