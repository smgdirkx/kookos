import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { auth } from "./auth.js";
import { db } from "./db/index.js";
import { users } from "./db/schema.js";
import type { AppEnv } from "./types.js";

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    c.set("user", null);
    c.set("session", null);
    return next();
  }

  // Enrich user with diet preferences from DB
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { allowMeat: true, allowFish: true },
  });

  c.set("user", {
    ...session.user,
    allowMeat: dbUser?.allowMeat ?? false,
    allowFish: dbUser?.allowFish ?? false,
  });
  c.set("session", session.session);
  return next();
});

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
});
