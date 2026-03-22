import Anthropic from "@anthropic-ai/sdk";
import {
  createRecipeSchema,
  generateMealPlanSchema,
  importRecipeSchema,
  ingredientCategories,
  pasteRecipeSchema,
  scanRecipeSchema,
} from "@kookos/shared";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { recipeImages, recipeIngredients, recipes, recipeTags, tags } from "../db/schema.js";
import { uploadBase64Image, uploadExternalImage } from "../image.js";
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
                "Rol van dit ingrediënt in het gerecht. MOET een van de enum-waarden zijn — gebruik GEEN andere waarden zoals 'bijgerecht', 'hoofdgerecht' etc. hoofdgroenten = groenten waar het gerecht om draait (bijv. pompoen, bloemkool, aubergine), aromaten = smaakmakers (ui, knoflook, gember, kruiden, specerijen), basis = koolhydraatdrager (pasta, rijst, aardappel, brood), eiwitten = proteïnebron (tofu, linzen, kikkererwten, eieren, kaas), overig = alles wat niet in bovenstaande past",
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
        items: {
          type: "string",
          enum: [
            // Type gerecht
            "comfort food",
            "doordeweeks",
            "feestelijk",
            "meal prep",
            "one-pot",
            "bbq",
            "bijgerecht",
            "snack",
            "ontbijt",
            "lunch",
            // Seizoen
            "lente",
            "zomer",
            "herfst",
            "winter",
            // Kookmethode
            "oven",
            "wok",
            "rauw",
            "grillen",
            // Dieet
            "veganistisch",
            "glutenvrij",
          ],
        },
        maxItems: 3,
        description:
          "Maximaal 3 tags uit de vaste lijst. Kies alleen tags die echt van toepassing zijn. Niet taggen wat al via cuisine, category of difficulty wordt vastgelegd.",
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

function createMessage(params: Omit<Anthropic.MessageCreateParamsNonStreaming, "model">) {
  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
  return anthropic.messages.create({ model, ...params });
}

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
- Ingrediënten die WEL expliciet in de originele ingrediëntenlijst staan krijgen isSuggested=false (of laat het veld weg).

