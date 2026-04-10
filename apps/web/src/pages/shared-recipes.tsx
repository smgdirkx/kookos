import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  Heart,
  Loader2,
  Search,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Button, EmptyState, Input, Loading, PageHeader, Tag } from "@/components/ui";
import { api } from "@/lib/api";

type SharedRecipe = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  cuisine: string | null;
  userName: string;
  imageUrl: string | null;
  isOwned: boolean;
  shareComment: string;
  sharedAt: string;
  sharedByName: string;
};

type RecipeDetail = {
  id: string;
  title: string;
  description: string | null;
  instructions: string;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  cuisine: string | null;
  category: string | null;
  difficulty: string | null;
  userName: string;
  ingredients: {
    id: string;
    name: string;
    amount: string | null;
    unit: string | null;
    category: string | null;
  }[];
  images: { id: string; url: string; isPrimary: boolean }[];
  recipeTags: { tag: { id: string; name: string } }[];
};

const PAGE_SIZE = 20;

// ── Preview Modal ──

function RecipePreviewModal({
  recipeId,
  shareComment,
  sharedByName,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: {
  recipeId: string;
  shareComment: string;
  sharedByName: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const { data: recipe, isLoading } = useQuery({
    queryKey: ["shared-recipe-detail", recipeId],
    queryFn: () => api<RecipeDetail>(`/api/shares/recipe/${recipeId}`),
  });

  const primaryImage = recipe?.images.find((img) => img.isPrimary);
  const tagNames = recipe?.recipeTags.map((rt) => rt.tag.name) ?? [];

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onPrev();
      if (e.key === "ArrowRight" && hasNext) onNext();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        role="document"
        className="w-full max-w-lg overflow-y-auto m-3 mt-12 mb-3 bg-white rounded-2xl shadow-xl max-h-[calc(100dvh-3.75rem)]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <div className="sticky top-0 z-10 flex justify-end p-2">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 bg-white/90 rounded-full shadow-sm"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {isLoading && (
          <div className="p-8">
            <Loading message="Recept laden..." />
          </div>
        )}

        {recipe && (
          <div className="pb-4">
            {/* Share comment banner */}
            <div className="mx-4 mb-3 p-3 bg-red-50 border border-red-100 rounded-xl">
              <div className="flex items-start gap-2">
                <Heart className="w-4 h-4 text-red-500 fill-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-gray-700">{shareComment}</p>
                  <p className="text-xs text-gray-400 mt-1">Gedeeld door {sharedByName}</p>
                </div>
              </div>
            </div>

            {/* Image */}
            {primaryImage && (
              <img
                src={primaryImage.url}
                alt={recipe.title}
                className="w-full aspect-[4/3] object-cover"
              />
            )}

            <div className="p-4 space-y-4">
              {/* Title + meta */}
              <div>
                <h2 className="text-xl font-bold text-gray-900">{recipe.title}</h2>
                <p className="text-sm text-gray-400 mt-0.5">van {recipe.userName}</p>
                {recipe.description && (
                  <p className="text-sm text-gray-600 mt-2">{recipe.description}</p>
                )}
              </div>

              {/* Meta chips */}
              <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                {recipe.category && (
                  <span className="px-2 py-1 bg-gray-100 rounded-md">{recipe.category}</span>
                )}
                {recipe.cuisine && (
                  <span className="px-2 py-1 bg-gray-100 rounded-md">{recipe.cuisine}</span>
                )}
                {recipe.servings && (
                  <span className="px-2 py-1 bg-gray-100 rounded-md">
                    {recipe.servings} personen
                  </span>
                )}
                {recipe.prepTimeMinutes && (
                  <span className="px-2 py-1 bg-gray-100 rounded-md">
                    {recipe.prepTimeMinutes} min voorbereiding
                  </span>
                )}
                {recipe.cookTimeMinutes && (
                  <span className="px-2 py-1 bg-gray-100 rounded-md">
                    {recipe.cookTimeMinutes} min bereiden
                  </span>
                )}
              </div>

              {/* Tags */}
              {tagNames.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tagNames.map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                </div>
              )}

              {/* Ingredients */}
              {recipe.ingredients.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Ingrediënten</h3>
                  <ul className="space-y-1">
                    {recipe.ingredients.map((ing) => (
                      <li key={ing.id} className="text-sm text-gray-700 flex gap-2">
                        <span className="text-gray-400 min-w-[4rem] text-right">
                          {[ing.amount, ing.unit].filter(Boolean).join(" ") || "•"}
                        </span>
                        <span>{ing.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Instructions */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Bereidingswijze</h3>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {recipe.instructions}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Prev / Next navigation */}
        {(hasPrev || hasNext) && (
          <div className="sticky bottom-0 flex gap-2 p-3 bg-white border-t border-gray-100 rounded-b-2xl">
            <button
              type="button"
              onClick={onPrev}
              disabled={!hasPrev}
              className="flex-1 flex items-center justify-center gap-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl disabled:opacity-30 transition-colors hover:bg-gray-200"
            >
              <ChevronLeft className="w-4 h-4" />
              Vorige
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              className="flex-1 flex items-center justify-center gap-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl disabled:opacity-30 transition-colors hover:bg-gray-200"
            >
              Volgende
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── Main Page ──

export function SharedRecipesPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Debounce search
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout>>();
  function handleSearch(value: string) {
    setSearch(value);
    clearTimeout(timer);
    setTimer(setTimeout(() => setDebouncedSearch(value), 300));
  }

  // Fetch shared recipes (infinite scroll)
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["shared-recipes", debouncedSearch],
    queryFn: ({ pageParam = 1 }) => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("q", debouncedSearch);
      params.set("page", String(pageParam));
      params.set("limit", String(PAGE_SIZE));
      return api<SharedRecipe[]>(`/api/shares?${params}`);
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.length + 1;
    },
    initialPageParam: 1,
  });

  const recipes = data?.pages.flat() ?? [];

  // Infinite scroll
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

  // Copy mutation
  const copyMutation = useMutation({
    mutationFn: (recipeIds: string[]) =>
      api<{ copied: number }>("/api/shares/copy", {
        method: "POST",
        body: { recipeIds },
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      queryClient.invalidateQueries({ queryKey: ["recipe-filters"] });
      queryClient.invalidateQueries({ queryKey: ["recipes-count"] });
      queryClient.invalidateQueries({ queryKey: ["recipes-all"] });
      setSelected(new Set());
      navigate("/", {
        replace: true,
        state: { message: `${result.copied} recept(en) gekopieerd` },
      });
    },
  });

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className={selected.size > 0 ? "pb-28" : ""}>
      <PageHeader title="Aanbevolen recepten" back={() => navigate("/")} />

      <div className="mb-4 space-y-3">
        <Input
          type="search"
          placeholder="Zoek op naam of ingrediënt..."
          icon={Search}
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      {isLoading && <Loading message="Recepten laden..." />}

      {!isLoading && recipes.length === 0 && (
        <EmptyState
          icon={Heart}
          title="Nog geen gedeelde recepten"
          description={
            debouncedSearch
              ? "Probeer een andere zoekterm"
              : "Er zijn nog geen recepten gedeeld door de community"
          }
        />
      )}

      <div className="space-y-3">
        {recipes.map((recipe, index) => (
          <div
            key={`${recipe.id}-${index}`}
            className={`bg-white rounded-xl border overflow-hidden transition-colors ${
              recipe.isOwned
                ? "border-gray-200 opacity-60"
                : selected.has(recipe.id)
                  ? "border-orange-400 bg-orange-50/30"
                  : "border-gray-200"
            }`}
          >
            <div className="flex">
              {/* Checkbox: toggles selection */}
              <button
                type="button"
                onClick={() => !recipe.isOwned && toggleSelect(recipe.id)}
                disabled={recipe.isOwned}
                className="flex items-center justify-center w-12 flex-shrink-0 border-r border-gray-100 hover:bg-gray-50 transition-colors disabled:hover:bg-transparent"
              >
                {recipe.isOwned ? (
                  <Check className="w-5 h-5 text-green-500" />
                ) : selected.has(recipe.id) ? (
                  <CheckSquare className="w-5 h-5 text-orange-500" />
                ) : (
                  <Square className="w-5 h-5 text-gray-300" />
                )}
              </button>

              {/* Clickable area: opens preview */}
              <button
                type="button"
                onClick={() => setPreviewIndex(index)}
                className="flex min-w-0 flex-1 text-left"
              >
                <div className="py-2 pl-3 min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 line-clamp-1">{recipe.title}</p>
                  {recipe.category && (
                    <p className="text-xs text-gray-400 mt-0.5">{recipe.category}</p>
                  )}
                  {recipe.isOwned && (
                    <p className="text-xs text-green-600 mt-0.5">Al in je recepten</p>
                  )}
                  {!recipe.isOwned && recipe.description && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{recipe.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">van {recipe.userName}</p>

                  {/* Share comment */}
                  <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-gray-100">
                    <Heart className="w-3 h-3 text-red-500 fill-red-500 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500 line-clamp-2 italic">
                        {recipe.shareComment}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {recipe.sharedByName} &middot;{" "}
                        {new Date(recipe.sharedAt).toLocaleDateString("nl-NL", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
                {recipe.imageUrl ? (
                  <img
                    src={recipe.imageUrl}
                    alt={recipe.title}
                    className="w-20 self-stretch object-cover flex-shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-20 self-stretch bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Eye className="w-5 h-5 text-gray-300" />
                  </div>
                )}
              </button>
            </div>
          </div>
        ))}

        <div ref={sentinelRef} />
        {isFetchingNextPage && <Loading message="Meer laden..." />}
      </div>

      {/* Fixed bottom copy bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom))] left-0 right-0 z-40">
          <div className="mx-auto max-w-2xl px-4 py-3">
            <div className="flex gap-3 bg-white rounded-2xl shadow-lg border border-gray-200 px-4 py-3">
              <Button
                variant="primary"
                size="lg"
                className="flex-1"
                icon={copyMutation.isPending ? Loader2 : Copy}
                disabled={copyMutation.isPending}
                onClick={() => copyMutation.mutate([...selected])}
              >
                {copyMutation.isPending
                  ? "Kopiëren..."
                  : `Kopieer ${selected.size} recept${selected.size === 1 ? "" : "en"}`}
              </Button>
              <Button variant="outline" size="lg" icon={X} onClick={() => setSelected(new Set())}>
                Annuleren
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Copy error */}
      {copyMutation.isError && (
        <p className="text-sm text-red-500 text-center mt-4">
          {copyMutation.error instanceof Error ? copyMutation.error.message : "Kopiëren mislukt"}
        </p>
      )}

      {/* Recipe preview modal */}
      {previewIndex !== null && recipes[previewIndex] && (
        <RecipePreviewModal
          recipeId={recipes[previewIndex].id}
          shareComment={recipes[previewIndex].shareComment}
          sharedByName={recipes[previewIndex].sharedByName}
          onClose={() => setPreviewIndex(null)}
          onPrev={() => setPreviewIndex((i) => Math.max(0, (i ?? 0) - 1))}
          onNext={() => setPreviewIndex((i) => Math.min(recipes.length - 1, (i ?? 0) + 1))}
          hasPrev={previewIndex > 0}
          hasNext={previewIndex < recipes.length - 1}
        />
      )}
    </div>
  );
}
