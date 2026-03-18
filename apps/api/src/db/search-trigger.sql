-- Run this after initial Drizzle migration to set up tsvector auto-update
-- This trigger automatically updates search_vector when a recipe is inserted or updated

CREATE OR REPLACE FUNCTION recipes_search_vector_update() RETURNS trigger AS $$
DECLARE
  ingredient_text text;
BEGIN
  -- Gather ingredient names for this recipe
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

CREATE TRIGGER recipes_search_vector_trigger
  BEFORE INSERT OR UPDATE ON recipes
  FOR EACH ROW
  EXECUTE FUNCTION recipes_search_vector_update();

-- Also update search_vector when ingredients change
CREATE OR REPLACE FUNCTION ingredients_search_vector_update() RETURNS trigger AS $$
DECLARE
  ingredient_text text;
  recipe_record RECORD;
BEGIN
  -- Get the recipe_id (from NEW for insert/update, OLD for delete)
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

CREATE TRIGGER ingredients_search_vector_trigger
  AFTER INSERT OR UPDATE OR DELETE ON recipe_ingredients
  FOR EACH ROW
  EXECUTE FUNCTION ingredients_search_vector_update();
