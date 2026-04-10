import { generateRandomString, hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { requireAuth } from "../middleware.js";
import type { AppEnv } from "../types.js";

const app = new Hono<AppEnv>();

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  allowMeat: z.boolean().optional(),
  allowFish: z.boolean().optional(),
});

// GET /api/users/me — get own profile including diet preferences
app.get("/me", requireAuth, async (c) => {
  const currentUser = c.get("user")!;
  const user = await db.query.users.findFirst({
    where: (u, { eq: e }) => e(u.id, currentUser.id),
    columns: { id: true, name: true, email: true, allowMeat: true, allowFish: true },
  });
  if (!user) return c.json({ error: "Not found" }, 404);
  return c.json(user);
});

// PATCH /api/users/me — update own profile
app.patch("/me", requireAuth, async (c) => {
  const currentUser = c.get("user")!;
  const body = await c.req.json();
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Ongeldige invoer", details: parsed.error.flatten() }, 400);
  }

  const { name, email, password, allowMeat, allowFish } = parsed.data;

  if (email && email !== currentUser.email) {
    const existing = await db.query.users.findFirst({
      where: (u, { eq: e }) => e(u.email, email),
    });
    if (existing) {
      return c.json({ error: "Er bestaat al een gebruiker met dit e-mailadres" }, 409);
    }
  }

  const now = new Date();

  // Update user table
  const userUpdate: Record<string, unknown> = { updatedAt: now };
  if (name) userUpdate.name = name;
  if (email) userUpdate.email = email;
  if (allowMeat !== undefined) userUpdate.allowMeat = allowMeat;
  if (allowFish !== undefined) userUpdate.allowFish = allowFish;

  if (Object.keys(userUpdate).length > 1) {
    await db.update(schema.users).set(userUpdate).where(eq(schema.users.id, currentUser.id));
  }

  // Update password in accounts table
  if (password) {
    const hashedPassword = await hashPassword(password);
    await db
      .update(schema.accounts)
      .set({ password: hashedPassword, updatedAt: now })
      .where(eq(schema.accounts.userId, currentUser.id));
  }

  const updated = await db.query.users.findFirst({
    where: (u, { eq: e }) => e(u.id, currentUser.id),
    columns: { id: true, name: true, email: true, allowMeat: true, allowFish: true },
  });

  return c.json(updated!);
});

// POST /api/users — create a new user (only @drkx.nl admins)
app.post("/", requireAuth, async (c) => {
  const currentUser = c.get("user")!;

  if (!currentUser.email.endsWith("@drkx.nl")) {
    return c.json({ error: "Alleen drkx.nl gebruikers mogen nieuwe gebruikers aanmaken" }, 403);
  }

  const body = await c.req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Ongeldige invoer", details: parsed.error.flatten() }, 400);
  }

  const { name, email, password } = parsed.data;

  // Check if email already exists
  const existing = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, email),
  });
  if (existing) {
    return c.json({ error: "Er bestaat al een gebruiker met dit e-mailadres" }, 409);
  }

  const hashedPassword = await hashPassword(password);
  const userId = generateRandomString(32, "a-z", "A-Z", "0-9");
  const accountId = generateRandomString(32, "a-z", "A-Z", "0-9");
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(schema.users).values({
      id: userId,
      name,
      email,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    await tx.insert(schema.accounts).values({
      id: accountId,
      userId,
      accountId: userId,
      providerId: "credential",
      password: hashedPassword,
      createdAt: now,
      updatedAt: now,
    });
  });

  return c.json({ id: userId, name, email }, 201);
});

export default app;
