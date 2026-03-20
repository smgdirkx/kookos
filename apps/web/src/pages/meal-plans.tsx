import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, Check, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, EmptyState, LinkButton, Loading, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";

type RecipeImage = { id: string; url: string; caption?: string | null };

type MealPlanItem = {
  id: string;
  date: string;
  checked: boolean;
  recipe: {
    id: string;
    title: string;
    importantNote?: string;
    images?: RecipeImage[];
    comments?: { id: string; content: string; isImportant: boolean }[];
  };
};

type MealPlan = {
  id: string;
  name: string;
  servings: number;
  startDate: string;
  endDate: string;
  createdAt: string;
  items: MealPlanItem[];
};

const dayNames = ["zo", "ma", "di", "wo", "do", "vr", "za"];

function CheckableItem({
  item,
  onToggle,
}: {
  item: MealPlanItem;
  onToggle: (checked: boolean) => void;
}) {
  const d = new Date(item.date);
  const imgs = item.recipe.images ?? [];
  const displayImage = imgs.find((img) => img.caption !== "scan-original") ?? imgs[0];

  return (
    <div
      className={`flex items-center gap-2.5 py-1.5 px-1 -mx-1 rounded-lg transition-colors ${item.checked ? "opacity-60" : ""}`}
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
      <span className="text-xs font-medium text-gray-400 uppercase w-5">
        {dayNames[d.getDay()]}
      </span>
      {displayImage && (
        <img src={displayImage.url} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <Link
          to={`/recipe/${item.recipe.id}`}
          className={`text-sm hover:underline ${item.checked ? "line-through text-gray-400" : ""}`}
        >
          {item.recipe.title}
        </Link>
        {!item.checked &&
          (() => {
            const notes = [
              ...(item.recipe.importantNote
                ? [{ id: "legacy", content: item.recipe.importantNote }]
                : []),
              ...(item.recipe.comments?.filter((c) => c.isImportant) ?? []),
            ];
            if (!notes.length) return null;
            return (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {notes.map((n) => (
                  <span
                    key={n.id}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5"
                  >
                    <AlertTriangle size={10} />
                    <span className="line-clamp-1">{n.content}</span>
                  </span>
                ))}
              </div>
            );
          })()}
      </div>
    </div>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
  });
}

export function MealPlansPage() {
  const queryClient = useQueryClient();

  const { data: plans, isLoading } = useQuery<MealPlan[]>({
    queryKey: ["meal-plans"],
    queryFn: () => api("/api/meal-plans"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({
      planId,
      itemId,
      checked,
    }: {
      planId: string;
      itemId: string;
      checked: boolean;
    }) =>
      api(`/api/meal-plans/${planId}/items/${itemId}`, {
        method: "PATCH",
        body: { checked },
      }),
    onMutate: async ({ planId, itemId, checked }) => {
      await queryClient.cancelQueries({ queryKey: ["meal-plans"] });
      const previous = queryClient.getQueryData<MealPlan[]>(["meal-plans"]);
      queryClient.setQueryData<MealPlan[]>(["meal-plans"], (old) =>
        old?.map((p) =>
          p.id === planId
            ? { ...p, items: p.items.map((i) => (i.id === itemId ? { ...i, checked } : i)) }
            : p,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["meal-plans"], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
    },
  });

  if (isLoading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Weekmenu's"
        action={
          <LinkButton to="/meal-plan/new" variant="cta" size="sm" icon={Plus}>
            Nieuw
          </LinkButton>
        }
      />

      {!plans?.length ? (
        <EmptyState
          icon={CalendarDays}
          title="Nog geen weekmenu's"
          description="Maak je eerste weekmenu aan!"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {plans.map((plan) => {
            const sortedItems = [...plan.items].sort(
              (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
            );
            const unchecked = sortedItems.filter((i) => !i.checked);
            const allDone = sortedItems.length > 0 && unchecked.length === 0;

            return (
              <Card key={plan.id}>
                <Link to={`/meal-plans/${plan.id}`}>
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold">{plan.name}</h2>
                    {allDone && (
                      <span className="text-xs text-success font-medium flex items-center gap-1">
                        <Check size={14} />
                        Klaar
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400 mt-1">
                    {formatDate(plan.startDate)} – {formatDate(plan.endDate)} · {plan.servings}{" "}
                    personen
                  </p>
                </Link>

                {sortedItems.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    {sortedItems.map((item) => (
                      <CheckableItem
                        key={item.id}
                        item={item}
                        onToggle={(checked) =>
                          toggleMutation.mutate({
                            planId: plan.id,
                            itemId: item.id,
                            checked,
                          })
                        }
                      />
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
