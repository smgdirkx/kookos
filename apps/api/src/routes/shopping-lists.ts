import { and, eq, inArray, sql } from "drizzle-orm";
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

// ── Helpers ──

type RawIngredientItem = {
  name: string;
  amount: string | null;
  unit: string | null;
  recipeId: string;
  isSuggested: boolean;
  category: string | null;
  sortOrder: number;
};

async function buildItemsFromMealPlan(mealPlanId: string): Promise<RawIngredientItem[]> {
  const items = await db.query.mealPlanItems.findMany({
    where: eq(mealPlanItems.mealPlanId, mealPlanId),
  });
  if (!items.length) return [];

  const recipeIds = [...new Set(items.map((i) => i.recipeId))];
  const recipeCountMap = new Map<string, number>();
  for (const item of items) {
    recipeCountMap.set(item.recipeId, (recipeCountMap.get(item.recipeId) ?? 0) + 1);
  }

  const allIngredients = await db
    .select()
    .from(recipeIngredients)
    .where(inArray(recipeIngredients.recipeId, recipeIds));

  // Store each ingredient individually (1:1 with recipe), multiply amount by recipe count
  const result: RawIngredientItem[] = [];
  for (const ing of allIngredients) {
    const times = recipeCountMap.get(ing.recipeId) ?? 1;
    const parsedAmount = Number.parseFloat(ing.amount ?? "") || 0;
    const totalAmount = parsedAmount * times;

    result.push({
      name: ing.name,
      amount: totalAmount > 0 ? String(totalAmount) : ing.amount,
      unit: ing.unit,
      recipeId: ing.recipeId,
      isSuggested: ing.isSuggested,
      category: ing.category,
      sortOrder: ing.sortOrder,
    });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name, "nl"));
}

// ── List all shopping lists ──

app.get("/", async (c) => {
  const user = c.get("user")!;

  const lists = await db.query.shoppingLists.findMany({
    where: eq(shoppingLists.userId, user.id),
    orderBy: (shoppingLists, { desc }) => [desc(shoppingLists.createdAt)],
    with: {
      items: true,
      mealPlan: { columns: { name: true } },
    },
  });

  return c.json(
    lists.map((list) => ({
      id: list.id,
      name: list.name,
      mealPlanId: list.mealPlanId,
      mealPlanName: list.mealPlan?.name ?? null,
      itemCount: list.items.length,
      checkedCount: list.items.filter((i) => i.checked).length,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
    })),
  );
});

// ── Create shopping list ──

app.post("/", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { name, mealPlanId } = body as { name: string; mealPlanId?: string };

  if (!name?.trim()) return c.json({ error: "Name is required" }, 400);

  // If based on meal plan, verify ownership
  if (mealPlanId) {
    const plan = await db.query.mealPlans.findFirst({
      where: sql`${mealPlans.id} = ${mealPlanId} AND ${mealPlans.userId} = ${user.id}`,
    });
    if (!plan) return c.json({ error: "Meal plan not found" }, 404);
  }

  const [list] = await db
    .insert(shoppingLists)
    .values({
      userId: user.id,
      mealPlanId: mealPlanId ?? null,
      name: name.trim(),
    })
    .returning();

  // Pre-fill from meal plan ingredients
  if (mealPlanId) {
    const rawItems = await buildItemsFromMealPlan(mealPlanId);
    if (rawItems.length > 0) {
      await db.insert(shoppingListItems).values(
        rawItems.map((item, idx) => ({
          shoppingListId: list.id,
          name: item.name,
          amount: item.amount ?? undefined,
          unit: item.unit ?? undefined,
          recipeId: item.recipeId,
          isSuggested: item.isSuggested,
          category: item.category,
          sortOrder: idx,
        })),
      );
    }
  }

  return c.json(list, 201);
});

// ── Get shopping list with items ──

