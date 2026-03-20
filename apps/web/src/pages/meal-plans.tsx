import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, EmptyState, LinkButton, Loading, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";

type MealPlanItem = {
  id: string;
  date: string;
  checked: boolean;
  recipe: { id: string; title: string };
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

function CheckableItem({ item, onCheck }: { item: MealPlanItem; onCheck: () => void }) {
  const [checked, setChecked] = useState(false);
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    if (!checked) return;
    const t1 = setTimeout(() => setHiding(true), 400);
    const t2 = setTimeout(() => onCheck(), 800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [checked, onCheck]);

  const d = new Date(item.date);

  return (
    <div
      className={`flex items-center gap-2.5 py-1.5 px-1 -mx-1 rounded-lg transition-all duration-400 ${
        hiding ? "opacity-0 max-h-0 py-0 overflow-hidden" : "opacity-100 max-h-12"
      } ${checked ? "text-gray-300" : ""}`}
    >
      <button
        type="button"
        onClick={() => setChecked(true)}
        disabled={checked}
        className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center transition-colors ${
          checked ? "bg-success border-success text-white" : "border-gray-300 hover:border-primary"
        }`}
      >
        {checked && <Check size={12} />}
      </button>
      <span className="text-xs font-medium text-gray-400 uppercase w-5">
        {dayNames[d.getDay()]}
      </span>
      <span className={`text-sm ${checked ? "line-through text-gray-300" : ""}`}>
        {item.recipe.title}
      </span>
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

                {unchecked.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    {unchecked.map((item) => (
                      <CheckableItem
                        key={item.id}
                        item={item}
                        onCheck={() =>
                          toggleMutation.mutate({
                            planId: plan.id,
                            itemId: item.id,
                            checked: true,
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
