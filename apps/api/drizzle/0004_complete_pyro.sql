CREATE TABLE "external_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(255) NOT NULL,
	"source_url" text NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"image_url" text,
	"author" varchar(255),
	"category" varchar(100),
	"ingredients_text" text,
	"instructions_text" text,
	"published_at" timestamp,
	"search_vector" "tsvector",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "external_recipes_slug_unique" UNIQUE("slug"),
	CONSTRAINT "external_recipes_source_url_unique" UNIQUE("source_url")
);
--> statement-breakpoint
CREATE INDEX "external_recipes_search_idx" ON "external_recipes" USING gin ("search_vector");