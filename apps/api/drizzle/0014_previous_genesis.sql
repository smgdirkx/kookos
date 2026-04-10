CREATE TABLE "recipe_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"comment" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitation_codes" DROP CONSTRAINT "invitation_codes_used_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "invitation_codes" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_seen_shared_at" timestamp;--> statement-breakpoint
ALTER TABLE "recipe_shares" ADD CONSTRAINT "recipe_shares_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_shares" ADD CONSTRAINT "recipe_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_shares_recipe_idx" ON "recipe_shares" USING btree ("recipe_id");--> statement-breakpoint
ALTER TABLE "invitation_codes" DROP COLUMN "used_by";--> statement-breakpoint
ALTER TABLE "invitation_codes" DROP COLUMN "used_at";