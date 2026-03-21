import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  GripVertical,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Card, Input, Loading, RecipePlaceholder, useConfirm } from "@/components/ui";
import { api } from "@/lib/api";

type RecipeImage = { id: string; url: string; caption?: string | null };

type MealPlanItem = {
  id: string;
  date: string;
  mealType: string;
  checked: boolean;
  recipe: {
    id: string;
    title: string;
    images?: RecipeImage[];
    comments?: { id: string; content: string; isImportant: boolean }[];
  };
};

type MealPlanDetail = {
  id: string;
  name: string;
  servings: number;
  startDate: string;
  createdAt: string;
  items: MealPlanItem[];
  shoppingLists: {
    id: string;
    items: {
      id: string;
      name: string;
      amount?: string;
      unit?: string;
      checked: boolean;
    }[];
  }[];
};

type Recipe = {
  id: string;
  title: string;
  images?: RecipeImage[];
};

const dayNames = ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"];

function SortableItem({ item, onDelete }: { item: MealPlanItem; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const date = new Date(item.date);
  const dayName = dayNames[date.getDay()];
  const images = item.recipe.images ?? [];
  const displayImage = images.find((img) => img.caption !== "scan-original") ?? images[0];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border border-gray-100 bg-white p-3 shadow-sm ${isDragging ? "opacity-50 shadow-lg" : ""}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="touch-none text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
        <span className="text-xs font-medium text-gray-400 uppercase w-6">{dayName}</span>
        {displayImage ? (
          <img
            src={displayImage.url}
            alt=""
            className="w-11 h-11 rounded-lg object-cover shrink-0"
          />
        ) : (
          <RecipePlaceholder className="w-11 h-11 rounded-lg shrink-0" variant="hero" />
        )}
        <Link
          to={`/recipe/${item.recipe.id}`}
          className="flex-1 text-sm font-medium hover:underline"
        >
          {item.recipe.title}
        </Link>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="text-gray-300 hover:text-danger transition-colors p-1"
        >
          <X size={14} />
        </button>
      </div>
      {!item.checked &&
        item.recipe.comments
          ?.filter((c) => c.isImportant)
          .map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-1.5 mt-2 ml-8 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5"
            >
              <AlertTriangle size={13} className="shrink-0" />
              {c.content}
            </div>
          ))}
    </div>
  );
}

