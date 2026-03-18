import { CalendarDays, ShoppingCart, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button, Card, Input, Loading, PageHeader, Textarea } from "@/components/ui";
import { api } from "@/lib/api";

type MealPlanDay = {
  day: number;
  meals: {
    lunch?: { title: string; isExisting: boolean };
    dinner?: { title: string; isExisting: boolean };
  };
};

type ShoppingItem = {
  name: string;
  amount: string;
  unit: string;
  reason?: string;
};

type MealPlanResult = {
  mealPlan: MealPlanDay[];
  shoppingList: ShoppingItem[];
};

export function MealPlanPage() {
  const [ingredients, setIngredients] = useState("");
  const [people, setPeople] = useState("2");
  const [days, setDays] = useState("7");
  const [result, setResult] = useState<MealPlanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generatePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!ingredients.trim()) return;
    setLoading(true);
    setError("");

    try {
      const data = await api<MealPlanResult>("/api/ai/meal-plan", {
        method: "POST",
        body: {
          availableIngredients: ingredients
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          numberOfPeople: parseInt(people, 10) || 2,
          numberOfDays: parseInt(days, 10) || 7,
        },
      });
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    }
    setLoading(false);
  }

  const dayNames = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

  return (
    <div>
      <PageHeader title="Weekmenu" />

      <form onSubmit={generatePlan} className="space-y-4">
        <Textarea
          label="Welke ingrediënten heb je?"
          placeholder="bijv. broccoli, witte kool, knoflook, aardappels"
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          rows={3}
        />

        <div className="flex gap-4">
          <Input
            type="number"
            label="Personen"
            min={1}
            value={people}
            onChange={(e) => setPeople(e.target.value)}
          />
          <Input
            type="number"
            label="Dagen"
            min={1}
            max={14}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </div>

        <Button
          type="submit"
          variant="cta"
          size="lg"
          fullWidth
          icon={Sparkles}
          disabled={loading || !ingredients.trim()}
        >
          {loading ? "Bezig met plannen..." : "Genereer weekmenu"}
        </Button>
      </form>

      {error && <p className="text-danger text-sm mt-4">{error}</p>}

      {loading && <Loading message="AI genereert je weekmenu..." />}

      {result?.mealPlan && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays size={20} className="text-primary" />
            <h2 className="text-xl font-semibold">Weekmenu</h2>
          </div>
          <div className="space-y-3">
            {result.mealPlan.map((day) => (
              <Card key={day.day}>
                <h3 className="font-semibold text-primary mb-2">
                  {dayNames[(day.day - 1) % 7] ?? `Dag ${day.day}`}
                </h3>
                {day.meals.lunch && (
                  <p className="text-sm">
                    <span className="text-gray-400">Lunch:</span> {day.meals.lunch.title}
                  </p>
                )}
                {day.meals.dinner && (
                  <p className="text-sm">
                    <span className="text-gray-400">Diner:</span> {day.meals.dinner.title}
                  </p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {result?.shoppingList && result.shoppingList.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingCart size={20} className="text-secondary" />
            <h2 className="text-xl font-semibold">Extra boodschappen</h2>
          </div>
          <Card>
            {result.shoppingList.map((item, i) => (
              <div
                key={i}
                className="flex justify-between py-2 border-b border-gray-50 last:border-0"
              >
                <span className="text-sm">
                  {item.amount} {item.unit} {item.name}
                </span>
                {item.reason && <span className="text-gray-400 text-xs">{item.reason}</span>}
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
