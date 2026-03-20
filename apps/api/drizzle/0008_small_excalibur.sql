-- Migrate existing important_note values to recipe_comments
INSERT INTO "recipe_comments" ("recipe_id", "user_id", "content", "is_important")
SELECT "id", "user_id", "important_note", true
FROM "recipes"
WHERE "important_note" IS NOT NULL AND "important_note" != '';

ALTER TABLE "recipes" DROP COLUMN "important_note";