import {
  type DifficultyLevel,
  difficultyLabels,
  difficultyLevels,
  type IngredientCategory,
  ingredientCategories,
  ingredientCategoryLabels,
} from "@kookos/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CalendarPlus,
  Check,
  ExternalLink,
  Heart,
  ImagePlus,
  Lightbulb,
  Loader2,
  MessageCircle,
  Minus,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { TagInput } from "@/components/tag-input";
import {
  Button,
  Card,
  Input,
  Loading,
  RecipePlaceholder,
  Textarea,
  useConfirm,
} from "@/components/ui";
import { api } from "@/lib/api";
import { generateMealPlanName } from "@/lib/date";
import { compressPhoto } from "@/lib/image";

type Ingredient = {
  id: string;
  name: string;
  amount?: string;
  unit?: string;
  category?: IngredientCategory;
  isSuggested?: boolean;
};

type RecipeImage = {
  id: string;
  url: string;
  isPrimary: boolean;
  caption?: string;
};

type Comment = {
  id: string;
  content: string;
  isImportant: boolean;
  createdAt: string;
  updatedAt: string;
};

type Recipe = {
  id: string;
  title: string;
  description?: string;
  instructions: string;
  servings?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  cuisine?: string;
  category?: string;
  difficulty?: DifficultyLevel;
  notes?: string;

  source?: string;
  sourceUrl?: string;
  ingredients: Ingredient[];
  images: RecipeImage[];
  recipeTags?: { tag: { id: string; name: string } }[];
};

type EditData = {
  title: string;
  description: string;
  instructions: string;
  servings: number | undefined;
  prepTimeMinutes: number | undefined;
  cookTimeMinutes: number | undefined;
  difficulty: DifficultyLevel | undefined;

  ingredients: Ingredient[];
};

function recipeToEditData(recipe: Recipe): EditData {
  return {
    title: recipe.title,
    description: recipe.description ?? "",
    instructions: recipe.instructions,
    servings: recipe.servings,
    prepTimeMinutes: recipe.prepTimeMinutes,
    cookTimeMinutes: recipe.cookTimeMinutes,
    difficulty: recipe.difficulty,

    ingredients: recipe.ingredients.map((ing) => ({ ...ing })),
  };
}

