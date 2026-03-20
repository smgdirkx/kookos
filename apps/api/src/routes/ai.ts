import Anthropic from "@anthropic-ai/sdk";
import {
  generateMealPlanSchema,
  importRecipeSchema,
  pasteRecipeSchema,
  scanRecipeSchema,
} from "@kookos/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { recipes } from "../db/schema.js";
import { requireAuth } from "../middleware.js";
import { cleanHtml, extractJsonLd, fetchPage } from "../services/fetch-page.js";
import type { AppEnv } from "../types.js";

const anthropic = new Anthropic();
const app = new Hono<AppEnv>();

app.use("*", requireAuth);

// ── Tool definitions (forces structured JSON output) ──

const recipeTool: Anthropic.Tool = {
  name: "save_recipe",
  description: "Sla het geëxtraheerde recept op",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Naam van het gerecht" },
      description: { type: "string", description: "Korte beschrijving" },
      instructions: {
        type: "string",
        description:
          "Volledige bereidingswijze inclusief alle secties (tips, variaties, serveersuggesties, etc.) — er mag geen informatie verloren gaan",
      },
      servings: { type: "number", description: "Aantal personen" },
      prepTimeMinutes: { type: "number", description: "Voorbereidingstijd in minuten" },
      cookTimeMinutes: { type: "number", description: "Kooktijd in minuten" },
      cuisine: { type: "string", description: "Keuken (bijv. Italiaans, Aziatisch, Nederlands)" },
      category: {
        type: "string",
        description: "hoofdgerecht/voorgerecht/dessert/soep/salade/snack/bijgerecht",
      },
      difficulty: {
        type: "string",
        enum: ["makkelijk", "gemiddeld", "moeilijk"],
        description:
          "Moeilijkheidsgraad: makkelijk (weinig stappen, basistechnieken), gemiddeld (meerdere technieken, timing belangrijk), moeilijk (geavanceerde technieken, veel stappen)",
      },
      ingredients: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            amount: { type: "string", description: "Hoeveelheid als string (bijv. '200', '1/2')" },
            unit: { type: "string", description: "Eenheid (gram, ml, stuks, el, tl, etc.)" },
            category: {
              type: "string",
              enum: ["hoofdgroenten", "aromaten", "basis", "eiwitten", "overig"],
              description:
                "Rol in het gerecht: hoofdgroenten = groenten waar het gerecht om draait (bijv. pompoen, bloemkool, aubergine), aromaten = smaakmakers (ui, knoflook, gember, kruiden, specerijen), basis = koolhydraatdrager (pasta, rijst, aardappel, brood), eiwitten = proteïnebron (tofu, linzen, kikkererwten, eieren, kaas), overig = voorraadkast (olie, sauzen, bouillon, blikken)",
            },
            isSuggested: {
              type: "boolean",
              description:
                "true als dit ingrediënt NIET expliciet in de ingrediëntenlijst staat maar door jou wordt gesuggereerd (bijv. uit de bereidingstekst gehaald, of een ontbrekende basis/eiwit)",
            },
          },
          required: ["name"],
        },
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Tags zoals vegetarisch, snel, glutenvrij, etc.",
      },
    },
    required: ["title", "instructions", "ingredients"],
  },
};

const mealPlanTool: Anthropic.Tool = {
  name: "save_meal_plan",
  description: "Sla het weekmenu op met meerdere opties per dag",
  input_schema: {
    type: "object",
    properties: {
      mealPlan: {
        type: "array",
        items: {
          type: "object",
          properties: {
            day: { type: "number" },
            ingredient: {
              type: "string",
              description:
                "De hoofdgroente(n) voor deze dag, bijv. 'Knolselderij' of 'Champignon & Wortel'",
            },
            options: {
              type: "array",
              description: "1-3 receptopties voor deze dag, gesorteerd op hoe goed ze passen",
              items: {
                type: "object",
                properties: {
                  recipeId: { type: "string", description: "De id van het bestaande recept" },
                  title: { type: "string", description: "Exacte titel van het recept" },
                },
                required: ["recipeId", "title"],
              },
            },
          },
          required: ["day", "ingredient", "options"],
        },
      },
    },
    required: ["mealPlan"],
  },
};

// ── Helpers ──

function logAi(route: string, input: string, response: Anthropic.Message) {
  const toolUse = response.content.find((b) => b.type === "tool_use");
  console.log(
    `[AI:${route}] model=${response.model} tokens_in=${response.usage.input_tokens} tokens_out=${response.usage.output_tokens} stop=${response.stop_reason}`,
  );
  console.log(`[AI:${route}] input: ${input.slice(0, 200)}`);
  if (toolUse && toolUse.type === "tool_use") {
    console.log(`[AI:${route}] output: ${JSON.stringify(toolUse.input).slice(0, 500)}...`);
  }
}

function getToolInput(message: Anthropic.Message): unknown {
  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("No tool_use in response");
  }
  return toolUse.input;
}

