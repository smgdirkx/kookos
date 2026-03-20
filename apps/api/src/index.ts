import { config } from "dotenv";

config({ path: "../../.env" });

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import cron from "node-cron";
import { auth } from "./auth.js";
import { authMiddleware } from "./middleware.js";
import aiRoutes from "./routes/ai.js";
import commentRoutes from "./routes/comments.js";
import externalRecipeRoutes from "./routes/external-recipes.js";
import imageRoutes from "./routes/images.js";
import mealPlanRoutes from "./routes/meal-plans.js";
import recipeRoutes from "./routes/recipes.js";
import tagRoutes from "./routes/tags.js";
import { ensureBucket } from "./s3.js";
import { syncExternalRecipes } from "./services/scraper.js";
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
app.route("/api/meal-plans", mealPlanRoutes);
app.route("/api/ai", aiRoutes);
app.route("/api/images", imageRoutes);
app.route("/api/tags", tagRoutes);
app.route("/api/external-recipes", externalRecipeRoutes);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

const port = Number(process.env.PORT) || 3000;

// Ensure S3 bucket exists, then start server
ensureBucket()
  .then(() => {
    console.log(`Kookos API starting on port ${port}`);
    serve({ fetch: app.fetch, port });

    // Nieuwe recepten ophalen van groentenabonnement.nl (max 10 per keer)
    // Stel SCRAPER_CRON in om te activeren, bijv. "* * * * *" of "0 4 * * *"
    const scraperCron = process.env.SCRAPER_CRON;
    if (scraperCron) {
      cron.schedule(scraperCron, () => {
        syncExternalRecipes(10).catch((err: unknown) =>
          console.error("[cron] External recipes sync failed:", err),
        );
      });
      console.log(`[cron] External recipes sync enabled (${scraperCron})`);
    }
  })
  .catch((err: unknown) => {
    console.error("Failed to initialize S3 bucket:", err);
    process.exit(1);
  });
