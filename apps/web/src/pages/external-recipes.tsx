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
          <div
            key={recipe.id}
            className="flex gap-3 bg-white rounded-xl border border-gray-200 overflow-hidden"
          >
            {recipe.imageUrl ? (
              <img
                src={recipe.imageUrl}
                alt={recipe.title}
                className="w-24 self-stretch object-cover flex-shrink-0"
                loading="lazy"
              />
            ) : (
              <div className="w-24 self-stretch bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Leaf className="w-8 h-8 text-gray-300" />
              </div>
            )}
            <div className="py-2 pr-3 min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">{recipe.title}</p>
              {recipe.category && <p className="text-xs text-gray-400 mt-0.5">{recipe.category}</p>}
              {recipe.description && (
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                  {recipe.description.replace(/<[^>]*>/g, "")}
                </p>
              )}
              <div className="flex gap-2 mt-2">
                <a
                  href={recipe.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Bekijk
                </a>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    handleImport(recipe);
                  }}
                  disabled={importing !== null}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors disabled:opacity-50"
                >
                  <Sparkles className="w-3 h-3" />
                  Import
                </button>
              </div>
            </div>
          </div>
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
