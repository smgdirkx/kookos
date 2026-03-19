import { eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import {
  mealPlanItems,
  mealPlans,
  recipeIngredients,
  shoppingListItems,
  shoppingLists,
} from "../db/schema.js";
import { requireAuth } from "../middleware.js";
import type { AppEnv } from "../types.js";

const app = new Hono<AppEnv>();

app.use("*", requireAuth);

// List all meal plans for current user
app.get("/", async (c) => {
  const user = c.get("user")!;
  const result = await db.query.mealPlans.findMany({
    where: eq(mealPlans.userId, user.id),
    orderBy: (mealPlans, { desc }) => [desc(mealPlans.createdAt)],
  });
  return c.json(result);
});

// Get single meal plan with items and shopping list
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user")!;

  const result = await db.query.mealPlans.findFirst({
    where: sql`${mealPlans.id} = ${id} AND ${mealPlans.userId} = ${user.id}`,
    with: {
      items: {
        with: { recipe: true },
      },
      shoppingLists: {
        with: { items: true },
      },
    },
  });

  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

// Save a generated meal plan
app.post("/", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();

  const { name, servings, items } = body as {
    name: string;
    servings: number;
    items: { recipeId: string; day: number }[];
  };

  // Calculate start/end dates from today
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + items.length - 1);

  const [mealPlan] = await db
    .insert(mealPlans)
    .values({
      userId: user.id,
      name,
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      servings,
    })
    .returning();

  // Insert meal plan items
  if (items.length) {
    await db.insert(mealPlanItems).values(
      items.map((item) => {
        const itemDate = new Date(startDate);
        itemDate.setDate(itemDate.getDate() + item.day - 1);
        return {
          mealPlanId: mealPlan.id,
          recipeId: item.recipeId,
          date: itemDate.toISOString().split("T")[0],
          mealType: "dinner",
        };
      }),
    );
  }

  // Build shopping list from recipe ingredients, aggregated by name+unit
  const recipeIds = [...new Set(items.map((i) => i.recipeId))];
  const recipeCountMap = new Map<string, number>();
  for (const item of items) {
    recipeCountMap.set(item.recipeId, (recipeCountMap.get(item.recipeId) ?? 0) + 1);
  }

  if (recipeIds.length > 0) {
    const allIngredients = await db
      .select()
      .from(recipeIngredients)
      .where(inArray(recipeIngredients.recipeId, recipeIds));

    // Aggregate: group by lowercase name + unit, sum amounts
    const aggregated = new Map<string, { name: string; amount: number; unit: string }>();
    for (const ing of allIngredients) {
      const times = recipeCountMap.get(ing.recipeId) ?? 1;
      const key = `${ing.name.toLowerCase()}::${(ing.unit ?? "").toLowerCase()}`;
      const existing = aggregated.get(key);
      const parsedAmount = parseFloat(ing.amount ?? "") || 0;
      const totalAmount = parsedAmount * times;

      if (existing) {
        existing.amount += totalAmount;
      } else {
        aggregated.set(key, {
          name: ing.name,
          amount: totalAmount,
          unit: ing.unit ?? "",
        });
      }
    }

    const shoppingItems = [...aggregated.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "nl"),
    );

    if (shoppingItems.length > 0) {
      const [list] = await db
        .insert(shoppingLists)
        .values({
          userId: user.id,
          mealPlanId: mealPlan.id,
          name: `Boodschappen - ${name}`,
        })
        .returning();

      await db.insert(shoppingListItems).values(
        shoppingItems.map((item) => ({
          shoppingListId: list.id,
          name: item.name,
          amount: item.amount > 0 ? String(item.amount) : undefined,
          unit: item.unit || undefined,
        })),
      );
    }
  }

  return c.json(mealPlan, 201);
});

// Delete meal plan
app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user")!;
  const [deleted] = await db
    .delete(mealPlans)
    .where(sql`${mealPlans.id} = ${id} AND ${mealPlans.userId} = ${user.id}`)
    .returning();
  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

export default app;
