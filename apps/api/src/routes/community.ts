import { copyCommunityRecipesSchema, searchCommunityRecipesSchema } from "@kookos/shared";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { recipeImages, recipeIngredients, recipes, recipeTags, users } from "../db/schema.js";
import { copyS3Image } from "../image.js";
import { requireAuth } from "../middleware.js";
import type { AppEnv } from "../types.js";

const app = new Hono<AppEnv>();

const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL;

function withImageUrls<T extends { images?: { url: string }[] }>(recipe: T): T {
  if (recipe.images) {
    const base = S3_PUBLIC_URL || "/images/kookos";
    recipe.images = recipe.images.map((img) => ({
      ...img,
      url: `${base}/${img.url}`,
    }));
  }
  return recipe;
}

app.use("*", requireAuth);

// List users with recipe counts (all users including current)
app.get("/users", async (c) => {
  const result = await db
    .select({
      id: users.id,
      name: users.name,
      recipeCount: sql<number>`count(${recipes.id})::int`,
    })
    .from(users)
    .leftJoin(recipes, eq(recipes.userId, users.id))
    .groupBy(users.id, users.name)
    .having(sql`count(${recipes.id}) > 0`)
    .orderBy(sql`count(${recipes.id}) DESC`, users.name);

  return c.json(result);
});

// List / search community recipes
app.get("/recipes", async (c) => {
  const currentUserId = c.get("user")!.id;
  const parsed = searchCommunityRecipesSchema.safeParse({
    userId: c.req.query("userId"),
    query: c.req.query("q"),
    page: c.req.query("page"),
    limit: c.req.query("limit"),
  });
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { userId, query, page, limit } = parsed.data;
  const offset = (page - 1) * limit;
  const trimmedQuery = query?.trim();

  const imageBase = S3_PUBLIC_URL || "/images/kookos";

  let whereClause = userId ? sql`${recipes.userId} = ${userId}` : sql`TRUE`;

  if (trimmedQuery) {
    const likePattern = `%${trimmedQuery}%`;
    whereClause = sql`${whereClause} AND (
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
    })
    .from(recipes)
    .innerJoin(users, eq(users.id, recipes.userId))
    .where(whereClause)
    .orderBy(
      trimmedQuery
        ? sql`CASE WHEN ${recipes.searchVector} @@ plainto_tsquery('dutch', ${trimmedQuery}) THEN 0 ELSE 1 END, ${recipes.title} ASC`
        : sql`${recipes.title} ASC`,
    )
    .limit(limit)
    .offset(offset);

  // Prefix image URLs
  const mapped = result.map((r) => ({
    ...r,
    imageUrl: r.imageUrl ? `${imageBase}/${r.imageUrl}` : null,
  }));

  return c.json(mapped);
});

// Get single community recipe (view-only detail)
app.get("/recipes/:id", async (c) => {
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

  const { user, ...recipe } = withImageUrls(result);
  return c.json({ ...recipe, userName: user.name });
});

// Copy recipes to current user
app.post("/copy", async (c) => {
  const currentUserId = c.get("user")!.id;
  const body = await c.req.json();
  const parsed = copyCommunityRecipesSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { recipeIds } = parsed.data;
  let copied = 0;

  for (const recipeId of recipeIds) {
    // Fetch source recipe with all related data
    const source = await db.query.recipes.findFirst({
      where: eq(recipes.id, recipeId),
      with: {
        ingredients: true,
        images: true,
        recipeTags: { with: { tag: true } },
      },
    });

    if (!source || source.userId === currentUserId) continue;

    // Fetch source user name
    const sourceUser = await db.query.users.findFirst({
      where: eq(users.id, source.userId),
    });

    // Create new recipe for current user
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

    // Copy ingredients
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

    // Copy images (duplicate in S3 so deleting the original doesn't break the copy)
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

    // Copy tags (reuse existing tag records)
    for (const rt of source.recipeTags) {
      if (rt.tag) {
        await db.insert(recipeTags).values({ recipeId: newRecipe.id, tagId: rt.tag.id });
      }
    }

    // Trigger search vector rebuild
    await db.update(recipes).set({ updatedAt: new Date() }).where(eq(recipes.id, newRecipe.id));

    copied++;
  }

  return c.json({ copied });
});

export default app;
