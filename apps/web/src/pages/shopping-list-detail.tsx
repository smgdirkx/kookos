import type { IngredientCategory } from "@kookos/shared";
import { ingredientCategoryLabels } from "@kookos/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Card, Input, Loading, useConfirm } from "@/components/ui";
import { api } from "@/lib/api";

type ShoppingItem = {
  id: string;
  name: string;
  amount?: string | null;
  unit?: string | null;
  checked: boolean;
  isExtra: boolean;
  recipeId?: string | null;
  isSuggested: boolean;
  category?: string | null;
  sortOrder: number;
  recipe?: { id: string; title: string } | null;
};

type ShoppingListDetail = {
  id: string;
  name: string;
  mealPlanId: string | null;
  createdAt: string;
  updatedAt: string;
  items: ShoppingItem[];
  mealPlan?: { id: string; name: string } | null;
};

const categoryOrder: IngredientCategory[] = [
  "hoofdgroenten",
  "eiwitten",
  "basis",
  "aromaten",
  "overig",
];

type GroupedSection = { key: string; label: string; items: ShoppingItem[] };

// Aggregate items with same name+unit: sum amounts, merge checked state
function aggregateItems(items: ShoppingItem[]): ShoppingItem[] {
  const map = new Map<
    string,
    ShoppingItem & { totalAmount: number; sourceIds: string[]; anyChecked: boolean }
  >();

  for (const item of items) {
    const key = `${item.name.toLowerCase()}::${(item.unit ?? "").toLowerCase()}`;
    const existing = map.get(key);
    const parsed = Number.parseFloat(item.amount ?? "") || 0;

    if (existing) {
      existing.totalAmount += parsed;
      existing.sourceIds.push(item.id);
      if (!item.checked) existing.anyChecked = false;
      // Keep isSuggested only if all instances are suggested
      if (!item.isSuggested) existing.isSuggested = false;
    } else {
      map.set(key, {
        ...item,
        totalAmount: parsed,
        sourceIds: [item.id],
        anyChecked: item.checked,
      });
    }
  }

  return [...map.values()].map((item) => ({
    ...item,
    amount: item.totalAmount > 0 ? String(item.totalAmount) : item.amount,
    checked: item.anyChecked,
  }));
}

function groupByCategory(items: ShoppingItem[]): GroupedSection[] {
  const aggregated = aggregateItems(items);
  const groups = new Map<string, ShoppingItem[]>();

  for (const item of aggregated) {
    const cat = item.category ?? "overig";
    const existing = groups.get(cat);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(cat, [item]);
    }
  }

  const sorted: GroupedSection[] = [];
  for (const cat of categoryOrder) {
    const catItems = groups.get(cat);
    if (catItems) {
      sorted.push({
        key: cat,
        label: ingredientCategoryLabels[cat] ?? cat,
        items: catItems,
      });
      groups.delete(cat);
    }
  }

  for (const [cat, catItems] of groups) {
    sorted.push({ key: cat, label: cat, items: catItems });
  }

  return sorted;
}

function groupByRecipe(items: ShoppingItem[]): GroupedSection[] {
  const groups = new Map<string, { label: string; items: ShoppingItem[] }>();

  for (const item of items) {
    const key = item.recipe?.id ?? "_manual";
    const label = item.recipe?.title ?? "Handmatig toegevoegd";
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, { label, items: [item] });
    }
  }

  return [...groups.entries()].map(([key, { label, items: groupItems }]) => ({
    key,
    label,
    items: groupItems,
  }));
}

