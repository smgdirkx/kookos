import {
  type DifficultyLevel,
  difficultyLabels,
  type IngredientCategory,
  ingredientCategories,
  ingredientCategoryLabels,
} from "@kookos/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChefHat,
  Clock,
  ExternalLink,
  Flame,
  Globe,
  MessageCircle,
  Pencil,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Card, IconButton, Loading, Tag } from "@/components/ui";
import { api } from "@/lib/api";

type Ingredient = {
  id: string;
  name: string;
  amount?: string;
  unit?: string;
  category?: IngredientCategory;
};

type RecipeImage = {
  id: string;
  url: string;
  isPrimary: boolean;
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
  sourceUrl?: string;
  ingredients: Ingredient[];
  images: RecipeImage[];
};

const difficultyVariant = {
  makkelijk: "success",
  gemiddeld: "warning",
  moeilijk: "danger",
} as const;

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
  const commentsRef = useRef<HTMLElement>(null);
  const [newComment, setNewComment] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

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

      {recipe.images?.length > 0 && (
        <img
          src={recipe.images[0].url}
          alt={recipe.title}
          className="w-full h-56 object-cover rounded-xl mb-4"
        />
      )}

      <div className="flex items-start justify-between gap-2 mb-2">
        <h1 className="text-3xl font-bold">{recipe.title}</h1>
        {comments.length > 0 && (
          <IconButton
            icon={MessageCircle}
            label="Ga naar opmerkingen"
            variant="ghost"
            size="sm"
            badge={comments.length}
            onClick={scrollToComments}
            className="shrink-0 mt-1"
          />
        )}
      </div>

      {recipe.description && <p className="text-gray-500 mb-4">{recipe.description}</p>}

      <div className="flex flex-wrap gap-2 mb-6">
        {recipe.servings && (
          <Badge icon={Users}>
            <span className="font-medium">{recipe.servings}</span> personen
          </Badge>
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

      {recipe.ingredients?.length > 0 && (
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
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        <span>
                          {ing.amount} {ing.unit} {ing.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </Card>
        </section>
      )}

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Bereiding</h2>
        <Card>
          <div className="whitespace-pre-line leading-relaxed text-sm">{recipe.instructions}</div>
        </Card>
      </section>

      {recipe.notes && (
        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-3">Notities</h2>
          <Card className="bg-cta-light border-cta/20">
            <p className="text-sm text-gray-700 italic">{recipe.notes}</p>
          </Card>
        </section>
      )}

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
                      onClick={() => {
                        if (confirm("Opmerking verwijderen?")) {
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

      <div className="mt-8 pt-4 border-t">
        <Button
          variant="ghost"
          size="sm"
          icon={Trash2}
          className="text-danger hover:bg-danger-light"
          onClick={() => {
            if (confirm("Weet je zeker dat je dit recept wilt verwijderen?")) {
              deleteMutation.mutate();
            }
          }}
        >
          Recept verwijderen
        </Button>
      </div>
    </div>
  );
}
