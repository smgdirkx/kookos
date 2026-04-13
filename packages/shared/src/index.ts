import { z } from "zod";

// Helper: accepts number or numeric string, strips invalid values like "<UNKNOWN>"
const optionalNumber = z
  .union([z.number(), z.string()])
  .transform((val) => {
    if (typeof val === "number") return Math.round(val);
    const n = parseInt(val, 10);
    return Number.isNaN(n) ? undefined : n;
  })
  .optional();

// ── Difficulty levels ──

export const difficultyLevels = ["makkelijk", "gemiddeld", "moeilijk"] as const;

export type DifficultyLevel = (typeof difficultyLevels)[number];

export const difficultyLabels: Record<DifficultyLevel, string> = {
  makkelijk: "Makkelijk",
  gemiddeld: "Gemiddeld",
  moeilijk: "Moeilijk",
};

// ── Recipe schemas ──

export const ingredientCategories = [
  "hoofdgroenten",
  "basis",
  "eiwitten",
  "aromaten",
  "overig",
] as const;

export type IngredientCategory = (typeof ingredientCategories)[number];

export const ingredientCategoryLabels: Record<IngredientCategory, string> = {
  hoofdgroenten: "Hoofdgroenten",
  aromaten: "Aromaten & Kruiden",
  basis: "Basis",
  eiwitten: "Eiwitten",
  overig: "Overig",
};

export const recipeIngredientSchema = z.object({
  name: z.string().min(1),
  amount: z.string().optional(),
  unit: z.string().optional(),
  category: z.enum(ingredientCategories).optional(),
  isOptional: z.boolean().default(false),
  isSuggested: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0),
});

export const createRecipeSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  instructions: z.string().min(1),
  servings: optionalNumber,
  prepTimeMinutes: optionalNumber,
  cookTimeMinutes: optionalNumber,
  cuisine: z.string().optional(),
  category: z.string().optional(),
  difficulty: z.enum(difficultyLevels).optional(),
  source: z.enum(["scan", "url", "manual", "community", "groentenabonnement"]).optional(),
  sourceUrl: z.string().url().optional(),
  notes: z.string().optional(),
  ingredients: z.array(recipeIngredientSchema).optional(),
  tags: z.array(z.string()).optional(),
});

export const updateRecipeSchema = createRecipeSchema.partial();

// ── Search schemas ──

export const searchRecipesSchema = z.object({
  query: z.string().min(1),
  ingredients: z.array(z.string()).optional(),
});

// ── Meal plan schemas ──

export const createMealPlanSchema = z.object({
  name: z.string().min(1).max(255),
  startDate: z.string().date(),
  endDate: z.string().date(),
  servings: z.number().int().positive().default(2),
});

export const mealPlanItemSchema = z.object({
  recipeId: z.string().uuid(),
  date: z.string().date(),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
});

// ── Shopping list schemas ──

export const shoppingListItemSchema = z.object({
  name: z.string().min(1),
  amount: z.string().optional(),
  unit: z.string().optional(),
  checked: z.boolean().default(false),
  isExtra: z.boolean().default(false),
  recipeId: z.string().uuid().optional(),
  isSuggested: z.boolean().default(false),
  category: z.string().optional(),
});

export const createShoppingListSchema = z.object({
  name: z.string().min(1).max(255),
  mealPlanId: z.string().uuid().optional(),
});

// ── Comment schemas ──

export const createCommentSchema = z.object({
  content: z.string().min(1).max(2000),
  isImportant: z.boolean().optional(),
});

export const updateCommentSchema = z.object({
  content: z.string().min(1).max(2000),
  isImportant: z.boolean().optional(),
});

// ── AI feature schemas ──

export const importRecipeSchema = z.object({
  url: z.string().url(),
});

export const scanRecipeSchema = z.object({
  image: z.string(), // base64 encoded recipe photo (page 1)
  mediaType: z.string(), // MIME type van de receptfoto (page 1)
  image2: z.string().optional(), // base64 encoded recipe photo (page 2)
  mediaType2: z.string().optional(), // MIME type van de receptfoto (page 2)
  dishImage: z.string().optional(), // base64 encoded dish photo
  dishMediaType: z.string().optional(), // MIME type van de gerechtfoto
  extraTags: z.array(z.string()).optional(), // user-supplied tags (e.g. cookbook name)
});

export const pasteRecipeSchema = z.object({
  text: z.string().min(10),
  dishImage: z.string().optional(),
  dishMediaType: z.string().optional(),
  extraTags: z.array(z.string()).optional(),
});

export const maxTimeOptions = [0, 30, 45, 60] as const;

export type MaxTimeOption = (typeof maxTimeOptions)[number];

export const maxTimeLabels: Record<MaxTimeOption, string> = {
  0: "Geen voorkeur",
  30: "Max 30 min",
  45: "Max 45 min",
  60: "Max 60 min",
};

export const generateMealPlanSchema = z.object({
  availableIngredients: z.array(z.string()),
  numberOfPeople: z.number().int().positive().default(2),
  numberOfDays: z.number().int().positive().default(5),
  maxTimeMinutes: z.number().int().nonnegative().optional(),
  difficulty: z.enum(difficultyLevels).optional(),
  varietyCuisine: z.boolean().default(true),
  seasonal: z.boolean().default(false),
  preferences: z.string().optional(),
});

// ── Recipe share schemas ──

export const shareRecipeSchema = z.object({
  comment: z.string().min(1).max(500),
});

export const searchSharedRecipesSchema = z.object({
  query: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

// ── Community recipe schemas ──

export const searchCommunityRecipesSchema = z.object({
  userId: z.string().optional(),
  query: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export const copyCommunityRecipesSchema = z.object({
  recipeIds: z.array(z.string().uuid()).min(1),
});

// ── External recipe schemas ──

export const searchExternalRecipesSchema = z.object({
  query: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type SearchExternalRecipes = z.infer<typeof searchExternalRecipesSchema>;

export type ExternalRecipe = {
  id: string;
  slug: string;
  sourceUrl: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  author: string | null;
  category: string | null;
  ingredientsText: string | null;
  instructionsText: string | null;
  publishedAt: string | null;
  importedRecipeId: string | null;
};

// ── Type exports ──

export type CreateRecipe = z.infer<typeof createRecipeSchema>;
export type UpdateRecipe = z.infer<typeof updateRecipeSchema>;
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
export type SearchRecipes = z.infer<typeof searchRecipesSchema>;
export type CreateMealPlan = z.infer<typeof createMealPlanSchema>;
export type MealPlanItem = z.infer<typeof mealPlanItemSchema>;
export type ShoppingListItem = z.infer<typeof shoppingListItemSchema>;
export type CreateShoppingList = z.infer<typeof createShoppingListSchema>;
export type CreateComment = z.infer<typeof createCommentSchema>;
export type UpdateComment = z.infer<typeof updateCommentSchema>;
export type ImportRecipe = z.infer<typeof importRecipeSchema>;
export type ScanRecipe = z.infer<typeof scanRecipeSchema>;
export type PasteRecipe = z.infer<typeof pasteRecipeSchema>;
export type GenerateMealPlan = z.infer<typeof generateMealPlanSchema>;
export type SearchCommunityRecipes = z.infer<typeof searchCommunityRecipesSchema>;
export type CopyCommunityRecipes = z.infer<typeof copyCommunityRecipesSchema>;
export type ShareRecipe = z.infer<typeof shareRecipeSchema>;
export type SearchSharedRecipes = z.infer<typeof searchSharedRecipesSchema>;