function ItemRow({
  item,
  onToggle,
  onUpdate,
  onDelete,
}: {
  item: ShoppingItem;
  onToggle: (checked: boolean) => void;
  onUpdate: (data: { name: string; amount?: string; unit?: string }) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState(item.amount ?? "");
  const [editUnit, setEditUnit] = useState(item.unit ?? "");
  const [editName, setEditName] = useState(item.name);
  const nameRef = useRef<HTMLInputElement>(null);

  const text = [item.amount, item.unit, item.name].filter((v) => v && !v.startsWith("<")).join(" ");

  function startEdit() {
    setEditAmount(item.amount ?? "");
    setEditUnit(item.unit ?? "");
    setEditName(item.name);
    setEditing(true);
    setTimeout(() => nameRef.current?.focus(), 0);
  }

  function saveEdit() {
    if (!editName.trim()) return;
    onUpdate({
      name: editName.trim(),
      amount: editAmount.trim() || undefined,
      unit: editUnit.trim() || undefined,
    });
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="py-2 border-b border-gray-50 last:border-0">
        <div className="flex gap-1.5">
          <input
            type="text"
            value={editAmount}
            onChange={(e) => setEditAmount(e.target.value)}
            placeholder="Hvh"
            className="w-14 px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
          />
          <input
            type="text"
            value={editUnit}
            onChange={(e) => setEditUnit(e.target.value)}
            placeholder="Eenheid"
            className="w-20 px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
          />
          <input
            ref={nameRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Naam"
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit();
              if (e.key === "Escape") cancelEdit();
            }}
            className="flex-1 min-w-0 px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
          />
        </div>
        <div className="flex gap-1.5 mt-1.5">
          <button
            type="button"
            onClick={cancelEdit}
            className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={saveEdit}
            disabled={!editName.trim()}
            className="px-2.5 py-1 text-xs font-medium text-primary hover:text-primary-dark transition-colors disabled:opacity-50"
          >
            Opslaan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2.5 py-2 border-b border-gray-50 last:border-0 ${
        item.checked ? "opacity-60" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(!item.checked)}
        className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center transition-colors ${
          item.checked
            ? "bg-success border-success text-white"
            : "border-gray-300 hover:border-primary"
        }`}
      >
        {item.checked && <Check size={12} />}
      </button>
      <div className="flex-1 min-w-0">
        <span
          className={`text-sm ${item.checked ? "line-through text-gray-400" : ""} ${
            item.isSuggested ? "italic text-gray-500" : ""
          }`}
        >
          {item.isSuggested && (
            <Lightbulb size={13} className="inline-block mr-1 text-amber-500 -mt-0.5" />
          )}
          {text}
          {item.isSuggested && <span className="text-xs text-amber-600 ml-1">(suggestie)</span>}
        </span>
        {item.recipe && !item.checked && (
          <Link
            to={`/recipe/${item.recipe.id}`}
            className="block text-xs text-gray-400 hover:text-primary transition-colors mt-0.5"
          >
            {item.recipe.title}
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={startEdit}
        className="text-gray-300 hover:text-primary transition-colors p-1 shrink-0"
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-gray-300 hover:text-danger transition-colors p-1 shrink-0"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export function ShoppingListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirm, confirmModal] = useConfirm();
  const [groupMode, setGroupMode] = useState<"category" | "recipe">("category");
  const [showChecked, setShowChecked] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemAmount, setNewItemAmount] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("");

  const { data: list, isLoading } = useQuery<ShoppingListDetail>({
    queryKey: ["shopping-list", id],
    queryFn: () => api(`/api/shopping-lists/${id}`),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ itemId, checked }: { itemId: string; checked: boolean }) =>
      api(`/api/shopping-lists/${id}/items/${itemId}`, {
        method: "PATCH",
        body: { checked },
      }),
    onMutate: async ({ itemId, checked }) => {
      await queryClient.cancelQueries({ queryKey: ["shopping-list", id] });
      const previous = queryClient.getQueryData<ShoppingListDetail>(["shopping-list", id]);
      queryClient.setQueryData<ShoppingListDetail>(["shopping-list", id], (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((i) => (i.id === itemId ? { ...i, checked } : i)),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["shopping-list", id], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-list", id] });
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({
      itemId,
      data,
    }: {
      itemId: string;
      data: { name: string; amount?: string; unit?: string };
    }) =>
      api(`/api/shopping-lists/${id}/items/${itemId}`, {
        method: "PATCH",
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-list", id] });
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: (data: { name: string; amount?: string; unit?: string }) =>
      api(`/api/shopping-lists/${id}/items`, { method: "POST", body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-list", id] });
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
      setNewItemName("");
      setNewItemAmount("");
      setNewItemUnit("");
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) =>
      api(`/api/shopping-lists/${id}/items/${itemId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-list", id] });
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
    },
  });

  async function deleteList() {
    if (!(await confirm({ title: "Boodschappenlijst verwijderen?" }))) return;
    await api(`/api/shopping-lists/${id}`, { method: "DELETE" });
    navigate("/shopping-lists", { replace: true });
  }

  function handleAddItem() {
    if (!newItemName.trim()) return;
    addItemMutation.mutate({
      name: newItemName.trim(),
      amount: newItemAmount.trim() || undefined,
      unit: newItemUnit.trim() || undefined,
    });
  }

  if (isLoading || !list) return <Loading />;

  const uncheckedItems = list.items.filter((i) => !i.checked);
  const checkedItems = list.items.filter((i) => i.checked);
  const grouped =
    groupMode === "category" ? groupByCategory(uncheckedItems) : groupByRecipe(uncheckedItems);

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate("/shopping-lists")}
        className="inline-flex items-center gap-1.5 text-primary text-sm mb-4 hover:underline"
      >
        <ArrowLeft size={16} />
        Boodschappen
      </button>

      <h1 className="text-2xl font-bold mb-1">{list.name}</h1>
      {list.mealPlan && (
        <Link
          to={`/meal-plans/${list.mealPlan.id}`}
          className="text-sm text-gray-400 hover:text-primary transition-colors"
        >
          Weekmenu: {list.mealPlan.name}
        </Link>
      )}

      {list.items.length > 0 && (
        <div className="flex gap-1.5 mt-4 mb-2">
          <button
            type="button"
            onClick={() => setGroupMode("category")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              groupMode === "category"
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Per categorie
          </button>
          <button
            type="button"
            onClick={() => setGroupMode("recipe")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              groupMode === "recipe"
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Per recept
          </button>
        </div>
      )}

      <div className="mt-2">
        {uncheckedItems.length === 0 && checkedItems.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            Nog geen items. Voeg hieronder je eerste item toe.
          </p>
        ) : (
          <>
            {grouped.map((group) => (
              <div key={group.key} className="mb-4">
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                  {group.label}
                </h3>
                <Card>
                  {group.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onToggle={(checked) => toggleMutation.mutate({ itemId: item.id, checked })}
                      onUpdate={(data) => updateItemMutation.mutate({ itemId: item.id, data })}
                      onDelete={() => deleteItemMutation.mutate(item.id)}
                    />
                  ))}
                </Card>
              </div>
            ))}

            {checkedItems.length > 0 && (
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => setShowChecked(!showChecked)}
                  className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-2"
                >
                  {showChecked ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  Afgevinkt ({checkedItems.length})
                </button>
                {showChecked && (
                  <Card>
                    {checkedItems.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        onToggle={(checked) => toggleMutation.mutate({ itemId: item.id, checked })}
                        onUpdate={(data) => updateItemMutation.mutate({ itemId: item.id, data })}
                        onDelete={() => deleteItemMutation.mutate(item.id)}
                      />
                    ))}
                  </Card>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {showAddItem ? (
        <Card className="mb-6">
          <h3 className="text-sm font-semibold mb-3">Item toevoegen</h3>
          <div className="flex gap-2 mb-3">
            <Input
              placeholder="Hoeveelheid"
              value={newItemAmount}
              onChange={(e) => setNewItemAmount(e.target.value)}
              className="w-20"
            />
            <Input
              placeholder="Eenheid"
              value={newItemUnit}
              onChange={(e) => setNewItemUnit(e.target.value)}
              className="w-24"
            />
            <Input
              placeholder="Naam"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
              ref={(el) => {
                if (el && !newItemName) el.focus();
              }}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAddItem(false);
                setNewItemName("");
                setNewItemAmount("");
                setNewItemUnit("");
              }}
            >
              Annuleren
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddItem}
              disabled={!newItemName.trim() || addItemMutation.isPending}
            >
              Toevoegen
            </Button>
          </div>
        </Card>
      ) : (
        <Button
          variant="outline"
          size="sm"
          icon={Plus}
          onClick={() => setShowAddItem(true)}
          className="mb-6"
        >
          Item toevoegen
        </Button>
      )}

      <div className="pt-4 border-t">
        <Button
          variant="ghost"
          size="sm"
          icon={Trash2}
          className="text-danger hover:bg-danger-light"
          onClick={deleteList}
        >
          Lijst verwijderen
        </Button>
      </div>
      {confirmModal}
    </div>
  );
}
