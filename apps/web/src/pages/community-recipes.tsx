import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  Loader2,
  Search,
  Square,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Button, EmptyState, Input, Loading, PageHeader, Tag } from "@/components/ui";
import { api } from "@/lib/api";

type CommunityUser = {
  id: string;
  name: string;
  recipeCount: number;
};

type CommunityRecipe = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  cuisine: string | null;
  userName: string;
  imageUrl: string | null;
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
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: {
  recipeId: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const { data: recipe, isLoading } = useQuery({
    queryKey: ["community-recipe-detail", recipeId],
    queryFn: () => api<RecipeDetail>(`/api/community/recipes/${recipeId}`),
  });

  const primaryImage = recipe?.images.find((img) => img.isPrimary);
  const tagNames = recipe?.recipeTags.map((rt) => rt.tag.name) ?? [];

  // Keyboard navigation
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

export function CommunityRecipesPage() {
  const [selectedUser, setSelectedUser] = useState<CommunityUser | null>(null);
  const [allUsers, setAllUsers] = useState(false);
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

  // Fetch users
  const { data: communityUsers, isLoading: usersLoading } = useQuery({
    queryKey: ["community-users"],
    queryFn: () => api<CommunityUser[]>("/api/community/users"),
  });

  const showRecipes = selectedUser !== null || allUsers;

  // Fetch recipes (infinite scroll)
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["community-recipes", selectedUser?.id, allUsers, debouncedSearch],
    queryFn: ({ pageParam = 1 }) => {
      const params = new URLSearchParams();
      if (selectedUser && !allUsers) params.set("userId", selectedUser.id);
      if (debouncedSearch) params.set("q", debouncedSearch);
      params.set("page", String(pageParam));
      params.set("limit", String(PAGE_SIZE));
      return api<CommunityRecipe[]>(`/api/community/recipes?${params}`);
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.length + 1;
    },
    initialPageParam: 1,
    enabled: showRecipes,
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
      api<{ copied: number }>("/api/community/copy", {
        method: "POST",
        body: { recipeIds },
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      queryClient.invalidateQueries({ queryKey: ["recipe-filters"] });
      queryClient.invalidateQueries({ queryKey: ["recipes-count"] });
      queryClient.invalidateQueries({ queryKey: ["recipes-all"] });
      setSelected(new Set());
      navigate("/add-recipe", {
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

  function toggleSelectAll() {
    if (selected.size === recipes.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(recipes.map((r) => r.id)));
    }
  }

  function handleBack() {
    if (showRecipes) {
      setSelectedUser(null);
      setAllUsers(false);
      setSearch("");
      setDebouncedSearch("");
      setSelected(new Set());
    } else {
      navigate("/add-recipe");
    }
  }

  return (
    <div className={selected.size > 0 ? "pb-28" : ""}>
      <PageHeader
        title={showRecipes ? (selectedUser?.name ?? "Alle gebruikers") : "Community"}
        back={handleBack}
      />

      {/* Step 1: User list */}
      {!showRecipes && (
        <>
          {usersLoading && <Loading message="Gebruikers laden..." />}

          {!usersLoading && (!communityUsers || communityUsers.length === 0) && (
            <EmptyState
              icon={Users}
              title="Geen andere gebruikers"
              description="Er zijn nog geen andere gebruikers met recepten"
            />
          )}

          {!usersLoading && communityUsers && communityUsers.length > 0 && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setAllUsers(true)}
                className="w-full flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50/50 transition-colors text-left"
              >
                <div className="flex-shrink-0 w-12 h-12 bg-teal-100 text-teal-600 rounded-xl flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">Alle gebruikers</p>
                  <p className="text-sm text-gray-500">
                    {communityUsers.reduce((sum, u) => sum + u.recipeCount, 0)} recepten
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </button>

              {communityUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => setSelectedUser(user)}
                  className="w-full flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50/50 transition-colors text-left"
                >
                  <div className="flex-shrink-0 w-12 h-12 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center font-bold text-lg">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{user.name}</p>
                    <p className="text-sm text-gray-500">{user.recipeCount} recepten</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Step 2: Recipe browser */}
      {showRecipes && (
        <>
          <div className="mb-4 space-y-3">
            <Input
              type="search"
              placeholder="Zoek op naam..."
              icon={Search}
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />

            {recipes.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {selected.size === recipes.length ? (
                    <CheckSquare className="w-3.5 h-3.5" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                  {selected.size === recipes.length ? "Deselecteer alles" : "Selecteer alles"}
                </button>
                {selected.size > 0 && (
                  <span className="text-xs text-gray-500">{selected.size} geselecteerd</span>
                )}
              </div>
            )}
          </div>

          {isLoading && <Loading message="Recepten laden..." />}

          {!isLoading && recipes.length === 0 && (
            <EmptyState
              icon={Search}
              title="Geen recepten gevonden"
              description={
                debouncedSearch
                  ? "Probeer een andere zoekterm"
                  : "Deze gebruiker heeft nog geen recepten"
              }
            />
          )}

          <div className="space-y-3">
            {recipes.map((recipe, index) => (
              <div
                key={recipe.id}
                className={`flex bg-white rounded-xl border overflow-hidden transition-colors ${
                  selected.has(recipe.id) ? "border-orange-400 bg-orange-50/30" : "border-gray-200"
                }`}
              >
                {/* Checkbox: toggles selection */}
                <button
                  type="button"
                  onClick={() => toggleSelect(recipe.id)}
                  className="flex items-center justify-center w-12 flex-shrink-0 border-r border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  {selected.has(recipe.id) ? (
                    <CheckSquare className="w-5 h-5 text-orange-500" />
                  ) : (
                    <Square className="w-5 h-5 text-gray-300" />
                  )}
                </button>

                {/* Clickable area: opens preview */}
                <button
                  type="button"
                  onClick={() => setPreviewIndex(index)}
                  className="flex gap-3 min-w-0 flex-1 text-left"
                >
                  <div className="py-2 min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 line-clamp-1">
                      {recipe.title}
                    </p>
                    {recipe.category && (
                      <p className="text-xs text-gray-400 mt-0.5">{recipe.category}</p>
                    )}
                    {recipe.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {recipe.description}
                      </p>
                    )}
                    {allUsers && (
                      <p className="text-xs text-gray-400 mt-1">van {recipe.userName}</p>
                    )}
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
                  <Button
                    variant="outline"
                    size="lg"
                    icon={X}
                    onClick={() => setSelected(new Set())}
                  >
                    Annuleren
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
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
