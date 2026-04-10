import { generateRandomString } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { requireAuth } from "../middleware.js";
import type { AppEnv } from "../types.js";

const app = new Hono<AppEnv>();

function requireAdmin(c: { get: (key: "user") => AppEnv["Variables"]["user"] }) {
  const user = c.get("user")!;
  if (!user.email.endsWith("@drkx.nl")) {
    return false;
  }
  return true;
}

// GET /api/invitation-codes — list all codes (admin only)
app.get("/", requireAuth, async (c) => {
  if (!requireAdmin(c)) {
    return c.json({ error: "Geen toegang" }, 403);
  }

  const codes = await db.query.invitationCodes.findMany({
    orderBy: (ic, { desc }) => desc(ic.createdAt),
  });

  return c.json(codes);
});

// POST /api/invitation-codes — generate a new code (admin only)
app.post("/", requireAuth, async (c) => {
  if (!requireAdmin(c)) {
    return c.json({ error: "Geen toegang" }, 403);
  }

  const user = c.get("user")!;
  const code = generateRandomString(8, "A-Z", "0-9");

  const [created] = await db
    .insert(schema.invitationCodes)
    .values({
      code,
      createdBy: user.id,
    })
    .returning();

  return c.json(created, 201);
});

// PATCH /api/invitation-codes/:id — toggle active state (admin only)
app.patch("/:id", requireAuth, async (c) => {
  if (!requireAdmin(c)) {
    return c.json({ error: "Geen toegang" }, 403);
  }

  const id = c.req.param("id");
  const code = await db.query.invitationCodes.findFirst({
    where: (ic, { eq }) => eq(ic.id, id),
  });

  if (!code) {
    return c.json({ error: "Code niet gevonden" }, 404);
  }

  const [updated] = await db
    .update(schema.invitationCodes)
    .set({ active: !code.active })
    .where(eq(schema.invitationCodes.id, id))
    .returning();

  return c.json(updated);
});

// DELETE /api/invitation-codes/:id — delete unused code (admin only)
app.delete("/:id", requireAuth, async (c) => {
  if (!requireAdmin(c)) {
    return c.json({ error: "Geen toegang" }, 403);
  }

  const id = c.req.param("id");

  const code = await db.query.invitationCodes.findFirst({
    where: (ic, { eq }) => eq(ic.id, id),
  });

  if (!code) {
    return c.json({ error: "Code niet gevonden" }, 404);
  }

  await db.delete(schema.invitationCodes).where(eq(schema.invitationCodes.id, id));

  return c.json({ ok: true });
});

export default app;
