import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { mealPlanItems, mealPlans } from "../db/schema.js";
import { requireAuth } from "../middleware.js";
import type { AppEnv } from "../types.js";

const app = new Hono<AppEnv>();

app.use("*", requireAuth);

const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL;

function resolveImageUrls<T extends { items: { recipe: { images?: { url: string }[] } }[] }>(
  plan: T,
): T {
  const base = S3_PUBLIC_URL || "/images/kookos";
  for (const item of plan.items) {
    if (item.recipe.images) {
      item.recipe.images = item.recipe.images.map((img) => ({
        ...img,
        url: `${base}/${img.url}`,
      }));
    }
  }
  return plan;
}

// List all meal plans for current user
app.get("/", async (c) => {
  const user = c.get("user")!;
  const result = await db.query.mealPlans.findMany({
    where: eq(mealPlans.userId, user.id),
    orderBy: (mealPlans, { desc }) => [desc(mealPlans.createdAt)],
    with: { items: { with: { recipe: { with: { comments: true, images: true } } } } },
  });
  return c.json(result.map(resolveImageUrls));
});

// Get meal plans that contain a specific recipe
app.get("/by-recipe/:recipeId", async (c) => {
  const recipeId = c.req.param("recipeId");
  const user = c.get("user")!;

  const items = await db.query.mealPlanItems.findMany({
    where: eq(mealPlanItems.recipeId, recipeId),
    with: {
      mealPlan: {
        with: { items: { with: { recipe: { with: { comments: true, images: true } } } } },
      },
    },
  });

  // Filter to user's plans and deduplicate
  const planMap = new Map<string, (typeof items)[0]["mealPlan"]>();
  for (const item of items) {
    if (item.mealPlan.userId === user.id) {
      planMap.set(item.mealPlan.id, item.mealPlan);
    }
  }

  const plans = [...planMap.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return c.json(plans.map(resolveImageUrls));
});

// Get single meal plan with items and shopping list
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user")!;

  const result = await db.query.mealPlans.findFirst({
    where: sql`${mealPlans.id} = ${id} AND ${mealPlans.userId} = ${user.id}`,
    with: {
      items: {
        with: { recipe: { with: { comments: true, images: true } } },
      },
      shoppingLists: {
        with: { items: true },
      },
    },
  });

  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(resolveImageUrls(result));
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
  endDate.setDate(endDate.getDate() + Math.max(items.length, 1) - 1);

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

  return c.json(mealPlan, 201);
});

// Update meal plan (start date)
app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user")!;
  const body = await c.req.json();
  const { startDate } = body as { startDate: string };

  const plan = await db.query.mealPlans.findFirst({
    where: sql`${mealPlans.id} = ${id} AND ${mealPlans.userId} = ${user.id}`,
    with: { items: true },
  });
  if (!plan) return c.json({ error: "Not found" }, 404);

  // Shift all items by the date offset
  const oldStart = new Date(plan.startDate);
  const newStart = new Date(startDate);
  const offsetMs = newStart.getTime() - oldStart.getTime();

  for (const item of plan.items) {
    const newDate = new Date(new Date(item.date).getTime() + offsetMs);
    await db
      .update(mealPlanItems)
      .set({ date: newDate.toISOString().split("T")[0] })
      .where(eq(mealPlanItems.id, item.id));
  }

  const newEnd = new Date(newStart);
  newEnd.setDate(newEnd.getDate() + plan.items.length - 1);

  const [updated] = await db
    .update(mealPlans)
    .set({
      startDate,
      endDate: newEnd.toISOString().split("T")[0],
      updatedAt: new Date(),
    })
    .where(eq(mealPlans.id, id))
    .returning();

  return c.json(updated);
});

// Add item to meal plan
app.post("/:id/items", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user")!;
  const body = await c.req.json();
  const { recipeId, date, mealType } = body as {
    recipeId: string;
    date: string;
    mealType?: string;
  };

  const plan = await db.query.mealPlans.findFirst({
    where: sql`${mealPlans.id} = ${id} AND ${mealPlans.userId} = ${user.id}`,
  });
  if (!plan) return c.json({ error: "Not found" }, 404);

  const [item] = await db
    .insert(mealPlanItems)
    .values({
      mealPlanId: id,
      recipeId,
      date,
      mealType: mealType ?? "dinner",
    })
    .returning();

  return c.json(item, 201);
});

// Reorder meal plan items (swap dates)
app.patch("/:id/items/reorder", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user")!;
  const body = await c.req.json();
  const { itemIds } = body as { itemIds: string[] };

  const plan = await db.query.mealPlans.findFirst({
    where: sql`${mealPlans.id} = ${id} AND ${mealPlans.userId} = ${user.id}`,
    with: { items: true },
  });
  if (!plan) return c.json({ error: "Not found" }, 404);

  // Get sorted dates from existing items
  const sortedDates = plan.items
    .map((i) => i.date)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  // Assign dates in order to the new item order
  for (let i = 0; i < itemIds.length; i++) {
    if (sortedDates[i]) {
      await db
        .update(mealPlanItems)
        .set({ date: sortedDates[i] })
        .where(eq(mealPlanItems.id, itemIds[i]));
    }
  }

  return c.json({ ok: true });
});

// Update item (checked state and/or note)
app.patch("/:id/items/:itemId", async (c) => {
  const id = c.req.param("id");
  const itemId = c.req.param("itemId");
  const user = c.get("user")!;
  const body = (await c.req.json()) as { checked?: boolean; note?: string | null };

  const plan = await db.query.mealPlans.findFirst({
    where: sql`${mealPlans.id} = ${id} AND ${mealPlans.userId} = ${user.id}`,
  });
  if (!plan) return c.json({ error: "Not found" }, 404);

  const updates: { checked?: boolean; note?: string | null } = {};
  if (typeof body.checked === "boolean") updates.checked = body.checked;
  if (body.note !== undefined) {
    const trimmed = body.note?.trim() ?? "";
    updates.note = trimmed.length > 0 ? trimmed : null;
  }

  const [updated] = await db
    .update(mealPlanItems)
    .set(updates)
    .where(eq(mealPlanItems.id, itemId))
    .returning();

  if (!updated) return c.json({ error: "Item not found" }, 404);
  return c.json(updated);
});

// Delete item from meal plan
app.delete("/:id/items/:itemId", async (c) => {
  const id = c.req.param("id");
  const itemId = c.req.param("itemId");
  const user = c.get("user")!;

  const plan = await db.query.mealPlans.findFirst({
    where: sql`${mealPlans.id} = ${id} AND ${mealPlans.userId} = ${user.id}`,
  });
  if (!plan) return c.json({ error: "Not found" }, 404);

  const [deleted] = await db.delete(mealPlanItems).where(eq(mealPlanItems.id, itemId)).returning();
  if (!deleted) return c.json({ error: "Item not found" }, 404);

  return c.json({ ok: true });
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
