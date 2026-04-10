import {
  copyCommunityRecipesSchema,
  searchSharedRecipesSchema,
  shareRecipeSchema,
} from "@kookos/shared";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import {
  recipeImages,
  recipeIngredients,
  recipeShares,
  recipes,
  recipeTags,
  users,
} from "../db/schema.js";
import { copyS3Image } from "../image.js";
import { requireAuth } from "../middleware.js";
import type { AppEnv } from "../types.js";

const app = new Hono<AppEnv>();

const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL;

app.use("*", requireAuth);

// Count unseen shared recipes (shares created after user's lastSeenSharedAt)
app.get("/unseen-count", async (c) => {
  const currentUserId = c.get("user")!.id;

  const user = await db.query.users.findFirst({
    where: eq(users.id, currentUserId),
    columns: { lastSeenSharedAt: true },
  });

  const lastSeen = user?.lastSeenSharedAt;

  // Count shares from OTHER users that are newer than lastSeen
  const whereClause = lastSeen
    ? sql`${recipeShares.userId} != ${currentUserId} AND ${recipeShares.createdAt} > ${lastSeen}`
    : sql`${recipeShares.userId} != ${currentUserId}`;

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(recipeShares)
    .where(whereClause);

  return c.json({ count: result.count });
});

// Mark shared recipes as seen
app.post("/mark-seen", async (c) => {
  const currentUserId = c.get("user")!.id;

  await db.update(users).set({ lastSeenSharedAt: new Date() }).where(eq(users.id, currentUserId));

  return c.json({ ok: true });
});

// Share a recipe (heart + comment)
app.post("/:recipeId", async (c) => {
  const currentUserId = c.get("user")!.id;
  const recipeId = c.req.param("recipeId");

  const body = await c.req.json();
  const parsed = shareRecipeSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  // Verify recipe belongs to current user
  const recipe = await db.query.recipes.findFirst({
    where: and(eq(recipes.id, recipeId), eq(recipes.userId, currentUserId)),
  });
  if (!recipe) return c.json({ error: "Recept niet gevonden" }, 404);

  // Check if already shared
  const existing = await db.query.recipeShares.findFirst({
    where: and(eq(recipeShares.recipeId, recipeId), eq(recipeShares.userId, currentUserId)),
  });
  if (existing) return c.json({ error: "Al gedeeld" }, 409);

  const [share] = await db
    .insert(recipeShares)
    .values({
      recipeId,
      userId: currentUserId,
      comment: parsed.data.comment,
    })
    .returning();

  return c.json(share, 201);
});

// Remove share (unheart)
app.delete("/:recipeId", async (c) => {
  const currentUserId = c.get("user")!.id;
  const recipeId = c.req.param("recipeId");

  const result = await db
    .delete(recipeShares)
    .where(and(eq(recipeShares.recipeId, recipeId), eq(recipeShares.userId, currentUserId)))
    .returning();

  if (result.length === 0) return c.json({ error: "Niet gevonden" }, 404);
  return c.json({ ok: true });
});

// Check if current user has shared a specific recipe
app.get("/status/:recipeId", async (c) => {
  const currentUserId = c.get("user")!.id;
  const recipeId = c.req.param("recipeId");

  const share = await db.query.recipeShares.findFirst({
    where: and(eq(recipeShares.recipeId, recipeId), eq(recipeShares.userId, currentUserId)),
  });

  return c.json({ shared: !!share, comment: share?.comment ?? null });
});

