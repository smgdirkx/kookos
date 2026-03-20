import { type DifficultyLevel, difficultyLabels } from "@kookos/shared";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Clock,
  Plus,
  Search,
  SlidersHorizontal,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  EmptyState,
  FilterChip,
  IconButton,
  Input,
  LinkButton,
  Loading,
  PageHeader,
  Tag,
} from "@/components/ui";
import { api } from "@/lib/api";

type Recipe = {
  id: string;
  title: string;
  description?: string;
  servings?: number;
  cuisine?: string;
  category?: string;
  difficulty?: DifficultyLevel;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  ingredients?: { name: string }[];
  images?: { url: string; isPrimary: boolean; caption?: string }[];
  recipeTags?: { tag: { name: string } }[];
};

const difficultyVariant = {
  makkelijk: "success",
  gemiddeld: "warning",
  moeilijk: "danger",
} as const;

export function RecipesPage() {
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [maxTime, setMaxTime] = useState<number | null>(null);
  const [selectedCuisines, setSelectedCuisines] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedDifficulty, setSelectedDifficulty] = useState<Set<string>>(new Set());

  const { data: recipes, isLoading } = useQuery<Recipe[]>({
    queryKey: ["recipes"],
    queryFn: () => api("/api/recipes"),
  });

  const filterOptions = useMemo(() => {
    if (!recipes) return { cuisines: [], categories: [], tags: [], maxCookTime: 120 };
    const cuisines = [...new Set(recipes.map((r) => r.cuisine).filter(Boolean))] as string[];
    const categories = [...new Set(recipes.map((r) => r.category).filter(Boolean))] as string[];
    const tags = [
      ...new Set(recipes.flatMap((r) => r.recipeTags?.map((rt) => rt.tag.name) ?? [])),
    ] as string[];
    const times = recipes
      .map((r) => (r.prepTimeMinutes ?? 0) + (r.cookTimeMinutes ?? 0))
      .filter((t) => t > 0);
    const maxCookTime = times.length ? Math.max(...times) : 120;
    return {
      cuisines: cuisines.sort(),
      categories: categories.sort(),
      tags: tags.sort(),
      maxCookTime,
    };
  }, [recipes]);

  const activeFilterCount =
    (maxTime !== null ? 1 : 0) +
    selectedCuisines.size +
    selectedCategories.size +
    selectedTags.size +
    selectedDifficulty.size;

  const filtered = useMemo(() => {
    return recipes?.filter((r) => {
      if (query.trim()) {
        const q = query.toLowerCase();
        const matches =
          r.title.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.cuisine?.toLowerCase().includes(q) ||
          r.category?.toLowerCase().includes(q) ||
          r.ingredients?.some((ing) => ing.name.toLowerCase().includes(q));
        if (!matches) return false;
      }
      if (maxTime !== null) {
        const total = (r.prepTimeMinutes ?? 0) + (r.cookTimeMinutes ?? 0);
        if (total === 0 || total > maxTime) return false;
      }
      if (selectedCuisines.size > 0 && (!r.cuisine || !selectedCuisines.has(r.cuisine)))
        return false;
      if (selectedCategories.size > 0 && (!r.category || !selectedCategories.has(r.category)))
        return false;
      if (selectedTags.size > 0) {
        const recipeTags = new Set(r.recipeTags?.map((rt) => rt.tag.name) ?? []);
        const hasMatch = [...selectedTags].some((t) => recipeTags.has(t));
        if (!hasMatch) return false;
      }
      if (selectedDifficulty.size > 0 && (!r.difficulty || !selectedDifficulty.has(r.difficulty)))
        return false;
      return true;
    });
  }, [
    recipes,
    query,
    maxTime,
    selectedCuisines,
    selectedCategories,
    selectedTags,
    selectedDifficulty,
  ]);

  function toggleSet(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  function clearFilters() {
    setMaxTime(null);
    setSelectedCuisines(new Set());
    setSelectedCategories(new Set());
    setSelectedTags(new Set());
    setSelectedDifficulty(new Set());
  }

  if (isLoading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Recepten"
        action={
          <LinkButton to="/add-recipe" variant="cta" size="sm" icon={Plus}>
            Toevoegen
          </LinkButton>
        }
      />

      {recipes?.length ? (
        <div className="flex gap-2 mb-4">
          <Input
            type="search"
            placeholder="Zoek in recepten..."
            icon={Search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <IconButton
            icon={filtersOpen ? X : SlidersHorizontal}
            variant={filtersOpen || activeFilterCount > 0 ? "primary" : "outline"}
            size="lg"
            badge={activeFilterCount || undefined}
            label="Filters"
            onClick={() => setFiltersOpen(!filtersOpen)}
          />
        </div>
      ) : null}

      {filtersOpen && (
        <Card className="mb-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Filters</h3>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs text-primary hover:underline"
                >
                  Wis filters
                </button>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Moeilijkheid</label>
              <div className="flex flex-wrap gap-1.5">
                {(["makkelijk", "gemiddeld", "moeilijk"] as DifficultyLevel[]).map((d) => (
                  <FilterChip
                    key={d}
                    label={difficultyLabels[d]}
                    selected={selectedDifficulty.has(d)}
                    onClick={() => setSelectedDifficulty(toggleSet(selectedDifficulty, d))}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                Max bereidingstijd: {maxTime !== null ? `${maxTime} min` : "Alles"}
              </label>
              <input
                type="range"
                min={0}
                max={filterOptions.maxCookTime}
                step={5}
                value={maxTime ?? filterOptions.maxCookTime}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMaxTime(v >= filterOptions.maxCookTime ? null : v);
                }}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>0 min</span>
                <span>{filterOptions.maxCookTime} min</span>
              </div>
            </div>

            {filterOptions.cuisines.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Keuken</label>
                <div className="flex flex-wrap gap-1.5">
                  {filterOptions.cuisines.map((c) => (
                    <FilterChip
                      key={c}
                      label={c}
                      selected={selectedCuisines.has(c)}
                      onClick={() => setSelectedCuisines(toggleSet(selectedCuisines, c))}
                    />
                  ))}
                </div>
              </div>
            )}

            {filterOptions.categories.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Categorie</label>
                <div className="flex flex-wrap gap-1.5">
                  {filterOptions.categories.map((cat) => (
                    <FilterChip
                      key={cat}
                      label={cat}
                      selected={selectedCategories.has(cat)}
                      onClick={() => setSelectedCategories(toggleSet(selectedCategories, cat))}
                    />
                  ))}
                </div>
              </div>
            )}

            {filterOptions.tags.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Tags</label>
                <div className="flex flex-wrap gap-1.5">
                  {filterOptions.tags.map((tag) => (
                    <FilterChip
                      key={tag}
                      label={tag}
                      selected={selectedTags.has(tag)}
                      onClick={() => setSelectedTags(toggleSet(selectedTags, tag))}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {!recipes?.length ? (
        <EmptyState
          icon={BookOpen}
          title="Nog geen recepten"
          description="Voeg je eerste recept toe via scan of URL!"
        />
      ) : !filtered?.length ? (
        <EmptyState icon={Search} title="Geen recepten gevonden" />
      ) : (
        <div className="space-y-3">
          {filtered.map((recipe) => (
            <Link key={recipe.id} to={`/recipe/${recipe.id}`}>
              <Card interactive className="mb-3">
                <div className="flex gap-3">
                  {recipe.images &&
                    recipe.images.length > 0 &&
                    (() => {
                      const images = recipe.images;
                      const displayImage =
                        images.find((img) => img.caption !== "scan-original") ?? images[0];
                      return (
                        <img
                          src={displayImage.url}
                          alt=""
                          className="w-16 h-16 rounded-lg object-cover shrink-0"
                        />
                      );
                    })()}
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-lg">{recipe.title}</h2>
                    {recipe.description && (
                      <p className="text-gray-500 text-sm mt-1 line-clamp-2">
                        {recipe.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {recipe.servings && (
                    <Tag>
                      <Users size={12} className="mr-1" />
                      {recipe.servings}
                    </Tag>
                  )}
                  {recipe.cuisine && (
                    <Tag variant="secondary">
                      <UtensilsCrossed size={12} className="mr-1" />
                      {recipe.cuisine}
                    </Tag>
                  )}
                  {recipe.prepTimeMinutes && (
                    <Tag>
                      <Clock size={12} className="mr-1" />
                      {recipe.prepTimeMinutes} min
                    </Tag>
                  )}
                  {recipe.difficulty && (
                    <Tag variant={difficultyVariant[recipe.difficulty]}>
                      {difficultyLabels[recipe.difficulty]}
                    </Tag>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
