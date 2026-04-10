import { generateRandomString, hashPassword } from "better-auth/crypto";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import type { AppEnv } from "../types.js";

const app = new Hono<AppEnv>();

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  invitationCode: z.string().min(1),
});

// POST /api/register — public registration with invitation code
app.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Ongeldige invoer", details: parsed.error.flatten() }, 400);
  }

  const { name, email, password, invitationCode } = parsed.data;

  // Check invitation code
  const code = await db.query.invitationCodes.findFirst({
    where: (ic, { eq, and }) => and(eq(ic.code, invitationCode), eq(ic.active, true)),
  });
  if (!code) {
    return c.json({ error: "Ongeldige of gedeactiveerde uitnodigingscode" }, 403);
  }

  // Check if email already exists
  const existing = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, email),
  });
  if (existing) {
    return c.json({ error: "Er bestaat al een gebruiker met dit e-mailadres" }, 409);
  }

  const hashedPw = await hashPassword(password);
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
      password: hashedPw,
      createdAt: now,
      updatedAt: now,
    });
  });

  return c.json({ id: userId, name, email }, 201);
});

export default app;
