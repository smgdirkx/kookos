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
  ArrowLeft,
  Check,
  ChefHat,
  Clock,
  ExternalLink,
  Flame,
  Globe,
  ImagePlus,
  Lightbulb,
  MessageCircle,
  Minus,
  Pencil,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TagInput } from "@/components/tag-input";
import {
  Badge,
  Button,
  Card,
  IconButton,
  Input,
  Loading,
  Tag,
  Textarea,
  useConfirm,
} from "@/components/ui";
import { api } from "@/lib/api";
import { compressImage } from "@/lib/image";

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

const difficultyVariant = {
  makkelijk: "success",
  gemiddeld: "warning",
  moeilijk: "danger",
} as const;

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

export function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirm, confirmModal] = useConfirm();
  const commentsRef = useRef<HTMLElement>(null);
  const [newComment, setNewComment] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [adjustedServings, setAdjustedServings] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<EditData | null>(null);

  const { data: recipe, isLoading } = useQuery<Recipe>({
    queryKey: ["recipe", id],
    queryFn: () => api(`/api/recipes/${id}`),
  });

  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: ["recipe", id, "comments"],
    queryFn: () => api(`/api/recipes/${id}/comments`),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => api(`/api/recipes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      navigate("/", { replace: true });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: (content: string) =>
      api(`/api/recipes/${id}/comments`, {
        method: "POST",
        body: { content },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipe", id, "comments"] });
      setNewComment("");
    },
  });

  const updateCommentMutation = useMutation({
    mutationFn: ({ commentId, content }: { commentId: string; content: string }) =>
      api(`/api/recipes/${id}/comments/${commentId}`, {
        method: "PATCH",
        body: { content },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipe", id, "comments"] });
      setEditingId(null);
      setEditContent("");
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
          ingredients: data.ingredients.map((ing, i) => ({
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
        const { base64, mediaType } = await compressImage(file);
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
    [id, recipe?.images?.length, queryClient],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith("image/")) uploadImage(file);
    },
    [uploadImage],
  );

  const scrollToComments = () => {
    commentsRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  if (isLoading || !recipe) return <Loading />;

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-primary text-sm mb-4 hover:underline"
      >
        <ArrowLeft size={16} />
        Terug
      </button>

      {recipe.images?.filter((img) => img.caption !== "scan-original").length > 0 && (
        <div className="flex gap-2 overflow-x-auto mb-4 -mx-4 px-4">
          {recipe.images
            .filter((img) => img.caption !== "scan-original")
            .map((img) => (
              <div key={img.id} className="relative shrink-0">
                <img src={img.url} alt={recipe.title} className="h-56 rounded-xl object-cover" />
                <button
                  type="button"
                  onClick={async () => {
                    if (await confirm({ title: "Foto verwijderen?" }))
                      deleteImageMutation.mutate(img.id);
                  }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
        </div>
      )}

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`mb-4 border-2 border-dashed rounded-xl p-4 flex items-center justify-center gap-2 text-sm cursor-pointer transition-colors ${
          isDragging
            ? "border-primary bg-primary/5 text-primary"
            : "border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500"
        }`}
      >
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
        {uploading ? (
          <span>Uploaden...</span>
        ) : (
          <>
            <ImagePlus size={18} />
            <span>Foto toevoegen</span>
          </>
        )}
      </label>

      <div className="flex items-start justify-between gap-2 mb-2">
        {isEditing && editData ? (
          <Input
            value={editData.title}
            onChange={(e) => updateEditField("title", e.target.value)}
            className="text-2xl font-bold"
            placeholder="Titel"
          />
        ) : (
          <h1 className="text-3xl font-bold">{recipe.title}</h1>
        )}
        <div className="flex gap-1 shrink-0 mt-1">
          {!isEditing && (
            <IconButton
              icon={Pencil}
              label="Recept bewerken"
              variant="ghost"
              size="sm"
              onClick={startEditing}
            />
          )}
          {comments.length > 0 && !isEditing && (
            <IconButton
              icon={MessageCircle}
              label="Ga naar opmerkingen"
              variant="ghost"
              size="sm"
              badge={comments.length}
              onClick={scrollToComments}
            />
          )}
        </div>
      </div>

      {isEditing && editData ? (
        <Textarea
          value={editData.description}
          onChange={(e) => updateEditField("description", e.target.value)}
          placeholder="Beschrijving (optioneel)"
          rows={2}
          className="mb-4"
        />
      ) : (
        recipe.description && <p className="text-gray-500 mb-4">{recipe.description}</p>
      )}

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
        <div className="flex flex-wrap gap-2 mb-6">
          {recipe.servings && (
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1 text-sm">
              <Users size={14} className="text-gray-500" />
              <button
                type="button"
                onClick={() => setAdjustedServings((s) => Math.max(1, (s ?? recipe.servings!) - 1))}
                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-gray-200 active:bg-gray-300 transition-colors"
              >
                <Minus size={12} />
              </button>
              <span className="font-medium min-w-[1.5rem] text-center">
                {adjustedServings ?? recipe.servings}
              </span>
              <button
                type="button"
                onClick={() =>
                  setAdjustedServings((s) => Math.min(99, (s ?? recipe.servings!) + 1))
                }
                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-gray-200 active:bg-gray-300 transition-colors"
              >
                <Plus size={12} />
              </button>
              <span className="text-gray-500">personen</span>
            </div>
          )}
          {recipe.prepTimeMinutes && (
            <Badge icon={Clock}>
              <span className="font-medium">{recipe.prepTimeMinutes}</span> min prep
            </Badge>
          )}
          {recipe.cookTimeMinutes && (
            <Badge icon={Flame}>
              <span className="font-medium">{recipe.cookTimeMinutes}</span> min koken
            </Badge>
          )}
          {recipe.cuisine && <Badge icon={Globe}>{recipe.cuisine}</Badge>}
          {recipe.difficulty && (
            <Tag variant={difficultyVariant[recipe.difficulty]}>
              <ChefHat size={12} className="mr-1" />
              {difficultyLabels[recipe.difficulty]}
            </Tag>
          )}
        </div>
      )}

      {isEditing && editData ? (
        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-3">Ingrediënten</h2>
          <Card>
            <div className="space-y-2">
              {editData.ingredients.map((ing, index) => (
                <div key={ing.id} className="flex gap-2 items-start">
                  <input
                    value={ing.amount ?? ""}
                    onChange={(e) => updateIngredient(index, "amount", e.target.value)}
                    placeholder="Hvh"
                    className="w-16 px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                  <input
                    value={ing.unit ?? ""}
                    onChange={(e) => updateIngredient(index, "unit", e.target.value)}
                    placeholder="Eenh"
                    className="w-16 px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                  <input
                    value={ing.name}
                    onChange={(e) => updateIngredient(index, "name", e.target.value)}
                    placeholder="Ingrediënt"
                    className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                  <select
                    value={ing.category ?? "overig"}
                    onChange={(e) => updateIngredient(index, "category", e.target.value)}
                    className="w-28 px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
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
          <section className="mb-6">
            <h2 className="text-xl font-semibold mb-3">Ingrediënten</h2>
            <Card>
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
            </Card>
          </section>
        )
      )}

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Bereiding</h2>
        {isEditing && editData ? (
          <Card>
            <Textarea
              value={editData.instructions}
              onChange={(e) => updateEditField("instructions", e.target.value)}
              placeholder="Bereidingswijze..."
              rows={10}
            />
          </Card>
        ) : (
          <Card>
            <div className="whitespace-pre-line leading-relaxed text-sm">{recipe.instructions}</div>
          </Card>
        )}
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Tags</h2>
        <Card>
          <TagInput
            value={recipe.recipeTags?.map((rt) => rt.tag.name) ?? []}
            onChange={(tags) => updateTagsMutation.mutate(tags)}
          />
        </Card>
      </section>

      {recipe.sourceUrl && (
        <a
          href={recipe.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-primary text-sm hover:underline mb-6"
        >
          <ExternalLink size={14} />
          Bekijk origineel recept
        </a>
      )}

      {(() => {
        const scanOriginal = recipe.images?.find((img) => img.caption === "scan-original");
        return scanOriginal ? (
          <a
            href={scanOriginal.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-primary text-sm hover:underline mb-6"
          >
            <ExternalLink size={14} />
            Bekijk originele foto
          </a>
        ) : null;
      })()}

      <section ref={commentsRef} className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Opmerkingen</h2>

        {comments.map((comment) => (
          <Card key={comment.id} className="mb-3">
            {editingId === comment.id ? (
              <div className="space-y-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      updateCommentMutation.mutate({
                        commentId: comment.id,
                        content: editContent,
                      })
                    }
                    disabled={!editContent.trim() || updateCommentMutation.isPending}
                  >
                    Opslaan
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(null);
                      setEditContent("");
                    }}
                  >
                    Annuleren
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm whitespace-pre-line">{comment.content}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-400">{formatDate(comment.createdAt)}</span>
                  <div className="flex gap-1">
                    <IconButton
                      icon={Pencil}
                      label="Bewerk opmerking"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(comment.id);
                        setEditContent(comment.content);
                      }}
                    />
                    <IconButton
                      icon={Trash2}
                      label="Verwijder opmerking"
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      onClick={async () => {
                        if (await confirm({ title: "Opmerking verwijderen?" })) {
                          deleteCommentMutation.mutate(comment.id);
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </Card>
        ))}

        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newComment.trim()) {
                addCommentMutation.mutate(newComment.trim());
              }
            }}
            className="flex gap-2"
          >
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Schrijf een opmerking..."
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
              rows={2}
            />
            <IconButton
              icon={Send}
              label="Opmerking plaatsen"
              variant="primary"
              size="md"
              type="submit"
              disabled={!newComment.trim() || addCommentMutation.isPending}
              className="self-end"
            />
          </form>
        </Card>
      </section>

      {isEditing && editData ? (
        <div className="flex gap-3 mt-6 mb-4">
          <Button
            variant="primary"
            icon={Check}
            onClick={() => updateRecipeMutation.mutate(editData)}
            disabled={
              !editData.title.trim() ||
              !editData.instructions.trim() ||
              updateRecipeMutation.isPending
            }
          >
            {updateRecipeMutation.isPending ? "Opslaan..." : "Opslaan"}
          </Button>
          <Button variant="ghost" onClick={cancelEditing}>
            Annuleren
          </Button>
        </div>
      ) : (
        <div className="mt-8 pt-4 border-t">
          <Button
            variant="ghost"
            size="sm"
            icon={Trash2}
            className="text-danger hover:bg-danger-light"
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
          >
            Recept verwijderen
          </Button>
        </div>
      )}
      {confirmModal}
    </div>
  );
}
