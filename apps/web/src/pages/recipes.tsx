import { type DifficultyLevel, difficultyLabels } from "@kookos/shared";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpen,
  ChefHat,
  Clock,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  RecipePlaceholder,
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
  comments?: { id: string; content: string; isImportant: boolean }[];
  images?: { url: string; isPrimary: boolean; caption?: string }[];
  recipeTags?: { tag: { name: string } }[];
};

type RecipesPage = {
  recipes: Recipe[];
  nextCursor: string | null;
  totalCount?: number;
};

type FilterOptions = {
  cuisines: string[];
  categories: string[];
  tags: string[];
  maxCookTime: number;
};

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function RecipesPage() {
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [maxTime, setMaxTime] = useState<number | null>(null);
  const [selectedCuisines, setSelectedCuisines] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedDifficulty, setSelectedDifficulty] = useState<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, 300);

  function toggleSet(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  // Build search params for the API
  const buildParams = useCallback(
    (cursor?: string) => {
      const params = new URLSearchParams();
      if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
      if (selectedCuisines.size > 0) params.set("cuisine", [...selectedCuisines].join(","));
      if (selectedCategories.size > 0) params.set("category", [...selectedCategories].join(","));
      if (selectedDifficulty.size > 0) params.set("difficulty", [...selectedDifficulty].join(","));
      if (selectedTags.size > 0) params.set("tag", [...selectedTags].join(","));
      if (maxTime !== null) params.set("maxTime", String(maxTime));
      if (cursor) params.set("cursor", cursor);
      return params.toString();
    },
    [
      debouncedQuery,
      selectedCuisines,
      selectedCategories,
      selectedDifficulty,
      selectedTags,
      maxTime,
    ],
  );

  // Fetch filter options
  const { data: filterOptions } = useQuery<FilterOptions>({
    queryKey: ["recipe-filters"],
    queryFn: () => api("/api/recipes/filters"),
  });

  // Infinite query for recipes
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery<RecipesPage>({
      queryKey: [
        "recipes",
        debouncedQuery,
        [...selectedCuisines].sort().join(),
        [...selectedCategories].sort().join(),
        [...selectedDifficulty].sort().join(),
        [...selectedTags].sort().join(),
        maxTime,
      ],
      queryFn: ({ pageParam }) => {
        const params = buildParams(pageParam as string | undefined);
        return api(`/api/recipes${params ? `?${params}` : ""}`);
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialPageParam: undefined as string | undefined,
      placeholderData: keepPreviousData,
    });

  // Infinite scroll observer
  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleIntersect, { rootMargin: "200px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersect]);

  const allRecipes = data?.pages.flatMap((p) => p.recipes) ?? [];
  // totalCount comes from the first page (unfiltered count of all user's recipes)
  const totalCount = data?.pages[0]?.totalCount ?? 0;

  const activeFilterCount =
    (maxTime !== null ? 1 : 0) +
    selectedCuisines.size +
    selectedCategories.size +
    selectedTags.size +
    selectedDifficulty.size;

  const hasAnyRecipes = totalCount > 0;

  function clearFilters() {
    setMaxTime(null);
    setSelectedCuisines(new Set());
    setSelectedCategories(new Set());
    setSelectedTags(new Set());
    setSelectedDifficulty(new Set());
  }

  // Only show full-page spinner on very first load (no cached data at all)
  if (!data && !filterOptions && isLoading) return <Loading />;

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

      {hasAnyRecipes && (
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
      )}

      {filtersOpen && filterOptions && (
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
                  {filterOptions.tags.map((t) => (
                    <FilterChip
                      key={t}
                      label={t}
                      selected={selectedTags.has(t)}
                      onClick={() => setSelectedTags(toggleSet(selectedTags, t))}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {!hasAnyRecipes && !isLoading ? (
        <EmptyState
          icon={BookOpen}
          title="Nog geen recepten"
          description="Voeg je eerste recept toe via scan of URL!"
        />
      ) : allRecipes.length === 0 && !isLoading ? (
        <EmptyState icon={Search} title="Geen recepten gevonden" />
      ) : (
        <div className="flex flex-col gap-4">
          {allRecipes.map((recipe) => {
            const images = recipe.images ?? [];
            const displayImage = images.find((img) => img.caption !== "scan-original") ?? images[0];
            const totalTime = (recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0);
            const meta: string[] = [];
            if (totalTime > 0) meta.push(`${totalTime} min`);
            if (recipe.difficulty) meta.push(difficultyLabels[recipe.difficulty]);

            return (
              <Link key={recipe.id} to={`/recipe/${recipe.id}`}>
                <Card interactive padding="none" className="overflow-hidden">
                  <div className="sm:flex sm:min-h-28">
                    <div className="relative shrink-0 h-36 sm:h-auto sm:w-48 sm:self-stretch">
                      {displayImage ? (
                        <img
                          src={displayImage.url}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <RecipePlaceholder
                          className="absolute inset-0 w-full h-full"
                          variant="hero"
                        />
                      )}
                      {meta.length > 0 && (
                        <div className="absolute bottom-0 inset-x-0 flex items-center gap-3 px-3 py-1.5 bg-black/30 backdrop-blur-md text-white text-xs">
                          {totalTime > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Clock size={12} />
                              {totalTime} min
                            </span>
                          )}
                          {recipe.difficulty && (
                            <span className="inline-flex items-center gap-1">
                              <ChefHat size={12} />
                              {difficultyLabels[recipe.difficulty]}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="px-4 py-3 flex-1 min-w-0">
                      <h2 className="font-semibold">{recipe.title}</h2>
                      {recipe.description && (
                        <p className="text-gray-400 text-sm mt-1 line-clamp-3">
                          {recipe.description}
                        </p>
                      )}
                      {(recipe.comments?.filter((c) => c.isImportant) ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {recipe.comments
                            ?.filter((c) => c.isImportant)
                            .map((n) => (
                              <span
                                key={n.id}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5 max-w-full"
                              >
                                <AlertTriangle size={11} className="shrink-0" />
                                <span className="truncate">{n.content}</span>
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />
          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Loader2 className="animate-spin text-gray-400" size={24} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
