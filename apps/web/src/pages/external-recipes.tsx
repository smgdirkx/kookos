import type { ExternalRecipe } from "@kookos/shared";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Leaf, Loader2, Search, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, EmptyState, Input, Loading, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";

const PAGE_SIZE = 20;

export function ExternalRecipesPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [importing, setImporting] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Debounce search input
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout>>();
  function handleSearch(value: string) {
    setSearch(value);
    clearTimeout(timer);
    setTimer(setTimeout(() => setDebouncedSearch(value), 300));
  }

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["external-recipes", debouncedSearch],
    queryFn: ({ pageParam = 1 }) => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("q", debouncedSearch);
      params.set("page", String(pageParam));
      params.set("limit", String(PAGE_SIZE));
      return api<ExternalRecipe[]>(`/api/external-recipes?${params}`);
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.length + 1;
    },
    initialPageParam: 1,
  });

  const recipes = data?.pages.flat() ?? [];

  // Infinite scroll via IntersectionObserver
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

  // Sync mutation (scrape next batch)
  const syncMutation = useMutation({
    mutationFn: () =>
      api<{ added: number; remaining: number }>("/api/external-recipes/sync?limit=10", {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-recipes"] });
    },
  });

  async function handleImport(recipe: ExternalRecipe) {
    setImporting(recipe.id);
    try {
      const result = await api<Record<string, unknown>>("/api/ai/import", {
        method: "POST",
        body: { url: recipe.sourceUrl },
      });

      const saved = await api<{ id: string }>("/api/recipes", {
        method: "POST",
        body: {
          ...result,
          source: "url",
          sourceUrl: recipe.sourceUrl,
          imageUrl: recipe.imageUrl,
        },
      });

      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      navigate(`/recipe/${saved.id}`, { replace: true });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Import mislukt");
      setImporting(null);
    }
  }

  return (
    <div>
      <PageHeader title="Groentenabonnement" back={() => navigate("/add-recipe")} />

      <div className="mb-4">
        <Input
          type="search"
          placeholder="Zoek op naam of ingrediënt..."
          icon={Search}
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      {isLoading && <Loading message="Recepten laden..." />}

      {!isLoading && recipes.length === 0 && !syncMutation.isPending && (
        <EmptyState
          icon={Leaf}
          title="Nog geen recepten"
          description="Haal de eerste recepten op van groentenabonnement.nl"
          action={
            <Button variant="primary" icon={Download} onClick={() => syncMutation.mutate()}>
              Recepten ophalen
            </Button>
          }
        />
      )}

      {importing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 mx-4 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500 mx-auto mb-3" />
            <p className="font-semibold">Recept importeren...</p>
            <p className="text-sm text-gray-500 mt-1">AI analyseert het recept</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {recipes.map((recipe) => (
          <a
            key={recipe.id}
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex gap-3 bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-orange-300 hover:bg-orange-50/30 transition-colors"
          >
            {recipe.imageUrl ? (
              <img
                src={recipe.imageUrl}
                alt={recipe.title}
                className="w-24 h-24 object-cover flex-shrink-0"
                loading="lazy"
              />
            ) : (
              <div className="w-24 h-24 bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Leaf className="w-8 h-8 text-gray-300" />
              </div>
            )}
            <div className="py-2 pr-3 min-w-0 flex-1">
              <p className="font-semibold text-gray-900 truncate">{recipe.title}</p>
              {recipe.category && <p className="text-xs text-gray-400 mt-0.5">{recipe.category}</p>}
              {recipe.description && (
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                  {recipe.description.replace(/<[^>]*>/g, "")}
                </p>
              )}
            </div>
            <div className="flex items-center pr-3 flex-shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  handleImport(recipe);
                }}
                disabled={importing !== null}
                className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 text-white text-xs font-semibold rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Import
              </button>
            </div>
          </a>
        ))}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} />

        {isFetchingNextPage && <Loading message="Meer laden..." />}
      </div>

      {/* Sync button: scrape next 10 from website */}
      {recipes.length > 0 && (
        <div className="mt-6 mb-4">
          <Button
            variant="outline"
            fullWidth
            icon={syncMutation.isPending ? Loader2 : Download}
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending
              ? "Recepten ophalen..."
              : syncMutation.data
                ? `${syncMutation.data.added} toegevoegd — nog ${syncMutation.data.remaining} beschikbaar`
                : "Meer recepten ophalen"}
          </Button>
        </div>
      )}

      {syncMutation.isPending && recipes.length === 0 && (
        <Loading message="Recepten ophalen van groentenabonnement.nl..." />
      )}
    </div>
  );
}