// List all shared recipes (from all users, for the feed)
app.get("/", async (c) => {
  const currentUserId = c.get("user")!.id;
  const parsed = searchSharedRecipesSchema.safeParse({
    query: c.req.query("q"),
    page: c.req.query("page"),
    limit: c.req.query("limit"),
  });
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { query, page, limit } = parsed.data;
  const offset = (page - 1) * limit;
  const trimmedQuery = query?.trim();
  const imageBase = S3_PUBLIC_URL || "/images/kookos";

  let whereClause = sql`TRUE`;

  if (trimmedQuery) {
    const likePattern = `%${trimmedQuery}%`;
    whereClause = sql`(
      ${recipes.searchVector} @@ plainto_tsquery('dutch', ${trimmedQuery})
      OR ${recipes.title} ILIKE ${likePattern}
      OR EXISTS (
        SELECT 1 FROM ${recipeIngredients}
        WHERE ${recipeIngredients.recipeId} = ${recipes.id}
        AND ${recipeIngredients.name} ILIKE ${likePattern}
      )
    )`;
  }

  const result = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      description: recipes.description,
      category: recipes.category,
      cuisine: recipes.cuisine,
      userName: users.name,
      imageUrl: sql<string | null>`(
        SELECT ${recipeImages.url}
        FROM ${recipeImages}
        WHERE ${recipeImages.recipeId} = ${recipes.id} AND ${recipeImages.isPrimary} = true
        LIMIT 1
      )`,
      isOwned: sql<boolean>`(
        ${recipes.userId} = ${currentUserId}
        OR EXISTS (
          SELECT 1 FROM ${recipes} r2
          WHERE r2.user_id = ${currentUserId}
          AND r2.source_recipe_id = ${recipes.id}
        )
      )`,
      shareComment: recipeShares.comment,
      sharedAt: recipeShares.createdAt,
      sharedByName: users.name,
    })
    .from(recipeShares)
    .innerJoin(recipes, eq(recipes.id, recipeShares.recipeId))
    .innerJoin(users, eq(users.id, recipeShares.userId))
    .where(whereClause)
    .orderBy(sql`${recipeShares.createdAt} DESC`)
    .limit(limit)
    .offset(offset);

  const mapped = result.map((r) => ({
    ...r,
    imageUrl: r.imageUrl ? `${imageBase}/${r.imageUrl}` : null,
  }));

  return c.json(mapped);
});

// Get single shared recipe detail (for modal preview)
app.get("/recipe/:id", async (c) => {
  const id = c.req.param("id");

  const result = await db.query.recipes.findFirst({
    where: sql`${recipes.id} = ${id}`,
    with: {
      ingredients: true,
      images: true,
      recipeTags: { with: { tag: true } },
      user: true,
    },
  });

  if (!result) return c.json({ error: "Not found" }, 404);

  const imageBase = S3_PUBLIC_URL || "/images/kookos";
  if (result.images) {
    result.images = result.images.map((img) => ({
      ...img,
      url: `${imageBase}/${img.url}`,
    }));
  }

  const { user, ...recipe } = result;
  return c.json({ ...recipe, userName: user.name });
});

// Copy shared recipes to current user (reuse community copy logic)
app.post("/copy", async (c) => {
  const currentUserId = c.get("user")!.id;
  const body = await c.req.json();
  const parsed = copyCommunityRecipesSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { recipeIds } = parsed.data;
  let copied = 0;

  for (const recipeId of recipeIds) {
    const source = await db.query.recipes.findFirst({
      where: eq(recipes.id, recipeId),
      with: {
        ingredients: true,
        images: true,
        recipeTags: { with: { tag: true } },
      },
    });

    if (!source || source.userId === currentUserId) continue;

    const sourceUser = await db.query.users.findFirst({
      where: eq(users.id, source.userId),
    });

    const [newRecipe] = await db
      .insert(recipes)
      .values({
        userId: currentUserId,
        title: source.title,
        description: source.description,
        instructions: source.instructions,
        servings: source.servings,
        prepTimeMinutes: source.prepTimeMinutes,
        cookTimeMinutes: source.cookTimeMinutes,
        cuisine: source.cuisine,
        category: source.category,
        difficulty: source.difficulty,
        source: "community",
        sourceRecipeId: source.id,
        notes: sourceUser ? `Gekopieerd van ${sourceUser.name}` : undefined,
        isFavorite: true,
      })
      .returning();

    if (source.ingredients.length) {
      await db.insert(recipeIngredients).values(
        source.ingredients.map((ing) => ({
          recipeId: newRecipe.id,
          name: ing.name,
          amount: ing.amount,
          unit: ing.unit,
          category: ing.category,
          isOptional: ing.isOptional,
          isSuggested: ing.isSuggested,
          sortOrder: ing.sortOrder,
        })),
      );
    }

    for (const img of source.images) {
      const newKey = await copyS3Image(img.url, newRecipe.id);
      if (newKey) {
        await db.insert(recipeImages).values({
          recipeId: newRecipe.id,
          url: newKey,
          isPrimary: img.isPrimary,
          caption: img.caption,
        });
      }
    }

    for (const rt of source.recipeTags) {
      if (rt.tag) {
        await db.insert(recipeTags).values({ recipeId: newRecipe.id, tagId: rt.tag.id });
      }
    }

    await db.update(recipes).set({ updatedAt: new Date() }).where(eq(recipes.id, newRecipe.id));

    copied++;
  }

  return c.json({ copied });
});

export default app;