app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user")!;

  const list = await db.query.shoppingLists.findFirst({
    where: sql`${shoppingLists.id} = ${id} AND ${shoppingLists.userId} = ${user.id}`,
    with: {
      items: {
        with: {
          recipe: { columns: { id: true, title: true } },
        },
      },
      mealPlan: { columns: { id: true, name: true } },
    },
  });

  if (!list) return c.json({ error: "Not found" }, 404);

  return c.json({
    ...list,
    items: list.items.sort((a, b) => a.sortOrder - b.sortOrder),
  });
});

// ── Update shopping list name ──

app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user")!;
  const body = await c.req.json();
  const { name } = body as { name: string };

  if (!name?.trim()) return c.json({ error: "Name is required" }, 400);

  const [updated] = await db
    .update(shoppingLists)
    .set({ name: name.trim(), updatedAt: new Date() })
    .where(sql`${shoppingLists.id} = ${id} AND ${shoppingLists.userId} = ${user.id}`)
    .returning();

  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});

// ── Delete shopping list ──

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user")!;

  const [deleted] = await db
    .delete(shoppingLists)
    .where(sql`${shoppingLists.id} = ${id} AND ${shoppingLists.userId} = ${user.id}`)
    .returning();

  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ── Add item to shopping list ──

app.post("/:id/items", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user")!;
  const body = await c.req.json();
  const { name, amount, unit } = body as { name: string; amount?: string; unit?: string };

  if (!name?.trim()) return c.json({ error: "Name is required" }, 400);

  const list = await db.query.shoppingLists.findFirst({
    where: sql`${shoppingLists.id} = ${id} AND ${shoppingLists.userId} = ${user.id}`,
  });
  if (!list) return c.json({ error: "Not found" }, 404);

  // Get max sort order
  const existing = await db.query.shoppingListItems.findMany({
    where: eq(shoppingListItems.shoppingListId, id),
  });
  const maxSort = existing.reduce((max, item) => Math.max(max, item.sortOrder), 0);

  const [item] = await db
    .insert(shoppingListItems)
    .values({
      shoppingListId: id,
      name: name.trim(),
      amount: amount?.trim() || undefined,
      unit: unit?.trim() || undefined,
      isExtra: true,
      sortOrder: maxSort + 1,
    })
    .returning();

  return c.json(item, 201);
});

// ── Update shopping list item ──

app.patch("/:id/items/:itemId", async (c) => {
  const id = c.req.param("id");
  const itemId = c.req.param("itemId");
  const user = c.get("user")!;
  const body = await c.req.json();

  const list = await db.query.shoppingLists.findFirst({
    where: sql`${shoppingLists.id} = ${id} AND ${shoppingLists.userId} = ${user.id}`,
  });
  if (!list) return c.json({ error: "Not found" }, 404);

  const { name, amount, unit, checked } = body as {
    name?: string;
    amount?: string;
    unit?: string;
    checked?: boolean;
  };

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (amount !== undefined) updates.amount = amount.trim() || null;
  if (unit !== undefined) updates.unit = unit.trim() || null;
  if (checked !== undefined) updates.checked = checked;

  const [updated] = await db
    .update(shoppingListItems)
    .set(updates)
    .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.shoppingListId, id)))
    .returning();

  if (!updated) return c.json({ error: "Item not found" }, 404);
  return c.json(updated);
});

// ── Delete shopping list item ──

app.delete("/:id/items/:itemId", async (c) => {
  const id = c.req.param("id");
  const itemId = c.req.param("itemId");
  const user = c.get("user")!;

  const list = await db.query.shoppingLists.findFirst({
    where: sql`${shoppingLists.id} = ${id} AND ${shoppingLists.userId} = ${user.id}`,
  });
  if (!list) return c.json({ error: "Not found" }, 404);

  const [deleted] = await db
    .delete(shoppingListItems)
    .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.shoppingListId, id)))
    .returning();

  if (!deleted) return c.json({ error: "Item not found" }, 404);
  return c.json({ ok: true });
});

export default app;
