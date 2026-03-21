ALTER TABLE "shopping_list_items" ADD COLUMN "recipe_id" uuid;--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD COLUMN "is_suggested" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD COLUMN "category" varchar(100);--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;