function scaleAmount(amount: string, ratio: number): string {
  // Parse fraction like "1/2"
  const fractionMatch = amount.match(/^(\d+)\/(\d+)$/);
  let value: number;
  if (fractionMatch) {
    value = Number(fractionMatch[1]) / Number(fractionMatch[2]);
  } else {
    value = Number.parseFloat(amount);
  }
  if (Number.isNaN(value)) return amount;

  const scaled = value * ratio;

  // Nice fractions
  const fractions: [number, string][] = [
    [0.25, "¼"],
    [0.33, "⅓"],
    [0.5, "½"],
    [0.67, "⅔"],
    [0.75, "¾"],
  ];

  if (Number.isInteger(scaled)) return String(scaled);

  const whole = Math.floor(scaled);
  const remainder = scaled - whole;

  for (const [threshold, symbol] of fractions) {
    if (Math.abs(remainder - threshold) < 0.06) {
      return whole > 0 ? `${whole}${symbol}` : symbol;
    }
  }

  // Round to 1 decimal
  const rounded = Math.round(scaled * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type MealPlanSummary = {
  id: string;
  name: string;
  startDate: string;
  items: { id: string; date: string; recipe: { id: string; title: string } }[];
};

function AddToMealPlanModal({
  recipeId,
  open,
  onClose,
}: {
  recipeId: string;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState<string | null>(null);

  const { data: plans = [] } = useQuery<MealPlanSummary[]>({
    queryKey: ["meal-plans", "withItems"],
    queryFn: () => api("/api/meal-plans?withItems=true"),
    enabled: open,
  });

  async function addToExisting(planId: string) {
    setAdding(planId);
    try {
      const plan = plans.find((p) => p.id === planId);
      const lastDate = plan?.items.length
        ? new Date(Math.max(...plan.items.map((i) => new Date(i.date).getTime())))
        : new Date(plan?.startDate ?? new Date());
      const nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + (plan?.items.length ? 1 : 0));

      await api(`/api/meal-plans/${planId}/items`, {
        method: "POST",
        body: {
          recipeId,
          date: nextDate.toISOString().split("T")[0],
          mealType: "dinner",
        },
      });
      queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
      queryClient.invalidateQueries({ queryKey: ["recipe-meal-plans", recipeId] });
      onClose();
      navigate(`/meal-plans/${planId}`);
    } catch {
      setAdding(null);
    }
  }

  async function createNew() {
    setAdding("new");
    try {
      const saved = await api<{ id: string }>("/api/meal-plans", {
        method: "POST",
        body: {
          name: generateMealPlanName(),
          servings: 2,
          items: [{ recipeId, day: 1 }],
        },
      });
      queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
      queryClient.invalidateQueries({ queryKey: ["recipe-meal-plans", recipeId] });
      onClose();
      navigate(`/meal-plans/${saved.id}`);
    } catch {
      setAdding(null);
    }
  }

  if (!open) return null;

  const dayNames = ["zo", "ma", "di", "wo", "do", "vr", "za"];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <button
        type="button"
        className="fixed inset-0 bg-black/40 animate-fade-in cursor-default"
        onClick={onClose}
        aria-label="Sluiten"
        tabIndex={-1}
      />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 animate-scale-in max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Toevoegen aan weekmenu</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <button
          type="button"
          onClick={createNew}
          disabled={adding !== null}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border-2 border-dashed border-gray-200 hover:border-primary hover:bg-primary/5 transition-colors mb-3"
        >
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Plus size={16} className="text-primary" />
          </div>
          <span className="text-sm font-medium">
            {adding === "new" ? "Aanmaken..." : "Nieuw weekmenu"}
          </span>
        </button>

        {plans.length > 0 && (
          <>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">
              Bestaande menu's
            </p>
            <div className="space-y-2">
              {plans.map((plan) => {
                const startDate = new Date(plan.startDate);
                const dateLabel = startDate.toLocaleDateString("nl-NL", {
                  day: "numeric",
                  month: "short",
                });
                const sortedItems = [...plan.items].sort(
                  (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
                );

                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => addToExisting(plan.id)}
                    disabled={adding !== null}
                    className="w-full text-left px-3 py-3 rounded-xl border border-gray-100 hover:border-primary/30 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium">
                        {adding === plan.id ? "Toevoegen..." : plan.name}
                      </span>
                      <span className="text-xs text-gray-400">vanaf {dateLabel}</span>
                    </div>
                    {sortedItems.length > 0 && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {sortedItems.map((item) => {
                          const d = new Date(item.date);
                          return (
                            <span key={item.id} className="text-xs text-gray-400">
                              <span className="font-medium text-gray-500">
                                {dayNames[d.getDay()]}
                              </span>{" "}
                              {item.recipe.title.length > 20
                                ? `${item.recipe.title.slice(0, 20)}…`
                                : item.recipe.title}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function MealPlanHistoryModal({
  plans,
  open,
  onClose,
}: {
  plans: MealPlanSummary[];
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <button
        type="button"
        className="fixed inset-0 bg-black/40 animate-fade-in cursor-default"
        onClick={onClose}
        aria-label="Sluiten"
        tabIndex={-1}
      />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 animate-scale-in max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Weekmenu's met dit recept</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-2">
          {plans.map((plan) => {
            const startDate = new Date(plan.startDate);
            const dateLabel = startDate.toLocaleDateString("nl-NL", {
              day: "numeric",
              month: "long",
              year: "numeric",
            });
            return (
              <Link
                key={plan.id}
                to={`/meal-plans/${plan.id}`}
                onClick={onClose}
                className="flex items-center gap-3 px-3 py-3 rounded-xl border border-gray-100 hover:border-primary/30 hover:bg-gray-50 transition-colors"
              >
                <Calendar size={16} className="text-gray-400 shrink-0" />
                <div>
                  <div className="text-sm font-medium">{plan.name}</div>
                  <div className="text-xs text-gray-400">{dateLabel}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ShareRecipeModal({
  recipeId,
  open,
  onClose,
  onShared,
}: {
  recipeId: string;
  open: boolean;
  onClose: () => void;
  onShared: () => void;
}) {
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleShare() {
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      await api(`/api/shares/${recipeId}`, {
        method: "POST",
        body: { comment: comment.trim() },
      });
      setComment("");
      onShared();
      onClose();
    } catch {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <button
        type="button"
        className="fixed inset-0 bg-black/40 animate-fade-in cursor-default"
        onClick={onClose}
        aria-label="Sluiten"
        tabIndex={-1}
      />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 animate-scale-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recept delen</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-3">
          Deel dit recept met de community. Voeg een korte toelichting toe waarom je dit recept
          aanraadt.
        </p>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Bijv. 'Heerlijk simpel doordeweeks gerecht!'"
          rows={3}
          className="mb-4"
        />
        <div className="flex gap-3">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            icon={submitting ? Loader2 : Heart}
            disabled={!comment.trim() || submitting}
            onClick={handleShare}
          >
            {submitting ? "Delen..." : "Deel met community"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [confirm, confirmModal] = useConfirm();
  const commentsRef = useRef<HTMLElement>(null);
  const [newComment, setNewComment] = useState("");
  const [newCommentImportant, setNewCommentImportant] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editImportant, setEditImportant] = useState(false);
  const [adjustedServings, setAdjustedServings] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<EditData | null>(null);
  const [showAddToMealPlan, setShowAddToMealPlan] = useState(false);
  const [showMealPlanHistory, setShowMealPlanHistory] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);

  const { data: recipe, isLoading } = useQuery<Recipe>({
    queryKey: ["recipe", id],
    queryFn: () => api(`/api/recipes/${id}`),
  });

  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: ["recipe", id, "comments"],
    queryFn: () => api(`/api/recipes/${id}/comments`),
    enabled: !!id,
  });

  const { data: recipeMealPlans = [] } = useQuery<MealPlanSummary[]>({
    queryKey: ["recipe-meal-plans", id],
    queryFn: () => api(`/api/meal-plans/by-recipe/${id}`),
    enabled: !!id,
  });

  const { data: shareStatus } = useQuery<{ shared: boolean; comment: string | null }>({
    queryKey: ["share-status", id],
    queryFn: () => api(`/api/shares/status/${id}`),
    enabled: !!id,
  });

  const unshareMutation = useMutation({
    mutationFn: () => api(`/api/shares/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["share-status", id] });
      queryClient.invalidateQueries({ queryKey: ["shared-recipes"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api(`/api/recipes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      queryClient.invalidateQueries({ queryKey: ["recipe-filters"] });
      queryClient.invalidateQueries({ queryKey: ["recipes-count"] });
      queryClient.invalidateQueries({ queryKey: ["recipes-all"] });
      navigate("/", { replace: true });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: ({ content, isImportant }: { content: string; isImportant: boolean }) =>
      api(`/api/recipes/${id}/comments`, {
        method: "POST",
        body: { content, isImportant },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipe", id, "comments"] });
      setNewComment("");
      setNewCommentImportant(false);
    },
  });

  const updateCommentMutation = useMutation({
    mutationFn: ({
      commentId,
      content,
      isImportant,
    }: {
      commentId: string;
      content: string;
      isImportant: boolean;
    }) =>
      api(`/api/recipes/${id}/comments/${commentId}`, {
        method: "PATCH",
        body: { content, isImportant },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipe", id, "comments"] });
      setEditingId(null);
      setEditContent("");
      setEditImportant(false);
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) =>
      api(`/api/recipes/${id}/comments/${commentId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipe", id, "comments"] });
    },
  });

  const updateTagsMutation = useMutation({
    mutationFn: (tagNames: string[]) =>
      api(`/api/recipes/${id}`, {
        method: "PATCH",
        body: { tags: tagNames },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipe", id] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
  });

  const updateRecipeMutation = useMutation({
    mutationFn: (data: EditData) =>
      api(`/api/recipes/${id}`, {
        method: "PATCH",
        body: {
          title: data.title,
          description: data.description || undefined,
          instructions: data.instructions,
          servings: data.servings,
          prepTimeMinutes: data.prepTimeMinutes,
          cookTimeMinutes: data.cookTimeMinutes,
          difficulty: data.difficulty,

          ingredients: data.ingredients
            .filter((ing) => ing.name.trim())
            .map((ing, i) => ({
              name: ing.name,
              amount: ing.amount || undefined,
              unit: ing.unit || undefined,
              category: ing.category,
              isSuggested: ing.isSuggested,
              sortOrder: i,
            })),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipe", id] });
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      queryClient.invalidateQueries({ queryKey: ["recipe-filters"] });
      queryClient.invalidateQueries({ queryKey: ["recipes-count"] });
      queryClient.invalidateQueries({ queryKey: ["recipes-all"] });
      setIsEditing(false);
      setEditData(null);
    },
  });

  function startEditing() {
    if (recipe) {
      setEditData(recipeToEditData(recipe));
      setIsEditing(true);
    }
  }

  // Auto-enter edit mode when navigated with state.edit (e.g. manual add)
  useEffect(() => {
    if ((location.state as { edit?: boolean })?.edit && recipe && !isEditing) {
      setEditData(recipeToEditData(recipe));
      setIsEditing(true);
      // Clear the state so refreshing doesn't re-enter edit mode
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [recipe, location.state, isEditing, navigate, location.pathname]);

  function cancelEditing() {
    setIsEditing(false);
    setEditData(null);
  }

  function updateEditField<K extends keyof EditData>(field: K, value: EditData[K]) {
    setEditData((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function updateIngredient(index: number, field: keyof Ingredient, value: string) {
    setEditData((prev) => {
      if (!prev) return prev;
      const ingredients = [...prev.ingredients];
      ingredients[index] = { ...ingredients[index], [field]: value };
      return { ...prev, ingredients };
    });
  }

  function addIngredient() {
    setEditData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ingredients: [
          ...prev.ingredients,
          {
            id: crypto.randomUUID(),
            name: "",
            amount: "",
            unit: "",
            category: "overig" as IngredientCategory,
          },
        ],
      };
    });
  }

  function removeIngredient(index: number) {
    setEditData((prev) => {
      if (!prev) return prev;
      return { ...prev, ingredients: prev.ingredients.filter((_, i) => i !== index) };
    });
  }

  const deleteImageMutation = useMutation({
    mutationFn: (imageId: string) => api(`/api/images/${imageId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipe", id] });
    },
  });

  const uploadImage = useCallback(
    async (file: File) => {
      if (!id) return;
      setUploading(true);
      try {
        const { base64, mediaType } = await compressPhoto(file);
        const blob = await fetch(`data:${mediaType};base64,${base64}`).then((r) => r.blob());

        const { uploadUrl, key } = await api<{ uploadUrl: string; key: string }>(
          "/api/images/upload-url",
          { method: "POST", body: { recipeId: id, contentType: mediaType } },
        );

        await fetch(uploadUrl, {
          method: "PUT",
          body: blob,
          headers: { "Content-Type": mediaType },
        });

        await api("/api/images/confirm", {
          method: "POST",
          body: {
            recipeId: id,
            key,
            isPrimary: !recipe?.images?.filter((img) => img.caption !== "scan-original").length,
          },
        });

        queryClient.invalidateQueries({ queryKey: ["recipe", id] });
      } catch (err: unknown) {
        console.error("Upload failed:", err);
      } finally {
        setUploading(false);
      }
    },
    [id, recipe?.images?.filter, queryClient],
  );

  const scrollToComments = () => {
    commentsRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Auto-scroll carousel + track active slide
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;

    const handleScroll = () => {
      const index = Math.round(el.scrollLeft / el.clientWidth);
      setActiveSlide(index);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });

    const childCount = el.children.length;
    if (childCount <= 1) return () => el.removeEventListener("scroll", handleScroll);

    const interval = setInterval(() => {
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % childCount;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, 5000);

    return () => {
      el.removeEventListener("scroll", handleScroll);
      clearInterval(interval);
    };
  }, []);

  if (isLoading || !recipe) return <Loading />;

  const visibleImages = recipe.images?.filter((img) => img.caption !== "scan-original") ?? [];
  const scanOriginal = recipe.images?.find((img) => img.caption === "scan-original");

  const metaParts: string[] = [];
  if (recipe.prepTimeMinutes) metaParts.push(`${recipe.prepTimeMinutes} min prep`);
  if (recipe.cookTimeMinutes) metaParts.push(`${recipe.cookTimeMinutes} min koken`);
  if (recipe.cuisine) metaParts.push(recipe.cuisine);
  if (recipe.difficulty) metaParts.push(difficultyLabels[recipe.difficulty]);

  return (
    <div className={isEditing ? "pb-28" : ""}>
      {/* Hero image */}
      {visibleImages.length > 0 ? (
        <div className="relative -mx-4 -mt-6 mb-5">
          <div
            ref={carouselRef}
            className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none"
          >
            {visibleImages.map((img) => (
              <div key={img.id} className="relative shrink-0 w-full snap-center">
                <img src={img.url} alt={recipe.title} className="w-full h-64 object-cover" />
                <button
                  type="button"
                  onClick={async () => {
                    if (await confirm({ title: "Foto verwijderen?" }))
                      deleteImageMutation.mutate(img.id);
                  }}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          {visibleImages.length > 1 && (
            <div className="absolute bottom-18 left-1/2 -translate-x-1/2 flex gap-1.5">
              {visibleImages.map((img, i) => (
                <span
                  key={img.id}
                  className={`w-2 h-2 rounded-full transition-colors ${i === activeSlide ? "bg-white" : "bg-white/40"}`}
                />
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="absolute top-4 left-4 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          {/* Action bar on image */}
          {!isEditing && (
            <div className="absolute bottom-0 inset-x-0 flex items-center gap-3 px-4 py-2.5 bg-black/30 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setShowAddToMealPlan(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 text-white text-sm font-medium hover:bg-white/30 transition-colors"
              >
                <CalendarPlus size={16} />
                <span className="hidden sm:inline">Toevoegen aan </span>Weekmenu
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => {
                  if (shareStatus?.shared) unshareMutation.mutate();
                  else setShowShareModal(true);
                }}
                className="p-2 rounded-full text-white/90 hover:bg-white/15 transition-colors"
              >
                <Heart
                  size={20}
                  className={shareStatus?.shared ? "fill-red-500 text-red-500" : ""}
                />
              </button>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploading}
                className="p-2 rounded-full text-white/90 hover:bg-white/15 transition-colors"
              >
                <ImagePlus size={20} />
              </button>
              <button
                type="button"
                onClick={startEditing}
                className="p-2 rounded-full text-white/90 hover:bg-white/15 transition-colors"
              >
                <Pencil size={20} />
              </button>
              <button
                type="button"
                onClick={scrollToComments}
                className="relative p-2 rounded-full text-white/90 hover:bg-white/15 transition-colors"
              >
                <MessageCircle size={20} />
                {comments.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-danger text-white text-[10px] font-bold rounded-full min-w-4 h-4 flex items-center justify-center px-1">
                    {comments.length}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="relative -mx-4 -mt-6 mb-5">
          <RecipePlaceholder className="w-full h-48" variant="hero" />
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="absolute top-4 left-4 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          {!isEditing && (
            <div className="absolute bottom-0 inset-x-0 flex items-center gap-3 px-4 py-2.5 bg-black/15 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setShowAddToMealPlan(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 text-white text-sm font-medium hover:bg-white/30 transition-colors"
              >
                <CalendarPlus size={16} />
                <span className="hidden sm:inline">Toevoegen aan </span>Weekmenu
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => {
                  if (shareStatus?.shared) unshareMutation.mutate();
                  else setShowShareModal(true);
                }}
                className="p-2 rounded-full text-white/90 hover:bg-white/15 transition-colors"
              >
                <Heart
                  size={20}
                  className={shareStatus?.shared ? "fill-red-500 text-red-500" : ""}
                />
              </button>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploading}
                className="p-2 rounded-full text-white/90 hover:bg-white/15 transition-colors"
              >
                <ImagePlus size={20} />
              </button>
              <button
                type="button"
                onClick={startEditing}
                className="p-2 rounded-full text-white/90 hover:bg-white/15 transition-colors"
              >
                <Pencil size={20} />
              </button>
              <button
                type="button"
                onClick={scrollToComments}
                className="relative p-2 rounded-full text-white/90 hover:bg-white/15 transition-colors"
              >
                <MessageCircle size={20} />
                {comments.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-danger text-white text-[10px] font-bold rounded-full min-w-4 h-4 flex items-center justify-center px-1">
                    {comments.length}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadImage(file);
          e.target.value = "";
        }}
      />

      {/* Title + description */}
      {isEditing && editData ? (
        <>
          <Input
            value={editData.title}
            onChange={(e) => updateEditField("title", e.target.value)}
            className="text-2xl font-bold mb-2"
            placeholder="Titel"
          />
          <Textarea
            value={editData.description}
            onChange={(e) => updateEditField("description", e.target.value)}
            placeholder="Beschrijving (optioneel)"
            rows={2}
            className="mb-4"
          />
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold mb-2">{recipe.title}</h1>
          {recipe.description && <p className="text-gray-500 mb-3">{recipe.description}</p>}
        </>
      )}

      {/* Meta info */}
      {isEditing && editData ? (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Porties</label>
            <input
              type="number"
              min={1}
              max={99}
              value={editData.servings ?? ""}
              onChange={(e) =>
                updateEditField("servings", e.target.value ? Number(e.target.value) : undefined)
              }
              placeholder="—"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Moeilijkheid</label>
            <select
              value={editData.difficulty ?? ""}
              onChange={(e) =>
                updateEditField(
                  "difficulty",
                  (e.target.value || undefined) as DifficultyLevel | undefined,
                )
              }
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">—</option>
              {difficultyLevels.map((level) => (
                <option key={level} value={level}>
                  {difficultyLabels[level]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Prep (min)</label>
            <input
              type="number"
              min={0}
              value={editData.prepTimeMinutes ?? ""}
              onChange={(e) =>
                updateEditField(
                  "prepTimeMinutes",
                  e.target.value ? Number(e.target.value) : undefined,
                )
              }
              placeholder="—"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Kooktijd (min)</label>
            <input
              type="number"
              min={0}
              value={editData.cookTimeMinutes ?? ""}
              onChange={(e) =>
                updateEditField(
                  "cookTimeMinutes",
                  e.target.value ? Number(e.target.value) : undefined,
                )
              }
              placeholder="—"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>
      ) : (
        (recipe.servings || metaParts.length > 0) && (
          <div className="flex flex-wrap gap-2 text-sm text-gray-500 mb-4">
            {recipe.servings && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-gray-50 border border-gray-200 px-2.5 py-1">
                <button
                  type="button"
                  onClick={() =>
                    setAdjustedServings((s) => Math.max(1, (s ?? recipe.servings!) - 1))
                  }
                  className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-gray-200 active:bg-gray-300 transition-colors"
                >
                  <Minus size={10} />
                </button>
                <span className="font-medium text-gray-900 min-w-[1.2rem] text-center">
                  {adjustedServings ?? recipe.servings}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setAdjustedServings((s) => Math.min(99, (s ?? recipe.servings!) + 1))
                  }
                  className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-gray-200 active:bg-gray-300 transition-colors"
                >
                  <Plus size={10} />
                </button>
                <span>pers</span>
              </span>
            )}
            {metaParts.map((part) => (
              <span
                key={part}
                className="inline-flex items-center rounded-full bg-gray-50 border border-gray-200 px-2.5 py-1"
              >
                {part}
              </span>
            ))}
          </div>
        )
      )}

      {/* Important notes (from comments) */}
      {!isEditing && (
        <>
          {comments
            .filter((c) => c.isImportant)
            .map((c) => (
              <div
                key={c.id}
                className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 mb-2"
              >
                <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-amber-800">{c.content}</p>
              </div>
            ))}
          {comments.some((c) => c.isImportant) && <div className="mb-2" />}
        </>
      )}

      {/* Ingredients */}
      {isEditing && editData ? (
        <section className="mb-6 pt-5 border-t border-gray-200">
          <h2 className="text-lg font-semibold mb-3">Ingrediënten</h2>
          <Card>
            <div className="space-y-2">
              {editData.ingredients.map((ing, index) => (
                <div
                  key={ing.id}
                  className="flex flex-wrap gap-1.5 items-center pb-2 border-b border-gray-100 last:border-0 last:pb-0"
                >
                  <input
                    value={ing.amount ?? ""}
                    onChange={(e) => updateIngredient(index, "amount", e.target.value)}
                    placeholder="Hvh"
                    className="w-14 px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                  <input
                    value={ing.unit ?? ""}
                    onChange={(e) => updateIngredient(index, "unit", e.target.value)}
                    placeholder="Eenh"
                    className="w-14 px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                  <input
                    value={ing.name}
                    onChange={(e) => updateIngredient(index, "name", e.target.value)}
                    placeholder="Ingrediënt"
                    className="min-w-0 flex-1 basis-28 px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                  <select
                    value={ing.category ?? "overig"}
                    onChange={(e) => updateIngredient(index, "category", e.target.value)}
                    className="min-w-0 flex-1 basis-24 px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    {ingredientCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {ingredientCategoryLabels[cat]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeIngredient(index)}
                    className="p-1.5 text-gray-400 hover:text-danger transition-colors shrink-0"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addIngredient}
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Plus size={14} />
              Ingrediënt toevoegen
            </button>
          </Card>
        </section>
      ) : (
        recipe.ingredients?.length > 0 && (
          <section className="mb-6 pt-5 border-t border-gray-200">
            <h2 className="text-lg font-semibold mb-3">Ingrediënten</h2>
            {ingredientCategories
              .map((cat) => ({
                cat,
                items: recipe.ingredients.filter((ing) =>
                  cat === "overig"
                    ? ing.category === "overig" ||
                      !ing.category ||
                      !ingredientCategories.includes(ing.category)
                    : ing.category === cat,
                ),
              }))
              .filter((group) => group.items.length > 0)
              .map((group) => (
                <div key={group.cat} className="mb-3 last:mb-0">
                  <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
                    {ingredientCategoryLabels[group.cat]}
                  </h3>
                  <ul className="space-y-1.5">
                    {group.items.map((ing) => (
                      <li key={ing.id} className="flex items-center gap-2 text-sm">
                        {ing.isSuggested ? (
                          <Lightbulb size={14} className="text-amber-500 shrink-0" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        )}
                        <span className={ing.isSuggested ? "text-gray-500 italic" : ""}>
                          {[
                            ing.amount && !ing.amount.startsWith("<")
                              ? adjustedServings && recipe.servings
                                ? scaleAmount(ing.amount, adjustedServings / recipe.servings)
                                : ing.amount
                              : undefined,
                            ing.unit && !ing.unit.startsWith("<") ? ing.unit : undefined,
                            ing.name,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          {ing.isSuggested && (
                            <span className="text-xs text-amber-600 ml-1">suggestie</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </section>
        )
      )}

      {/* Instructions */}
      <section className="mb-6 pt-5 border-t border-gray-200">
        <h2 className="text-lg font-semibold mb-3">Bereiding</h2>
        {isEditing && editData ? (
          <Textarea
            value={editData.instructions}
            onChange={(e) => updateEditField("instructions", e.target.value)}
            placeholder="Bereidingswijze..."
            rows={10}
          />
        ) : (
          <div className="whitespace-pre-line leading-relaxed text-sm">{recipe.instructions}</div>
        )}
      </section>

      {/* Tags + links */}
      {!isEditing && (
        <div className="mb-6">
          <TagInput
            value={recipe.recipeTags?.map((rt) => rt.tag.name) ?? []}
            onChange={(tags) => updateTagsMutation.mutate(tags)}
          />
          {(recipe.sourceUrl || scanOriginal || recipeMealPlans.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mt-3">
              {recipe.sourceUrl && (
                <a
                  href={recipe.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-gray-500 hover:text-primary transition-colors"
                >
                  <ExternalLink size={14} />
                  Origineel recept
                </a>
              )}
              {scanOriginal && (
                <a
                  href={scanOriginal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-gray-500 hover:text-primary transition-colors"
                >
                  <ExternalLink size={14} />
                  Originele foto
                </a>
              )}
              {recipeMealPlans.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowMealPlanHistory(true)}
                  className="inline-flex items-center gap-1 text-gray-500 hover:text-primary transition-colors"
                >
                  <Calendar size={14} />
                  {recipeMealPlans.length} weekmenu{recipeMealPlans.length !== 1 ? "'s" : ""}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Comments */}
      <section ref={commentsRef} className="mb-6 pt-5 border-t border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">
            Opmerkingen{comments.length > 0 && ` (${comments.length})`}
          </h2>
          <button
            type="button"
            onClick={() => {
              setNewComment("");
              setEditingId("new");
            }}
            className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200 hover:text-gray-700 transition-colors"
          >
            <Plus size={18} />
          </button>
        </div>

        {comments.length === 0 && !editingId && (
          <p className="text-sm text-gray-400">Nog geen opmerkingen</p>
        )}

        <div className="space-y-2">
          {comments.map((comment) => (
            <button
              key={comment.id}
              type="button"
              onClick={() => {
                setEditingId(comment.id);
                setEditContent(comment.content);
                setEditImportant(comment.isImportant);
              }}
              className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${comment.isImportant ? "bg-amber-50 border-amber-200 hover:border-amber-300" : "bg-white border-gray-200 hover:border-gray-300"}`}
            >
              <div className="flex items-start gap-2">
                {comment.isImportant && (
                  <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm whitespace-pre-line line-clamp-3">{comment.content}</p>
                  <span className="text-xs text-gray-400 mt-1 block">
                    {formatDate(comment.createdAt)}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Comment modal */}
      {editingId &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <button
              type="button"
              className="fixed inset-0 bg-black/40 animate-fade-in cursor-default"
              onClick={() => {
                setEditingId(null);
                setEditContent("");
                setNewComment("");
                setNewCommentImportant(false);
                setEditImportant(false);
              }}
              aria-label="Sluiten"
              tabIndex={-1}
            />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 animate-scale-in">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">
                  {editingId === "new" ? "Nieuwe opmerking" : "Opmerking bewerken"}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setEditContent("");
                    setNewComment("");
                    setNewCommentImportant(false);
                    setEditImportant(false);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={18} />
                </button>
              </div>
              <textarea
                value={editingId === "new" ? newComment : editContent}
                onChange={(e) =>
                  editingId === "new"
                    ? setNewComment(e.target.value)
                    : setEditContent(e.target.value)
                }
                placeholder="Schrijf een opmerking..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                rows={4}
                ref={(el) => el?.focus()}
              />
              <label className="flex items-center gap-2.5 mt-3 cursor-pointer select-none">
                <button
                  type="button"
                  role="switch"
                  aria-checked={editingId === "new" ? newCommentImportant : editImportant}
                  onClick={() =>
                    editingId === "new"
                      ? setNewCommentImportant((v) => !v)
                      : setEditImportant((v) => !v)
                  }
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${(editingId === "new" ? newCommentImportant : editImportant) ? "bg-amber-500" : "bg-gray-200"}`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${(editingId === "new" ? newCommentImportant : editImportant) ? "translate-x-[18px]" : "translate-x-[3px]"}`}
                  />
                </button>
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <AlertTriangle size={14} className="text-amber-500" />
                  <span>Belangrijk</span>
                </div>
              </label>
              <div className="flex gap-2 mt-3">
                {editingId === "new" ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      if (newComment.trim()) {
                        addCommentMutation.mutate({
                          content: newComment.trim(),
                          isImportant: newCommentImportant,
                        });
                        setEditingId(null);
                        setNewComment("");
                        setNewCommentImportant(false);
                      }
                    }}
                    disabled={!newComment.trim() || addCommentMutation.isPending}
                  >
                    Toevoegen
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (editContent.trim()) {
                          updateCommentMutation.mutate({
                            commentId: editingId,
                            content: editContent,
                            isImportant: editImportant,
                          });
                        }
                      }}
                      disabled={!editContent.trim() || updateCommentMutation.isPending}
                    >
                      Opslaan
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger"
                      onClick={async () => {
                        if (await confirm({ title: "Opmerking verwijderen?" })) {
                          deleteCommentMutation.mutate(editingId);
                          setEditingId(null);
                          setEditContent("");
                        }
                      }}
                    >
                      Verwijderen
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Edit save/cancel — fixed bar above bottom nav */}
      {isEditing && editData ? (
        <div className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom))] left-0 right-0 z-40">
          <div className="mx-auto max-w-2xl px-4 py-3">
            <div className="flex gap-3 bg-white rounded-2xl shadow-lg border border-gray-200 px-4 py-3">
              <Button
                variant="primary"
                size="lg"
                icon={Check}
                className="flex-1"
                onClick={() => updateRecipeMutation.mutate(editData)}
                disabled={
                  !editData.title.trim() ||
                  !editData.instructions.trim() ||
                  updateRecipeMutation.isPending
                }
              >
                {updateRecipeMutation.isPending ? "Opslaan..." : "Opslaan"}
              </Button>
              <Button variant="outline" size="lg" icon={X} onClick={cancelEditing}>
                Annuleren
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="pt-6">
          <button
            type="button"
            onClick={async () => {
              if (
                await confirm({
                  title: "Recept verwijderen?",
                  description: "Weet je zeker dat je dit recept wilt verwijderen?",
                })
              ) {
                deleteMutation.mutate();
              }
            }}
            className="w-full py-3 rounded-xl border-2 border-danger text-danger font-medium text-sm hover:bg-danger hover:text-white transition-colors"
          >
            Recept verwijderen
          </button>
        </div>
      )}
      {confirmModal}
      <AddToMealPlanModal
        recipeId={id!}
        open={showAddToMealPlan}
        onClose={() => setShowAddToMealPlan(false)}
      />
      <MealPlanHistoryModal
        plans={recipeMealPlans}
        open={showMealPlanHistory}
        onClose={() => setShowMealPlanHistory(false)}
      />
      <ShareRecipeModal
        recipeId={id!}
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        onShared={() => {
          queryClient.invalidateQueries({ queryKey: ["share-status", id] });
          queryClient.invalidateQueries({ queryKey: ["shared-recipes"] });
        }}
      />
    </div>
  );
}
