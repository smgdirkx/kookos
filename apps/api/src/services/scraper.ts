import { db } from "../db/index.js";
import { externalRecipes } from "../db/schema.js";

const BASE_URL = "https://www.groentenabonnement.nl";
const SITEMAP_INDEXES = Array.from(
  { length: 8 },
  (_, i) => `${BASE_URL}/project-sitemap${i + 1}.xml`,
);
const RATE_LIMIT_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract all /recept/ URLs from sitemap XMLs */
async function fetchRecipeUrls(): Promise<string[]> {
  const urls: string[] = [];

  for (const sitemapUrl of SITEMAP_INDEXES) {
    try {
      const res = await fetch(sitemapUrl);
      if (!res.ok) continue;
      const xml = await res.text();

      // Extract <loc> URLs that are recipe pages
      const matches = [
        ...xml.matchAll(/<loc>(https:\/\/www\.groentenabonnement\.nl\/recept\/[^<]+)<\/loc>/g),
      ];
      for (const match of matches) {
        const url = match[1];
        // Skip the /recept/ index page
        if (url !== `${BASE_URL}/recept/` && url !== `${BASE_URL}/recept`) {
          urls.push(url);
        }
      }
    } catch (err: unknown) {
      console.error(`[scraper] Failed to fetch sitemap ${sitemapUrl}:`, err);
    }
  }

  return urls;
}

/** Extract slug from URL: /recept/some-slug/ → some-slug */
function extractSlug(url: string): string {
  const match = url.match(/\/recept\/([^/]+)/);
  return match?.[1] ?? url;
}

/** Parse a single recipe page */
function parseRecipePage(html: string, url: string) {
  // 1. Parse JSON-LD (Rank Math format)
  const ldMatch = html.match(/<script[^>]*class="rank-math-schema[^"]*">([\s\S]*?)<\/script>/);
  let title = "";
  let description: string | null = null;
  let imageUrl: string | null = null;
  let author: string | null = null;
  let category: string | null = null;
  let instructionsText: string | null = null;
  let publishedAt: Date | null = null;

  if (ldMatch) {
    try {
      const data = JSON.parse(ldMatch[1]);
      const graph = data["@graph"] || [];
      const recipe = graph.find((i: Record<string, unknown>) => i["@type"] === "Recipe");

      if (recipe) {
        title = (recipe.name || "").replace(/ - Groentenabonnement\.nl$/, "");
        description = recipe.description || null;
        imageUrl = recipe.image?.url || null;
        author = recipe.author?.name || null;
        category = recipe.recipeCategory || null;
        instructionsText = recipe.recipeInstructions || null;
        publishedAt = recipe.datePublished ? new Date(recipe.datePublished) : null;
      }
    } catch {
      console.error(`[scraper] Failed to parse JSON-LD for ${url}`);
    }
  }

  // Fallback title from HTML
  if (!title) {
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    title = titleMatch?.[1]?.trim() || extractSlug(url);
  }

  // Fallback image from og:image
  if (!imageUrl) {
    const ogMatch =
      html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    imageUrl = ogMatch?.[1] || null;
  }

  // 2. Parse ingredients from HTML
  const codeBlocks = [...html.matchAll(/class="et_pb_code_inner">([\s\S]*?)<\/div>/g)];
  const ingBlock = codeBlocks.find((b) => b[1].includes("Ingredi"));
  let ingredientsText: string | null = null;

  if (ingBlock) {
    ingredientsText = ingBlock[1]
      .replace(/<h3[^>]*>[\s\S]*?<\/h3>/, "")
      .replace(/<style>[\s\S]*?<\/style>/g, "")
      .replace(/<img[^>]*>/g, "")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join("\n");
  }

  // Clean up instructions
  if (instructionsText) {
    instructionsText = instructionsText.replace(/&nbsp;/g, " ").trim();
  }

  return {
    slug: extractSlug(url),
    sourceUrl: url,
    title,
    description,
    imageUrl,
    author,
    category,
    ingredientsText,
    instructionsText,
    publishedAt,
  };
}

/** Sync recipes from groentenabonnement.nl. Pass batchSize to limit how many new recipes to scrape. */
export async function syncExternalRecipes(
  batchSize?: number,
): Promise<{ added: number; total: number; remaining: number }> {
  console.log("[scraper] Fetching recipe URLs from sitemaps...");
  const urls = await fetchRecipeUrls();
  console.log(`[scraper] Found ${urls.length} recipe URLs`);

  // Get existing slugs to skip already-scraped recipes
  const existing = await db.select({ slug: externalRecipes.slug }).from(externalRecipes);
  const existingSlugs = new Set(existing.map((r) => r.slug));

  const newUrls = urls.filter((url) => !existingSlugs.has(extractSlug(url)));
  const urlsToScrape = batchSize ? newUrls.slice(0, batchSize) : newUrls;
  console.log(`[scraper] ${newUrls.length} new recipes available, scraping ${urlsToScrape.length}`);

  let added = 0;

  for (const url of urlsToScrape) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`[scraper] Failed to fetch ${url}: ${res.status}`);
        continue;
      }

      const html = await res.text();
      const recipe = parseRecipePage(html, url);

      await db.insert(externalRecipes).values(recipe).onConflictDoNothing();
      added++;
      console.log(`[scraper] Added: ${recipe.title}`);

      await sleep(RATE_LIMIT_MS);
    } catch (err: unknown) {
      console.error(`[scraper] Error scraping ${url}:`, err);
    }
  }

  const remaining = newUrls.length - added;
  console.log(`[scraper] Sync complete: ${added} added, ${remaining} remaining`);
  return { added, total: existingSlugs.size + added, remaining };
}
