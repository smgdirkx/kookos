import { load } from "cheerio";
import { type Browser, chromium } from "playwright";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Check if the response looks like a bot-challenge page */
function isBotChallenge(status: number, html: string): boolean {
  if (status === 403 || status === 503) return true;
  const lower = html.slice(0, 3000).toLowerCase();
  return (
    lower.includes("just a moment") ||
    lower.includes("checking your browser") ||
    lower.includes("cf-browser-verification") ||
    lower.includes("cf_chl_opt")
  );
}

/** Fetch with a real browser User-Agent */
async function simpleFetch(url: string): Promise<{ html: string; ok: boolean }> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "nl,en;q=0.5",
    },
  });
  const html = await response.text();
  return { html, ok: !isBotChallenge(response.status, html) };
}

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance?.isConnected()) return browserInstance;
  browserInstance = await chromium.launch({ headless: true });
  return browserInstance;
}

/** Fetch page using a real Chromium browser (bypasses JS challenges) */
async function browserFetch(url: string): Promise<string> {
  console.log("[fetch-page] Using Playwright browser for:", url);
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: BROWSER_UA,
    locale: "nl-NL",
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for content to load (Cloudflare challenge typically resolves within a few seconds)
    await page
      .waitForFunction(
        () => {
          const title = document.title.toLowerCase();
          return !title.includes("just a moment") && !title.includes("checking");
        },
        { timeout: 15000 },
      )
      .catch(() => {
        // If the challenge doesn't resolve, continue with whatever we have
        console.log("[fetch-page] Challenge wait timed out, continuing with current page");
      });

    // Small extra wait for dynamic content
    await page.waitForTimeout(2000);

    return await page.content();
  } finally {
    await context.close();
  }
}

/**
 * Fetch a page's HTML, with automatic fallback to Playwright browser
 * when bot protection is detected.
 */
export async function fetchPage(url: string): Promise<string> {
  // Try simple fetch first (fast)
  const result = await simpleFetch(url);
  if (result.ok) {
    console.log("[fetch-page] Simple fetch succeeded for:", url);
    return result.html;
  }

  // Fallback to browser
  console.log("[fetch-page] Bot protection detected, falling back to browser");
  return browserFetch(url);
}

/** Extract JSON-LD Recipe data from HTML if present */
export function extractJsonLd(html: string): string | null {
  const $ = load(html);
  const blocks: unknown[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      // Direct Recipe type
      if (data["@type"] === "Recipe") {
        blocks.push(data);
        return;
      }
      // @graph array (common in Yoast/RankMath)
      if (Array.isArray(data["@graph"])) {
        for (const item of data["@graph"]) {
          if (item["@type"] === "Recipe") blocks.push(item);
        }
      }
    } catch {
      // invalid JSON, skip
    }
  });

  return blocks.length > 0 ? JSON.stringify(blocks, null, 2) : null;
}

/** Strip scripts, styles, SVGs, and other non-content from HTML */
export function cleanHtml(html: string): string {
  const $ = load(html);

  // Remove non-content elements
  $("script, style, svg, noscript, iframe, link, meta, header, footer, nav").remove();
  $("[style]").removeAttr("style");
  $("[class]").removeAttr("class");
  $("[id]").removeAttr("id");

  // Get text-rich HTML (body only)
  const body = $("body").html() || $.html();

  // Collapse whitespace
  return body
    .replace(/\s{2,}/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
}
