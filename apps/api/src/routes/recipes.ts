import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createRecipeSchema, updateRecipeSchema } from "@kookos/shared";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { recipeImages, recipeIngredients, recipes, recipeTags, tags } from "../db/schema.js";
import { uploadExternalImage } from "../image.js";
import { requireAuth } from "../middleware.js";
import { S3_BUCKET, s3 } from "../s3.js";
import type { AppEnv } from "../types.js";

const app = new Hono<AppEnv>();

app.use("*", requireAuth);

/** Strip AI placeholder values like "<UNKNOWN>" from ingredient fields */
function cleanIngredientField(value: string | undefined): string | undefined {
  if (!value || value.startsWith("<")) return undefined;
  return value;
}

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

// List all recipes for current user
app.get("/", async (c) => {
  const user = c.get("user")!;
  const result = await db.query.recipes.findMany({
    where: eq(recipes.userId, user.id),
    with: {
      ingredients: true,
      images: true,
      recipeTags: { with: { tag: true } },
    },
    orderBy: (recipes, { desc }) => [desc(recipes.createdAt)],
  });
  return c.json(result.map(withImageUrls));
});

// Search recipes using tsvector
app.get("/search", async (c) => {
  const user = c.get("user")!;
  const query = c.req.query("q");
  if (!query) return c.json({ error: "Query parameter 'q' is required" }, 400);

  const result = await db
    .select()
    .from(recipes)
    .where(
      sql`${recipes.userId} = ${user.id} AND ${recipes.searchVector} @@ plainto_tsquery('dutch', ${query})`,
    )
    .orderBy(sql`ts_rank(${recipes.searchVector}, plainto_tsquery('dutch', ${query})) DESC`);

  return c.json(result);
});

// Get single recipe
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user")!;
  const result = await db.query.recipes.findFirst({
    where: sql`${recipes.id} = ${id} AND ${recipes.userId} = ${user.id}`,
    with: {
      ingredients: true,
      images: true,
      recipeTags: { with: { tag: true } },
    },
  });
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(withImageUrls(result));
});

// Create recipe (with ingredients and tags)
app.post("/", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { imageUrl, ...recipeBody } = body;
  const parsed = createRecipeSchema.safeParse(recipeBody);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { ingredients, tags: tagNames, ...recipeData } = parsed.data;

  const [recipe] = await db
    .insert(recipes)
    .values({ ...recipeData, userId: user.id })
    .returning();

  // Insert ingredients
  if (ingredients?.length) {
    await db.insert(recipeIngredients).values(
      ingredients.map((ing, i) => ({
        recipeId: recipe.id,
        name: ing.name,
        amount: cleanIngredientField(ing.amount),
        unit: cleanIngredientField(ing.unit),
        category: ing.category,
        isOptional: ing.isOptional,
        sortOrder: ing.sortOrder ?? i,
      })),
    );
  }

  // Download external image to S3 and save reference
  if (imageUrl) {
    const s3Key = await uploadExternalImage(imageUrl, recipe.id);
    if (s3Key) {
      await db.insert(recipeImages).values({
        recipeId: recipe.id,
        url: s3Key,
        isPrimary: true,
      });
    }
  }

  // Trigger search vector rebuild after ingredients are inserted
  if (ingredients?.length) {
    await db.update(recipes).set({ updatedAt: new Date() }).where(eq(recipes.id, recipe.id));
  }

  // Insert tags
  if (tagNames?.length) {
    for (const tagName of tagNames) {
      const [tag] = await db
        .insert(tags)
        .values({ name: tagName })
        .onConflictDoNothing()
        .returning();

      const existingTag = tag ?? (await db.query.tags.findFirst({ where: eq(tags.name, tagName) }));

      if (existingTag) {
        await db.insert(recipeTags).values({ recipeId: recipe.id, tagId: existingTag.id });
      }
    }
  }

  return c.json(recipe, 201);
});

// Update recipe
app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user")!;
  const body = await c.req.json();
  const parsed = updateRecipeSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { ingredients, tags: tagNames, ...recipeData } = parsed.data;

  const [recipe] = await db
    .update(recipes)
    .set({ ...recipeData, updatedAt: new Date() })
    .where(sql`${recipes.id} = ${id} AND ${recipes.userId} = ${user.id}`)
    .returning();

  if (!recipe) return c.json({ error: "Not found" }, 404);

  // Replace ingredients if provided
  if (ingredients) {
    await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));
    if (ingredients.length) {
      await db.insert(recipeIngredients).values(
        ingredients.map((ing, i) => ({
          recipeId: id,
          name: ing.name,
          amount: cleanIngredientField(ing.amount),
          unit: cleanIngredientField(ing.unit),
          category: ing.category,
          isOptional: ing.isOptional,
          sortOrder: ing.sortOrder ?? i,
        })),
      );
    }
    // Trigger search vector rebuild after ingredients change
    await db.update(recipes).set({ updatedAt: new Date() }).where(eq(recipes.id, id));
  }

  return c.json(recipe);
});

// Delete recipe
app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user")!;

  // Delete associated images from S3 before removing the recipe
  const images = await db.query.recipeImages.findMany({
    where: sql`${recipeImages.recipeId} = ${id}`,
  });

  for (const image of images) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: image.url }));
    } catch {
      // Continue even if S3 delete fails
    }
  }

  const [deleted] = await db
    .delete(recipes)
    .where(sql`${recipes.id} = ${id} AND ${recipes.userId} = ${user.id}`)
    .returning();
  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

export default app;
