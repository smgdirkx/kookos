import { Save, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, Input, Loading, PageHeader, Textarea } from "@/components/ui";
import { api } from "@/lib/api";

type MealPlanDay = {
  day: number;
  meals: {
    dinner: { recipeId: string; title: string };
  };
};

type MealPlanResult = {
  mealPlan: MealPlanDay[];
};

const STORAGE_KEY = "kookos-draft-meal-plan";

function loadDraft(): {
  result: MealPlanResult;
  ingredients: string;
  people: string;
  days: string;
} | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveDraft(result: MealPlanResult, ingredients: string, people: string, days: string) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ result, ingredients, people, days }));
}

function clearDraft() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function MealPlanPage() {
  const navigate = useNavigate();
  const draft = loadDraft();

  const [ingredients, setIngredients] = useState(draft?.ingredients ?? "");
  const [people, setPeople] = useState(draft?.people ?? "2");
  const [days, setDays] = useState(draft?.days ?? "5");
  const [result, setResult] = useState<MealPlanResult | null>(draft?.result ?? null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function generatePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!ingredients.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await api<MealPlanResult>("/api/ai/meal-plan", {
        method: "POST",
        body: {
          availableIngredients: ingredients
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          numberOfPeople: parseInt(people, 10) || 2,
          numberOfDays: parseInt(days, 10) || 5,
        },
      });
      setResult(data);
      saveDraft(data, ingredients, people, days);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    }
    setLoading(false);
  }

  async function savePlan() {
    if (!result) return;
    setSaving(true);
    setError("");

    try {
      const today = new Date();
      const name = `Weekmenu ${today.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}`;

      const saved = await api<{ id: string }>("/api/meal-plans", {
        method: "POST",
        body: {
          name,
          servings: parseInt(people, 10) || 2,
          items: result.mealPlan.map((day) => ({
            recipeId: day.meals.dinner.recipeId,
            day: day.day,
          })),
        },
      });

      clearDraft();
      navigate(`/meal-plans/${saved.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
    }
    setSaving(false);
  }

  const dayNames = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

  return (
    <div>
      <PageHeader title="Nieuw menu" />

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
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h2 className="text-xl font-semibold mb-4">Je weekmenu</h2>
          <div className="flex flex-col gap-3">
            {result.mealPlan.map((day) => (
              <Link key={day.day} to={`/recipe/${day.meals.dinner.recipeId}`}>
                <Card interactive>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-gray-400 uppercase w-6">
                      {dayNames[(day.day - 1) % 7] ?? `${day.day}`}
                    </span>
                    <span className="text-sm font-medium">{day.meals.dinner.title}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          <Button
            variant="cta"
            size="lg"
            fullWidth
            icon={Save}
            className="mt-6"
            disabled={saving}
            onClick={savePlan}
          >
            {saving ? "Opslaan..." : "Opslaan"}
          </Button>
        </div>
      )}
    </div>
  );
}
