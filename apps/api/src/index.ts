import { config } from "dotenv";

config({ path: "../../.env" });

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { auth } from "./auth.js";
import { authMiddleware } from "./middleware.js";
import aiRoutes from "./routes/ai.js";
import commentRoutes from "./routes/comments.js";
import recipeRoutes from "./routes/recipes.js";
import type { AppEnv } from "./types.js";

const app = new Hono<AppEnv>();

// Global middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173"],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

// Better Auth handler
app.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

// Session middleware for all /api routes
app.use("/api/*", authMiddleware);

// Routes
app.route("/api/recipes", recipeRoutes);
app.route("/api/recipes/:recipeId/comments", commentRoutes);
app.route("/api/ai", aiRoutes);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

const port = Number(process.env.PORT) || 3000;
console.log(`🍳 Kookos API starting on port ${port}`);
serve({ fetch: app.fetch, port });
