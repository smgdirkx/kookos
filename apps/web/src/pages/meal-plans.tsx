import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, EmptyState, LinkButton, Loading, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";

type MealPlan = {
  id: string;
  name: string;
  servings: number;
  startDate: string;
  endDate: string;
  createdAt: string;
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
  });
}

export function MealPlansPage() {
  const { data: plans, isLoading } = useQuery<MealPlan[]>({
    queryKey: ["meal-plans"],
    queryFn: () => api("/api/meal-plans"),
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
          {plans.map((plan) => (
            <Link key={plan.id} to={`/meal-plans/${plan.id}`}>
              <Card interactive>
                <h2 className="font-semibold">{plan.name}</h2>
                <p className="text-sm text-gray-400 mt-1">
                  {formatDate(plan.startDate)} – {formatDate(plan.endDate)} · {plan.servings}{" "}
                  personen
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
