import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ShoppingCart, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Card, Loading } from "@/components/ui";
import { api } from "@/lib/api";

type MealPlanDetail = {
  id: string;
  name: string;
  servings: number;
  startDate: string;
  createdAt: string;
  items: {
    id: string;
    date: string;
    mealType: string;
    recipe: { id: string; title: string };
  }[];
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

const dayNames = ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"];

export function MealPlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: plan, isLoading } = useQuery<MealPlanDetail>({
    queryKey: ["meal-plan", id],
    queryFn: () => api(`/api/meal-plans/${id}`),
  });

  async function deletePlan() {
    if (!confirm("Weekmenu verwijderen?")) return;
    await api(`/api/meal-plans/${id}`, { method: "DELETE" });
    navigate("/meal-plans", { replace: true });
  }

  if (isLoading || !plan) return <Loading />;

  const sortedItems = [...plan.items].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const shoppingItems = plan.shoppingLists.flatMap((list) => list.items);

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
      <p className="text-sm text-gray-400 mb-6">{plan.servings} personen</p>

      <div className="flex flex-col gap-3 mb-8">
        {sortedItems.map((item) => {
          const date = new Date(item.date);
          const dayName = dayNames[date.getDay()];
          return (
            <Link key={item.id} to={`/recipe/${item.recipe.id}`}>
              <Card interactive>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-gray-400 uppercase w-6">{dayName}</span>
                  <span className="text-sm font-medium">{item.recipe.title}</span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {shoppingItems.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingCart size={20} className="text-secondary" />
            <h2 className="text-xl font-semibold">Boodschappen</h2>
          </div>
          <Card>
            {shoppingItems.map((item) => (
              <div
                key={item.id}
                className="flex justify-between py-2 border-b border-gray-50 last:border-0"
              >
                <span className="text-sm">
                  {[item.amount, item.unit, item.name]
                    .filter((v) => v && !v.startsWith("<"))
                    .join(" ")}
                </span>
              </div>
            ))}
          </Card>
        </div>
      )}

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
    </div>
  );
}