const RECIPE_SYSTEM_PROMPT = `Je bent een recepten-expert. Analyseer het aangeboden recept en extraheer alle informatie.
Gebruik Nederlandse taal voor alle tekst. Gebruik altijd de save_recipe tool om het resultaat terug te geven.

VEGETARISCH KOKEN — STRIKTE REGEL:
Er wordt UITSLUITEND vegetarisch gekookt. Vlees en vis/zeevruchten mogen NOOIT voorkomen in het resultaat — niet als ingrediënt, niet als suggestie, niet als serveertip, niet als variatie. Als het originele recept vlees of vis bevat of suggereert, VERVANG dit altijd door een passend vegetarisch alternatief. Dit geldt voor ALLE onderdelen: ingrediëntenlijst, bereidingswijze, tips, variaties en serveersuggesties.

BEREIDINGSWIJZE: Neem de VOLLEDIGE bereidingstekst over — inclusief alle secties zoals tips, variaties, serveersuggesties, opmerkingen en voedingsinfo. Er mag GEEN informatie verloren gaan (behalve verwijzingen naar vlees/vis — die worden vervangen door vega alternatieven). Als het origineel aparte secties heeft (bijv. "Variaties", "Tips"), behoud deze als duidelijke koppen in de tekst.
Categoriseer elk ingrediënt op basis van de rol in het gerecht: hoofdgroenten (de groenten waar het gerecht om draait), aromaten (smaakmakers zoals ui, knoflook, kruiden), basis (pasta, rijst, aardappel), eiwitten (tofu, linzen, eieren, kaas), overig (olie, sauzen, bouillon).
BELANGRIJK: Laat standaard keukenspullen zoals zout, peper, olie, olijfolie en boter WEG uit de ingrediëntenlijst. Die heeft iedereen al in huis.
Bepaal ook de moeilijkheidsgraad: makkelijk (weinig stappen, basistechnieken), gemiddeld (meerdere technieken, timing belangrijk), moeilijk (geavanceerde technieken, veel stappen).

SUGGESTIES:
- Scan de VOLLEDIGE tekst — titel, beschrijving, ingrediëntenlijst, bereidingsstappen, tips, en serveersuggesties — op ALLE genoemde etenswaren/ingrediënten. ELKE eetbare suggestie die ergens in de tekst wordt genoemd MOET als apart ingrediënt in de ingrediëntenlijst komen met isSuggested=true, behalve als het niet-vegetarisch is. Sla er GEEN ENKELE over. Als er meerdere alternatieven worden gesuggereerd, voeg ze ALLEMAAL toe als aparte ingrediënten.
- NOOIT vlees of vis suggereren. Als het origineel vlees/vis suggereert als variatie of serveertip, vervang dit door een vegetarisch alternatief.
- VERPLICHT: Controleer of het recept een basis (koolhydraat) en een eiwit bevat. Kijk in ZOWEL de ingrediëntenlijst als de bereidingstekst. Als een van deze categorieën volledig ontbreekt, MOET je minstens één passend vegetarisch ingrediënt suggereren met isSuggested=true. Een compleet gerecht heeft altijd een koolhydraat én een eiwitbron — sla dit NOOIT over.
- Ingrediënten die WEL expliciet in de originele ingrediëntenlijst staan krijgen isSuggested=false (of laat het veld weg).`;

// ── Routes ──

// Scan recipe from photo (Claude Vision)
app.post("/scan", async (c) => {
  const body = await c.req.json();
  const parsed = scanRecipeSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: RECIPE_SYSTEM_PROMPT,
    tools: [recipeTool],
    tool_choice: { type: "tool", name: "save_recipe" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: parsed.data.mediaType as
                | "image/webp"
                | "image/jpeg"
                | "image/png"
                | "image/gif",
              data: parsed.data.image,
            },
          },
          { type: "text", text: "Extraheer het recept uit deze foto." },
        ],
      },
    ],
  });

  logAi("scan", "photo upload", message);
  return c.json(getToolInput(message));
});

// Import recipe from URL
app.post("/import", async (c) => {
  const body = await c.req.json();
  const parsed = importRecipeSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const html = await fetchPage(parsed.data.url);

  // Extract image from HTML meta tags
  const ogImage =
    html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)?.[1];

  // Build the prompt: prefer JSON-LD structured data, fall back to cleaned HTML
  const jsonLd = extractJsonLd(html);
  let promptContent: string;
  if (jsonLd) {
    console.log("[ai:import] Found JSON-LD recipe data, using structured data");
    const cleaned = cleanHtml(html).slice(0, 30000);
    promptContent = `Extraheer het recept uit deze webpagina.\n\nURL: ${parsed.data.url}\n\nGestructureerde data (JSON-LD):\n${jsonLd}\n\nHTML (voor extra context):\n${cleaned}`;
  } else {
    console.log("[ai:import] No JSON-LD found, using cleaned HTML");
    const cleaned = cleanHtml(html).slice(0, 50000);
    promptContent = `Extraheer het recept uit deze webpagina.\n\nURL: ${parsed.data.url}\n\nHTML:\n${cleaned}`;
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: RECIPE_SYSTEM_PROMPT,
    tools: [recipeTool],
    tool_choice: { type: "tool", name: "save_recipe" },
    messages: [
      {
        role: "user",
        content: promptContent,
      },
    ],
  });

  logAi("import", parsed.data.url, message);
  const recipe = getToolInput(message) as Record<string, unknown>;
  if (ogImage) {
    recipe.imageUrl = ogImage;
  }
  return c.json(recipe);
});

