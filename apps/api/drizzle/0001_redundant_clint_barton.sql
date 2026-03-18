ALTER TABLE "recipe_ingredients" ALTER COLUMN "amount" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "shopping_list_items" ALTER COLUMN "amount" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "difficulty" varchar(20);