import { Hono } from "hono";
import { db } from "../db/index.js";
import { tags } from "../db/schema.js";
import { requireAuth } from "../middleware.js";
import type { AppEnv } from "../types.js";

const app = new Hono<AppEnv>();

app.use("*", requireAuth);

// List all tags
app.get("/", async (c) => {
  const result = await db.select().from(tags).orderBy(tags.name);
  return c.json(result);
});

export default app;