// Parse recipe from pasted text
app.post("/paste", async (c) => {
  const body = await c.req.json();
  const parsed = pasteRecipeSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: RECIPE_SYSTEM_PROMPT,
    tools: [recipeTool],
    tool_choice: { type: "tool", name: "save_recipe" },
    messages: [
      {
        role: "user",
        content: `Extraheer het recept uit de volgende tekst:\n\n${parsed.data.text}`,
      },
    ],
  });

  logAi("paste", parsed.data.text.slice(0, 100), message);
  return c.json(getToolInput(message));
});

// Generate meal plan with available ingredients
app.post("/meal-plan", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const parsed = generateMealPlanSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const userRecipes = await db.query.recipes.findMany({
    where: eq(recipes.userId, user.id),
    with: { ingredients: true, images: true },
  });

  const recipeSummaries = userRecipes.map((r) => ({
    id: r.id,
    title: r.title,
    servings: r.servings,
    ingredients: r.ingredients?.map((i) => i.name).join(", "),
  }));

  // Build lookups for enriching AI response
  const s3Base = process.env.S3_PUBLIC_URL || "/images/kookos";
  const recipeImageMap = new Map<string, string>();
  const recipeMetaMap = new Map<string, { totalTimeMinutes?: number; difficulty?: string }>();
  for (const r of userRecipes) {
    const imgs = r.images ?? [];
    const display = imgs.find((img) => img.caption !== "scan-original") ?? imgs[0];
    if (display) recipeImageMap.set(r.id, `${s3Base}/${display.url}`);
    const totalTime =
      r.prepTimeMinutes || r.cookTimeMinutes
        ? (r.prepTimeMinutes ?? 0) + (r.cookTimeMinutes ?? 0)
        : undefined;
    recipeMetaMap.set(r.id, { totalTimeMinutes: totalTime, difficulty: r.difficulty ?? undefined });
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: `Je bent een weekmenu-planner voor een VEGETARISCH huishouden. Maak een weekmenu met ALLEEN avondeten (geen lunch).
BELANGRIJK: Er wordt uitsluitend vegetarisch gekookt. Kies NOOIT recepten met vlees of vis.
Je mag UITSLUITEND recepten kiezen uit de lijst "Bestaande recepten" die de gebruiker meestuurt. Verzin NOOIT zelf recepten.
Gebruik altijd de exacte "id" van het recept als recipeId in je antwoord.
Als er niet genoeg recepten zijn, herhaal dan recepten of gebruik minder dagen.

OPTIES PER DAG: Geef per dag 2-3 receptopties als er genoeg recepten beschikbaar zijn, zodat de gebruiker kan kiezen. Sorteer de opties op hoe goed ze passen bij de beschikbare ingrediënten (beste match eerst). Als er te weinig recepten zijn voor meerdere opties, geef dan 1 optie.
Probeer recepten niet te herhalen over opties heen — bied zoveel mogelijk variatie.

INGREDIENT PER DAG: Geef per dag aan welke hoofdgroente(n) uit de beschikbare ingrediënten centraal staan. Bijv. als de gebruiker "knolselderij, champignon, wortel" heeft ingevuld, kan dag 1 "Knolselderij" zijn en dag 2 "Champignon & Wortel". Verdeel de ingrediënten logisch over de dagen.

Gebruik altijd de save_meal_plan tool om het resultaat terug te geven.`,
    tools: [mealPlanTool],
    tool_choice: { type: "tool", name: "save_meal_plan" },
    messages: [
      {
        role: "user",
        content: `Beschikbare ingrediënten: ${parsed.data.availableIngredients.join(", ")}
Aantal personen: ${parsed.data.numberOfPeople}
Aantal dagen: ${parsed.data.numberOfDays}
${parsed.data.preferences ? `Voorkeuren: ${parsed.data.preferences}` : ""}

Bestaande recepten:
${JSON.stringify(recipeSummaries, null, 2)}`,
      },
    ],
  });

  logAi("meal-plan", parsed.data.availableIngredients.join(", "), message);

  // Enrich AI response with recipe images and metadata
  const aiResult = getToolInput(message) as {
    mealPlan: { day: number; ingredient: string; options: { recipeId: string; title: string }[] }[];
  };
  for (const day of aiResult.mealPlan) {
    for (const option of day.options) {
      const ext = option as Record<string, unknown>;
      const imageUrl = recipeImageMap.get(option.recipeId);
      if (imageUrl) ext.imageUrl = imageUrl;
      const meta = recipeMetaMap.get(option.recipeId);
      if (meta?.totalTimeMinutes) ext.totalTimeMinutes = meta.totalTimeMinutes;
      if (meta?.difficulty) ext.difficulty = meta.difficulty;
    }
  }

  return c.json(aiResult);
});

export default app;