export function MealPlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirm, confirmModal] = useConfirm();
  const [showAddRecipe, setShowAddRecipe] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingDate, setEditingDate] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const { data: plan, isLoading } = useQuery<MealPlanDetail>({
    queryKey: ["meal-plan", id],
    queryFn: () => api(`/api/meal-plans/${id}`),
  });

  const { data: recipes = [] } = useQuery<Recipe[]>({
    queryKey: ["recipes"],
    queryFn: () => api("/api/recipes"),
    enabled: showAddRecipe,
  });

  const reorderMutation = useMutation({
    mutationFn: (itemIds: string[]) =>
      api(`/api/meal-plans/${id}/items/reorder`, {
        method: "PATCH",
        body: { itemIds },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meal-plan", id] }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) =>
      api(`/api/meal-plans/${id}/items/${itemId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meal-plan", id] }),
  });

  const addItemMutation = useMutation({
    mutationFn: (recipeId: string) => {
      // Add to the next day after the last item
      const lastDate = plan?.items.length
        ? new Date(Math.max(...plan.items.map((i) => new Date(i.date).getTime())))
        : new Date(plan?.startDate ?? new Date());
      const nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + (plan?.items.length ? 1 : 0));

      return api(`/api/meal-plans/${id}/items`, {
        method: "POST",
        body: {
          recipeId,
          date: nextDate.toISOString().split("T")[0],
          mealType: "dinner",
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal-plan", id] });
      setShowAddRecipe(false);
      setSearchQuery("");
    },
  });

  const updateStartDateMutation = useMutation({
    mutationFn: (startDate: string) =>
      api(`/api/meal-plans/${id}`, {
        method: "PATCH",
        body: { startDate },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal-plan", id] });
      setEditingDate(false);
    },
  });

  const createShoppingListMutation = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/api/shopping-lists", {
        method: "POST",
        body: { name: `Boodschappen - ${plan?.name ?? "Weekmenu"}`, mealPlanId: id },
      }),
    onSuccess: (newList) => {
      queryClient.invalidateQueries({ queryKey: ["meal-plan", id] });
      navigate(`/shopping-lists/${newList.id}`);
    },
  });

  async function deletePlan() {
    if (!(await confirm({ title: "Weekmenu verwijderen?" }))) return;
    await api(`/api/meal-plans/${id}`, { method: "DELETE" });
    navigate("/meal-plans", { replace: true });
  }

  if (isLoading || !plan) return <Loading />;

  const sortedItems = [...plan.items].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const firstShoppingList = plan.shoppingLists[0] ?? null;

  const filteredRecipes = searchQuery
    ? recipes.filter((r) => r.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : recipes;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortedItems.findIndex((i) => i.id === active.id);
    const newIndex = sortedItems.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...sortedItems];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    reorderMutation.mutate(reordered.map((i) => i.id));
  }

  async function handleDeleteItem(itemId: string) {
    if (!(await confirm({ title: "Recept uit weekmenu verwijderen?" }))) return;
    deleteItemMutation.mutate(itemId);
  }

  const startDate = new Date(plan.startDate);
  const formattedStartDate = startDate.toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate("/meal-plans")}
        className="inline-flex items-center gap-1.5 text-primary text-sm mb-4 hover:underline"
      >
        <ArrowLeft size={16} />
        Weekmenu's
      </button>

      <h1 className="text-2xl font-bold mb-1">{plan.name}</h1>
      <div className="flex items-center gap-3 text-sm text-gray-400 mb-6">
        <span>{plan.servings} personen</span>
        <span>·</span>
        {editingDate ? (
          <input
            type="date"
            defaultValue={plan.startDate}
            onChange={(e) => {
              if (e.target.value) updateStartDateMutation.mutate(e.target.value);
            }}
            onBlur={() => setEditingDate(false)}
            ref={(el) => el?.focus()}
            className="text-sm border border-gray-200 rounded px-2 py-0.5"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingDate(true)}
            className="inline-flex items-center gap-1 hover:text-primary transition-colors"
          >
            <Calendar size={14} />
            {formattedStartDate}
          </button>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={sortedItems.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2 mb-4">
            {sortedItems.map((item) => (
              <SortableItem key={item.id} item={item} onDelete={handleDeleteItem} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {showAddRecipe ? (
        <Card className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold flex-1">Recept toevoegen</h3>
            <button
              type="button"
              onClick={() => {
                setShowAddRecipe(false);
                setSearchQuery("");
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          </div>
          <Input
            type="text"
            placeholder="Zoek recept..."
            icon={Search}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="mt-2 max-h-48 overflow-y-auto">
            {filteredRecipes.map((recipe) => {
              const imgs = recipe.images ?? [];
              const img = imgs.find((i) => i.caption !== "scan-original") ?? imgs[0];
              return (
                <button
                  key={recipe.id}
                  type="button"
                  onClick={() => addItemMutation.mutate(recipe.id)}
                  disabled={addItemMutation.isPending}
                  className="w-full flex items-center gap-2.5 text-left px-3 py-2 text-sm hover:bg-gray-50 rounded-lg transition-colors"
                >
                  {img ? (
                    <img
                      src={img.url}
                      alt=""
                      className="w-11 h-11 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <RecipePlaceholder className="w-11 h-11 rounded-lg shrink-0" variant="hero" />
                  )}
                  {recipe.title}
                </button>
              );
            })}
            {filteredRecipes.length === 0 && (
              <p className="text-sm text-gray-400 px-3 py-2">Geen recepten gevonden</p>
            )}
          </div>
        </Card>
      ) : (
        <Button
          variant="outline"
          size="sm"
          icon={Plus}
          onClick={() => setShowAddRecipe(true)}
          className="mb-8"
        >
          Recept toevoegen
        </Button>
      )}

      <div className="mb-8">
        {firstShoppingList ? (
          <Link
            to={`/shopping-lists/${firstShoppingList.id}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-secondary border border-secondary/30 rounded-xl hover:bg-secondary/5 transition-colors"
          >
            <ShoppingCart size={16} />
            Boodschappenlijst bekijken
          </Link>
        ) : (
          plan.items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              icon={ShoppingCart}
              onClick={() => createShoppingListMutation.mutate()}
            >
              Boodschappenlijst maken
            </Button>
          )
        )}
      </div>

      <div className="pt-4 border-t">
        <Button
          variant="ghost"
          size="sm"
          icon={Trash2}
          className="text-danger hover:bg-danger-light"
          onClick={deletePlan}
        >
          Weekmenu verwijderen
        </Button>
      </div>
      {confirmModal}
    </div>
  );
}