TAGS — STRIKTE REGELS:
- Kies maximaal 3 tags uit de vaste lijst in de tool. Minder is beter — tag alleen wat echt relevant is.
- GEEN tags die overlappen met bestaande velden: cuisine dekt de keuken, category dekt het gerecht-type (pasta, soep, etc.), difficulty dekt de moeilijkheidsgraad, en bereidingstijd staat apart.
- Wees selectief: een simpele pasta hoeft geen 3 tags. Als er niets bijzonders is, geef 0 of 1 tag.`;

// ── Helpers (recipe saving) ──

/** Strip AI placeholder values like "<UNKNOWN>" from ingredient fields */
function cleanIngredientField(value: string | undefined): string | undefined {
  if (!value || value.startsWith("<")) return undefined;
  return value;
}

async function saveRecipeFromAi(
  aiResult: Record<string, unknown>,
  userId: string,
  opts: {
    source: "scan" | "url" | "manual" | "groentenabonnement";
    sourceUrl?: string;
    scanImage?: string;
    scanMediaType?: string;
    dishImage?: string;
    dishMediaType?: string;
    imageUrl?: string;
    extraTags?: string[];
  },
): Promise<{ id: string }> {
  // Sanitize ingredient categories — AI sometimes returns invalid values
  const validCategories = new Set<string>(ingredientCategories);
  if (Array.isArray(aiResult.ingredients)) {
    for (const ing of aiResult.ingredients) {
      if (ing && typeof ing === "object" && "category" in ing) {
        const rec = ing as Record<string, unknown>;
        if (typeof rec.category !== "string" || !validCategories.has(rec.category)) {
          rec.category = "overig";
        }
      }
    }
  }

  const parsed = createRecipeSchema.safeParse(aiResult);
  if (!parsed.success)
    throw new Error(`Invalid recipe data: ${JSON.stringify(parsed.error.flatten())}`);

  const { ingredients, tags: aiTags, ...recipeData } = parsed.data;

  // Merge AI-generated tags with user-supplied extra tags (deduplicated)
  const tagNames = [...new Set([...(aiTags ?? []), ...(opts.extraTags ?? [])])];

  const [recipe] = await db
    .insert(recipes)
    .values({ ...recipeData, source: opts.source, sourceUrl: opts.sourceUrl, userId })
    .returning();

  // Insert ingredients
  if (ingredients?.length) {
    await db.insert(recipeIngredients).values(
      ingredients.map((ing, i) => ({
        recipeId: recipe.id,
        name: ing.name,
        amount: cleanIngredientField(ing.amount),
        unit: cleanIngredientField(ing.unit),
        category: ing.category,
        isOptional: ing.isOptional,
        isSuggested: ing.isSuggested,
        sortOrder: ing.sortOrder ?? i,
      })),
    );
  }

  // Upload scan photo to S3 (original scan, not shown in gallery)
  if (opts.scanImage && opts.scanMediaType) {
    const s3Key = await uploadBase64Image(opts.scanImage, opts.scanMediaType, recipe.id);
    if (s3Key) {
      await db.insert(recipeImages).values({
        recipeId: recipe.id,
        url: s3Key,
        isPrimary: false,
        caption: "scan-original",
      });
    }
  }

  // Upload dish photo to S3 (display image)
  if (opts.dishImage && opts.dishMediaType) {
    const s3Key = await uploadBase64Image(opts.dishImage, opts.dishMediaType, recipe.id);
    if (s3Key) {
      await db.insert(recipeImages).values({
        recipeId: recipe.id,
        url: s3Key,
        isPrimary: true,
      });
    }
  }

  // Download external image to S3
  if (opts.imageUrl) {
    const s3Key = await uploadExternalImage(opts.imageUrl, recipe.id);
    if (s3Key) {
      await db.insert(recipeImages).values({
        recipeId: recipe.id,
        url: s3Key,
        isPrimary: true,
      });
    }
  }

  // Trigger search vector rebuild after ingredients are inserted
  if (ingredients?.length) {
    await db.update(recipes).set({ updatedAt: new Date() }).where(eq(recipes.id, recipe.id));
  }

  // Insert tags
  if (tagNames?.length) {
    for (const tagName of tagNames) {
      const [tag] = await db
        .insert(tags)
        .values({ name: tagName })
        .onConflictDoNothing()
        .returning();
      const existingTag = tag ?? (await db.query.tags.findFirst({ where: eq(tags.name, tagName) }));
      if (existingTag) {
        await db.insert(recipeTags).values({ recipeId: recipe.id, tagId: existingTag.id });
      }
    }
  }

  return { id: recipe.id };
}

// ── Routes ──

// Scan recipe from photo and save directly
app.post("/scan", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const parsed = scanRecipeSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const message = await createMessage({
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
  const aiResult = getToolInput(message) as Record<string, unknown>;

  const saved = await saveRecipeFromAi(aiResult, user.id, {
    source: "scan",
    scanImage: parsed.data.image,
    scanMediaType: parsed.data.mediaType,
    dishImage: parsed.data.dishImage,
    dishMediaType: parsed.data.dishMediaType,
    extraTags: ["gescand", ...(parsed.data.extraTags ?? [])],
  });

  return c.json(saved, 201);
});

// Import recipe from URL and save directly
app.post("/import", async (c) => {
  const user = c.get("user")!;
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

  const message = await createMessage({
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
  const aiResult = getToolInput(message) as Record<string, unknown>;

  // Auto-tag with base domain (e.g. "ah.nl", "groentenabonnement.nl")
  const hostname = new URL(parsed.data.url).hostname.replace(/^www\./, "");
  const isGroentenabo = hostname.includes("groentenabonnement");

  const saved = await saveRecipeFromAi(aiResult, user.id, {
    source: isGroentenabo ? "groentenabonnement" : "url",
    sourceUrl: parsed.data.url,
    imageUrl: ogImage,
    extraTags: [hostname],
  });

  return c.json(saved, 201);
});

// Parse recipe from pasted text and save directly
app.post("/paste", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const parsed = pasteRecipeSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const message = await createMessage({
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
  const aiResult = getToolInput(message) as Record<string, unknown>;

  const saved = await saveRecipeFromAi(aiResult, user.id, {
    source: "manual",
    dishImage: parsed.data.dishImage,
    dishMediaType: parsed.data.dishMediaType,
    extraTags: [...(parsed.data.extraTags ?? []), "geplakt"],
  });

  return c.json(saved, 201);
});

// Pre-filter recipes based on ingredients and preferences, returns recipes + warnings
async function preFilterRecipes(
  userId: string,
  data: {
    availableIngredients: string[];
    numberOfDays: number;
    maxTimeMinutes?: number;
    difficulty?: string;
  },
) {
  const { availableIngredients, maxTimeMinutes, difficulty } = data;
  const tsQueries = availableIngredients.map((ing) => sql`plainto_tsquery('dutch', ${ing})`);
  const combinedTsQuery = sql.join(tsQueries, sql` || `);

  // Build preference filters for time and difficulty
  const prefFilters = [];
  if (maxTimeMinutes && maxTimeMinutes > 0) {
    prefFilters.push(
      sql`(COALESCE(${recipes.prepTimeMinutes}, 0) + COALESCE(${recipes.cookTimeMinutes}, 0) <= ${maxTimeMinutes} OR (${recipes.prepTimeMinutes} IS NULL AND ${recipes.cookTimeMinutes} IS NULL))`,
    );
  }
  if (difficulty) {
    prefFilters.push(sql`(${recipes.difficulty} = ${difficulty} OR ${recipes.difficulty} IS NULL)`);
  }
  const prefFilter =
    prefFilters.length > 0 ? sql` AND ${sql.join(prefFilters, sql` AND `)}` : sql``;

  // Check which ingredients have matching recipes
  const unmatchedIngredients: string[] = [];
  for (const ing of availableIngredients) {
    const hits = await db.query.recipes.findMany({
      where: sql`${recipes.userId} = ${userId} AND ${recipes.searchVector} @@ plainto_tsquery('dutch', ${ing})${prefFilter}`,
      columns: { id: true },
      limit: 1,
    });
    if (hits.length === 0) unmatchedIngredients.push(ing);
  }

  const matchedRecipes = await db.query.recipes.findMany({
    where: sql`${recipes.userId} = ${userId} AND ${recipes.searchVector} @@ (${combinedTsQuery})${prefFilter}`,
    with: { ingredients: true, images: true },
  });

  const matchedIds = new Set(matchedRecipes.map((r) => r.id));

  const extraRecipes =
    matchedRecipes.length < 50
      ? await db.query.recipes.findMany({
          where: sql`${recipes.userId} = ${userId}${
            matchedIds.size > 0
              ? sql` AND ${recipes.id} NOT IN (${sql.join(
                  [...matchedIds].map((id) => sql`${id}`),
                  sql`, `,
                )})`
              : sql``
          }${prefFilter}`,
          with: { ingredients: true, images: true },
          limit: 20,
        })
      : [];

  const userRecipes = [...matchedRecipes, ...extraRecipes];

  const warnings: string[] = [];
  if (unmatchedIngredients.length > 0) {
    warnings.push(`Geen recepten gevonden voor: ${unmatchedIngredients.join(", ")}`);
  }
  if (userRecipes.length < data.numberOfDays) {
    warnings.push(
      `Slechts ${userRecipes.length} recepten gevonden voor ${data.numberOfDays} dagen. Het menu kan herhalingen bevatten.`,
    );
  }

  return { userRecipes, matchedIds, warnings };
}

// Pre-check meal plan: returns warnings before AI generation
app.post("/meal-plan/check", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const parsed = generateMealPlanSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { warnings } = await preFilterRecipes(user.id, parsed.data);
  return c.json({ warnings });
});

// Generate meal plan with available ingredients
app.post("/meal-plan", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const parsed = generateMealPlanSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { userRecipes, matchedIds, warnings } = await preFilterRecipes(user.id, parsed.data);

  const recipeSummaries = userRecipes.map((r) => ({
    id: r.id,
    title: r.title,
    servings: r.servings,
    ingredients: r.ingredients?.map((i) => i.name).join(", "),
    matchesIngredients: matchedIds.has(r.id),
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

  const message = await createMessage({
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
${parsed.data.varietyCuisine ? "Variatie in keuken: Wissel zoveel mogelijk verschillende keukens af (bijv. Italiaans, Aziatisch, Mexicaans, Nederlands)." : ""}
${parsed.data.seasonal ? "Seizoensgebonden: Geef voorkeur aan recepten met seizoensgroenten." : ""}
${parsed.data.preferences ? `Extra wensen: ${parsed.data.preferences}` : ""}

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

  return c.json({ ...aiResult, warnings });
});

export default app;
