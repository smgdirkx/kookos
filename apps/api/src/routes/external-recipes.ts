import { searchExternalRecipesSchema } from "@kookos/shared";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { externalRecipes, recipes } from "../db/schema.js";
import { requireAuth } from "../middleware.js";
import { syncExternalRecipes } from "../services/scraper.js";
import type { AppEnv } from "../types.js";

const app = new Hono<AppEnv>();

app.use("*", requireAuth);

// List / search external recipes
app.get("/", async (c) => {
  const parsed = searchExternalRecipesSchema.safeParse({
    query: c.req.query("q"),
    page: c.req.query("page"),
    limit: c.req.query("limit"),
  });
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { query, page, limit } = parsed.data;
  const offset = (page - 1) * limit;
  const trimmedQuery = query?.trim();
  const userId = c.get("user")!.id;

  const selectFields = {
    id: externalRecipes.id,
    slug: externalRecipes.slug,
    sourceUrl: externalRecipes.sourceUrl,
    title: externalRecipes.title,
    description: externalRecipes.description,
    imageUrl: externalRecipes.imageUrl,
    author: externalRecipes.author,
    category: externalRecipes.category,
    ingredientsText: externalRecipes.ingredientsText,
    publishedAt: externalRecipes.publishedAt,
    importedRecipeId: recipes.id,
  };

  if (trimmedQuery) {
    // Combine tsvector (Dutch stemming) with ILIKE (partial/substring matches)
    // This ensures "knol" finds both stemmed matches AND compounds like "knolselderij"
    const likePattern = `%${trimmedQuery}%`;
    const results = await db
      .select(selectFields)
      .from(externalRecipes)
      .leftJoin(
        recipes,
        sql`${recipes.sourceUrl} = ${externalRecipes.sourceUrl} AND ${recipes.userId} = ${userId}`,
      )
      .where(
        sql`${externalRecipes.searchVector} @@ plainto_tsquery('dutch', ${trimmedQuery})
          OR ${externalRecipes.title} ILIKE ${likePattern}
          OR ${externalRecipes.ingredientsText} ILIKE ${likePattern}`,
      )
      .orderBy(
        // Rank tsvector matches higher, then alphabetical
        sql`CASE WHEN ${externalRecipes.searchVector} @@ plainto_tsquery('dutch', ${trimmedQuery}) THEN 0 ELSE 1 END,
          ${externalRecipes.title} ASC`,
      )
      .limit(limit)
      .offset(offset);

    return c.json(results);
  }

  const results = await db
    .select(selectFields)
    .from(externalRecipes)
    .leftJoin(
      recipes,
      sql`${recipes.sourceUrl} = ${externalRecipes.sourceUrl} AND ${recipes.userId} = ${userId}`,
    )
    .orderBy(sql`${externalRecipes.title} ASC`)
    .limit(limit)
    .offset(offset);

  return c.json(results);
});

// Trigger scraper sync (optional ?limit=N to batch)
app.post("/sync", async (c) => {
  const limitParam = c.req.query("limit");
  const batchSize = limitParam ? parseInt(limitParam, 10) : undefined;
  const result = await syncExternalRecipes(batchSize || undefined);
  return c.json(result);
});

export default app;
