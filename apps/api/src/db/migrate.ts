import { config } from "dotenv";

config({ path: "../../.env" });

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL! });
await client.connect();
const db = drizzle(client);

// Run Drizzle migrations
console.log("Running Drizzle migrations...");
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Drizzle migrations complete.");

// Apply search triggers (idempotent — safe to re-run)
console.log("Applying search triggers...");
await db.execute(sql`
  CREATE OR REPLACE FUNCTION recipes_search_vector_update() RETURNS trigger AS $$
  DECLARE
    ingredient_text text;
  BEGIN
    SELECT string_agg(name, ' ') INTO ingredient_text
    FROM recipe_ingredients
    WHERE recipe_id = NEW.id;

    NEW.search_vector :=
      setweight(to_tsvector('dutch', COALESCE(NEW.title, '')), 'A') ||
      setweight(to_tsvector('dutch', COALESCE(NEW.description, '')), 'B') ||
      setweight(to_tsvector('dutch', COALESCE(NEW.cuisine, '')), 'C') ||
      setweight(to_tsvector('dutch', COALESCE(NEW.category, '')), 'C') ||
      setweight(to_tsvector('dutch', COALESCE(ingredient_text, '')), 'B');

    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS recipes_search_vector_trigger ON recipes;
  CREATE TRIGGER recipes_search_vector_trigger
    BEFORE INSERT OR UPDATE ON recipes
    FOR EACH ROW
    EXECUTE FUNCTION recipes_search_vector_update();

  CREATE OR REPLACE FUNCTION ingredients_search_vector_update() RETURNS trigger AS $$
  DECLARE
    ingredient_text text;
    recipe_record RECORD;
  BEGIN
    IF TG_OP = 'DELETE' THEN
      SELECT * INTO recipe_record FROM recipes WHERE id = OLD.recipe_id;
    ELSE
      SELECT * INTO recipe_record FROM recipes WHERE id = NEW.recipe_id;
    END IF;

    IF recipe_record IS NOT NULL THEN
      SELECT string_agg(name, ' ') INTO ingredient_text
      FROM recipe_ingredients
      WHERE recipe_id = recipe_record.id;

      UPDATE recipes SET
        search_vector =
          setweight(to_tsvector('dutch', COALESCE(recipe_record.title, '')), 'A') ||
          setweight(to_tsvector('dutch', COALESCE(recipe_record.description, '')), 'B') ||
          setweight(to_tsvector('dutch', COALESCE(recipe_record.cuisine, '')), 'C') ||
          setweight(to_tsvector('dutch', COALESCE(recipe_record.category, '')), 'C') ||
          setweight(to_tsvector('dutch', COALESCE(ingredient_text, '')), 'B')
      WHERE id = recipe_record.id;
    END IF;

    RETURN COALESCE(NEW, OLD);
  END;
  $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS ingredients_search_vector_trigger ON recipe_ingredients;
  CREATE TRIGGER ingredients_search_vector_trigger
    AFTER INSERT OR UPDATE OR DELETE ON recipe_ingredients
    FOR EACH ROW
    EXECUTE FUNCTION ingredients_search_vector_update();
`);

console.log("Search triggers applied.");
await client.end();
console.log("Migration complete!");
process.exit(0);
