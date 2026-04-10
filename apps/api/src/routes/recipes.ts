import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createRecipeSchema, updateRecipeSchema } from "@kookos/shared";
import { and, eq, lt, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { recipeImages, recipeIngredients, recipes, recipeTags, tags } from "../db/schema.js";
import { uploadBase64Image, uploadExternalImage } from "../image.js";
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

const PAGE_SIZE = 20;

// List recipes with cursor-based pagination and server-side filters
app.get("/", async (c) => {
  const user = c.get("user")!;
  const cursor = c.req.query("cursor"); // format: "timestamp_id"
  const q = c.req.query("q");
  const cuisine = c.req.query("cuisine");
  const category = c.req.query("category");
  const difficulty = c.req.query("difficulty");
  const tag = c.req.query("tag");
  const shared = c.req.query("shared");
  const maxTime = c.req.query("maxTime");
  const limit = Math.min(Number(c.req.query("limit")) || PAGE_SIZE, 50);

  const conditions = [eq(recipes.userId, user.id)];

  // Diet preference filters
  if (!user.allowMeat) conditions.push(eq(recipes.hasMeat, false));
  if (!user.allowFish) conditions.push(eq(recipes.hasFish, false));

  // Full-text search: tsvector with prefix matching for partial words,
  // fallback to ILIKE on title when tsvector misses
  if (q?.trim()) {
    // Strip tsquery special characters to prevent syntax errors
    const sanitized = q.trim().replace(/[&|!:*()\\<>']/g, " ");
    const words = sanitized.split(/\s+/).filter(Boolean);
    if (words.length > 0) {
      // Last word gets prefix matching (:*) for type-ahead behavior
      const tsTerms = words.map((w, i) => (i === words.length - 1 ? `${w}:*` : w)).join(" & ");
      conditions.push(
        sql`(
          ${recipes.searchVector} @@ to_tsquery('dutch', ${tsTerms})
          OR ${recipes.title} ILIKE ${"%" + q.trim() + "%"}
        )`,
      );
    }
  }

  if (cuisine) {
    const values = cuisine.split(",").filter(Boolean);
    if (values.length === 1) {
      conditions.push(eq(recipes.cuisine, values[0]));
    } else {
      conditions.push(
        sql`${recipes.cuisine} IN (${sql.join(
          values.map((v) => sql`${v}`),
          sql`, `,
        )})`,
      );
    }
  }
  if (category) {
    const values = category.split(",").filter(Boolean);
    if (values.length === 1) {
      conditions.push(eq(recipes.category, values[0]));
    } else {
      conditions.push(
        sql`${recipes.category} IN (${sql.join(
          values.map((v) => sql`${v}`),
          sql`, `,
        )})`,
      );
    }
  }
  if (difficulty) {
    const values = difficulty.split(",").filter(Boolean);
    if (values.length === 1) {
      conditions.push(eq(recipes.difficulty, values[0]));
    } else {
      conditions.push(
        sql`${recipes.difficulty} IN (${sql.join(
          values.map((v) => sql`${v}`),
          sql`, `,
        )})`,
      );
    }
  }
  if (maxTime) {
    const max = Number(maxTime);
    if (max > 0) {
      conditions.push(
        sql`(COALESCE(${recipes.prepTimeMinutes}, 0) + COALESCE(${recipes.cookTimeMinutes}, 0)) > 0`,
      );
      conditions.push(
        sql`(COALESCE(${recipes.prepTimeMinutes}, 0) + COALESCE(${recipes.cookTimeMinutes}, 0)) <= ${max}`,
      );
    }
  }

  // Tag filter: recipe must have at least one of the selected tags
  if (tag) {
    const values = tag.split(",").filter(Boolean);
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM recipe_tags rt
        JOIN tags t ON t.id = rt.tag_id
        WHERE rt.recipe_id = ${recipes.id} AND t.name IN (${sql.join(
          values.map((v) => sql`${v}`),
          sql`, `,
        )})
      )`,
    );
  }

  // Shared filter: only recipes that have been shared (heart)
  if (shared === "true") {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM recipe_shares rs
        WHERE rs.recipe_id = ${recipes.id} AND rs.user_id = ${user.id}
      )`,
    );
  }

  // Cursor pagination: "createdAt|id" — fetch rows older than cursor
  if (cursor) {
    const sep = cursor.indexOf("|");
    const cursorTs = sep > 0 ? cursor.slice(0, sep) : null;
    const cursorId = sep > 0 ? cursor.slice(sep + 1) : null;
    if (cursorTs && cursorId) {
      const cursorDate = new Date(cursorTs);
      conditions.push(
        or(
          lt(recipes.createdAt, cursorDate),
          and(eq(recipes.createdAt, cursorDate), sql`${recipes.id} < ${cursorId}`),
        )!,
      );
    }
  }

  // Total count of user's recipes (with diet filters applied) — only on first page
  const dietConditions = [eq(recipes.userId, user.id)];
  if (!user.allowMeat) dietConditions.push(eq(recipes.hasMeat, false));
  if (!user.allowFish) dietConditions.push(eq(recipes.hasFish, false));
  const totalCountPromise = !cursor
    ? db
        .select({ count: sql<number>`COUNT(*)` })
        .from(recipes)
        .where(and(...dietConditions))
        .then((rows) => Number(rows[0].count))
    : null;

  const resultPromise = db.query.recipes.findMany({
    where: and(...conditions),
    with: {
      images: true,
      recipeTags: { with: { tag: true } },
      comments: true,
    },
    orderBy: (recipes, { desc }) => [desc(recipes.createdAt), desc(recipes.id)],
    limit: limit + 1,
  });

  const [result, totalCount] = await Promise.all([resultPromise, totalCountPromise]);

  const hasMore = result.length > limit;
  const page = hasMore ? result.slice(0, limit) : result;
  const nextCursor = hasMore
    ? `${page[page.length - 1].createdAt.toISOString()}|${page[page.length - 1].id}`
    : null;

  return c.json({
    recipes: page.map(withImageUrls),
    nextCursor,
    ...(totalCount !== null ? { totalCount } : {}),
  });
});

// Filter options for the current user's recipes
app.get("/filters", async (c) => {
  const user = c.get("user")!;

  const [cuisineRows, categoryRows, tagRows, timeRows] = await Promise.all([
    db
      .selectDistinct({ cuisine: recipes.cuisine })
      .from(recipes)
      .where(and(eq(recipes.userId, user.id), sql`${recipes.cuisine} IS NOT NULL`)),
    db
      .selectDistinct({ category: recipes.category })
      .from(recipes)
      .where(and(eq(recipes.userId, user.id), sql`${recipes.category} IS NOT NULL`)),
    db
      .selectDistinct({ name: tags.name })
      .from(tags)
      .innerJoin(recipeTags, eq(recipeTags.tagId, tags.id))
      .innerJoin(recipes, eq(recipes.id, recipeTags.recipeId))
      .where(eq(recipes.userId, user.id)),
    db
      .select({
        maxTime: sql<number>`MAX(COALESCE(${recipes.prepTimeMinutes}, 0) + COALESCE(${recipes.cookTimeMinutes}, 0))`,
      })
      .from(recipes)
      .where(eq(recipes.userId, user.id)),
  ]);

  return c.json({
    cuisines: cuisineRows.map((r) => r.cuisine!).sort(),
    categories: categoryRows.map((r) => r.category!).sort(),
    tags: tagRows.map((r) => r.name).sort(),
    maxCookTime: timeRows[0]?.maxTime ?? 120,
  });
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
  const { imageUrl, scanImage, scanMediaType, ...recipeBody } = body;
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
        isSuggested: ing.isSuggested,
        sortOrder: ing.sortOrder ?? i,
      })),
    );
  }

  // Upload scan photo to S3 (original scan, not shown in gallery)
  if (scanImage && scanMediaType) {
    const s3Key = await uploadBase64Image(scanImage, scanMediaType, recipe.id);
    if (s3Key) {
      await db.insert(recipeImages).values({
        recipeId: recipe.id,
        url: s3Key,
        isPrimary: false,
        caption: "scan-original",
      });
    }
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
          isSuggested: ing.isSuggested,
          sortOrder: ing.sortOrder ?? i,
        })),
      );
    }
    // Trigger search vector rebuild after ingredients change
    await db.update(recipes).set({ updatedAt: new Date() }).where(eq(recipes.id, id));
  }

  // Replace tags if provided
  if (tagNames) {
    await db.delete(recipeTags).where(eq(recipeTags.recipeId, id));
    for (const tagName of tagNames) {
      const [tag] = await db
        .insert(tags)
        .values({ name: tagName })
        .onConflictDoNothing()
        .returning();

      const existingTag = tag ?? (await db.query.tags.findFirst({ where: eq(tags.name, tagName) }));

      if (existingTag) {
        await db.insert(recipeTags).values({ recipeId: id, tagId: existingTag.id });
      }
    }
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
