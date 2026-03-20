import { relations } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ── Custom type for tsvector ──

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// ══════════════════════════════════════════════
// Better Auth tables
// ══════════════════════════════════════════════

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ══════════════════════════════════════════════
// Application tables
// ══════════════════════════════════════════════

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    instructions: text("instructions").notNull(),
    servings: integer("servings"),
    prepTimeMinutes: integer("prep_time_minutes"),
    cookTimeMinutes: integer("cook_time_minutes"),
    cuisine: varchar("cuisine", { length: 100 }),
    category: varchar("category", { length: 100 }),
    difficulty: varchar("difficulty", { length: 20 }), // "makkelijk", "gemiddeld", "moeilijk"
    source: varchar("source", { length: 20 }), // "scan", "url", "manual"
    sourceUrl: text("source_url"),
    notes: text("notes"),
    isFavorite: boolean("is_favorite").notNull().default(true),
    searchVector: tsvector("search_vector"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("recipes_user_id_idx").on(table.userId),
    index("recipes_search_idx").using("gin", table.searchVector),
  ],
);

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    amount: varchar("amount", { length: 50 }),
    unit: varchar("unit", { length: 50 }),
    category: varchar("category", { length: 100 }),
    isOptional: boolean("is_optional").notNull().default(false),
    isSuggested: boolean("is_suggested").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("recipe_ingredients_recipe_idx").on(table.recipeId)],
);

export const recipeImages = pgTable("recipe_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipeId: uuid("recipe_id")
    .notNull()
    .references(() => recipes.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  caption: text("caption"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull().unique(),
});

export const recipeTags = pgTable(
  "recipe_tags",
  {
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [index("recipe_tags_recipe_idx").on(table.recipeId)],
);

export const recipeComments = pgTable(
  "recipe_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("recipe_comments_recipe_idx").on(table.recipeId)],
);

export const mealPlans = pgTable("meal_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  servings: integer("servings").notNull().default(2),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const mealPlanItems = pgTable("meal_plan_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  mealPlanId: uuid("meal_plan_id")
    .notNull()
    .references(() => mealPlans.id, { onDelete: "cascade" }),
  recipeId: uuid("recipe_id")
    .notNull()
    .references(() => recipes.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  mealType: varchar("meal_type", { length: 20 }).notNull(),
  checked: boolean("checked").notNull().default(false),
});

export const shoppingLists = pgTable("shopping_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  mealPlanId: uuid("meal_plan_id").references(() => mealPlans.id, {
    onDelete: "set null",
  }),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const shoppingListItems = pgTable("shopping_list_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  shoppingListId: uuid("shopping_list_id")
    .notNull()
    .references(() => shoppingLists.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  amount: varchar("amount", { length: 50 }),
  unit: varchar("unit", { length: 50 }),
  checked: boolean("checked").notNull().default(false),
  isExtra: boolean("is_extra").notNull().default(false),
});

// ══════════════════════════════════════════════
// External recipes (scraped from groentenabonnement.nl)
// ══════════════════════════════════════════════

export const externalRecipes = pgTable(
  "external_recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    sourceUrl: text("source_url").notNull().unique(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    author: varchar("author", { length: 255 }),
    category: varchar("category", { length: 100 }),
    ingredientsText: text("ingredients_text"),
    instructionsText: text("instructions_text"),
    publishedAt: timestamp("published_at"),
    searchVector: tsvector("search_vector"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("external_recipes_search_idx").using("gin", table.searchVector)],
);

// ══════════════════════════════════════════════
// Relations
// ══════════════════════════════════════════════

export const usersRelations = relations(users, ({ many }) => ({
  recipes: many(recipes),
  mealPlans: many(mealPlans),
  shoppingLists: many(shoppingLists),
}));

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  user: one(users, { fields: [recipes.userId], references: [users.id] }),
  ingredients: many(recipeIngredients),
  images: many(recipeImages),
  recipeTags: many(recipeTags),
  comments: many(recipeComments),
}));

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeIngredients.recipeId],
    references: [recipes.id],
  }),
}));

export const recipeImagesRelations = relations(recipeImages, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeImages.recipeId],
    references: [recipes.id],
  }),
}));

export const recipeCommentsRelations = relations(recipeComments, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeComments.recipeId],
    references: [recipes.id],
  }),
  user: one(users, {
    fields: [recipeComments.userId],
    references: [users.id],
  }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  recipeTags: many(recipeTags),
}));

export const recipeTagsRelations = relations(recipeTags, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeTags.recipeId],
    references: [recipes.id],
  }),
  tag: one(tags, { fields: [recipeTags.tagId], references: [tags.id] }),
}));

export const mealPlansRelations = relations(mealPlans, ({ one, many }) => ({
  user: one(users, { fields: [mealPlans.userId], references: [users.id] }),
  items: many(mealPlanItems),
  shoppingLists: many(shoppingLists),
}));

export const mealPlanItemsRelations = relations(mealPlanItems, ({ one }) => ({
  mealPlan: one(mealPlans, {
    fields: [mealPlanItems.mealPlanId],
    references: [mealPlans.id],
  }),
  recipe: one(recipes, {
    fields: [mealPlanItems.recipeId],
    references: [recipes.id],
  }),
}));

export const shoppingListsRelations = relations(shoppingLists, ({ one, many }) => ({
  user: one(users, {
    fields: [shoppingLists.userId],
    references: [users.id],
  }),
  mealPlan: one(mealPlans, {
    fields: [shoppingLists.mealPlanId],
    references: [mealPlans.id],
  }),
  items: many(shoppingListItems),
}));

export const shoppingListItemsRelations = relations(shoppingListItems, ({ one }) => ({
  shoppingList: one(shoppingLists, {
    fields: [shoppingListItems.shoppingListId],
    references: [shoppingLists.id],
  }),
}));
