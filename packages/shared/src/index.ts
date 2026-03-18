import { z } from "zod";

// Helper: accepts number or numeric string, strips invalid values like "<UNKNOWN>"
const optionalNumber = z
  .union([z.number(), z.string()])
  .transform((val) => {
    if (typeof val === "number") return val;
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
  source: z.enum(["scan", "url", "manual"]).optional(),
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
});

// ── Comment schemas ──

export const createCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

export const updateCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

// ── AI feature schemas ──

export const importRecipeSchema = z.object({
  url: z.string().url(),
});

export const scanRecipeSchema = z.object({
  image: z.string(), // base64 encoded
});

export const generateMealPlanSchema = z.object({
  availableIngredients: z.array(z.string()),
  numberOfPeople: z.number().int().positive().default(2),
  numberOfDays: z.number().int().positive().default(7),
  preferences: z.string().optional(),
});

// ── Type exports ──

export type CreateRecipe = z.infer<typeof createRecipeSchema>;
export type UpdateRecipe = z.infer<typeof updateRecipeSchema>;
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
export type SearchRecipes = z.infer<typeof searchRecipesSchema>;
export type CreateMealPlan = z.infer<typeof createMealPlanSchema>;
export type MealPlanItem = z.infer<typeof mealPlanItemSchema>;
export type ShoppingListItem = z.infer<typeof shoppingListItemSchema>;
export type CreateComment = z.infer<typeof createCommentSchema>;
export type UpdateComment = z.infer<typeof updateCommentSchema>;
export type ImportRecipe = z.infer<typeof importRecipeSchema>;
export type ScanRecipe = z.infer<typeof scanRecipeSchema>;
export type GenerateMealPlan = z.infer<typeof generateMealPlanSchema>;
