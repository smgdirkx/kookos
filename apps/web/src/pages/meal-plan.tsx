import { Clock, Save, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  Input,
  Loading,
  PageHeader,
  RecipePlaceholder,
  Textarea,
} from "@/components/ui";
import { api } from "@/lib/api";
import { generateMealPlanName } from "@/lib/date";

type RecipeOption = {
  recipeId: string;
  title: string;
  imageUrl?: string;
  totalTimeMinutes?: number;
  difficulty?: string;
};

type MealPlanDay = {
  day: number;
  ingredient?: string;
  options: RecipeOption[];
};

type MealPlanResult = {
  mealPlan: MealPlanDay[];
};

type Selections = Record<number, number>;

const STORAGE_KEY = "kookos-draft-meal-plan";

function loadDraft(): {
  result: MealPlanResult;
  selections: Selections;
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

function saveDraft(
  result: MealPlanResult,
  selections: Selections,
  ingredients: string,
  people: string,
  days: string,
) {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ result, selections, ingredients, people, days }),
  );
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
  const [selections, setSelections] = useState<Selections>(draft?.selections ?? {});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function createManualPlan() {
    setSaving(true);
    setError("");

    try {
      const saved = await api<{ id: string }>("/api/meal-plans", {
        method: "POST",
        body: {
          name: generateMealPlanName(),
          servings: parseInt(people, 10) || 2,
          items: [],
        },
      });

      navigate(`/meal-plans/${saved.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Aanmaken mislukt");
    }
    setSaving(false);
  }

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
      const defaultSelections: Selections = {};
      for (const day of data.mealPlan) {
        defaultSelections[day.day] = 0;
      }
      setResult(data);
      setSelections(defaultSelections);
      saveDraft(data, defaultSelections, ingredients, people, days);
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
      const saved = await api<{ id: string }>("/api/meal-plans", {
        method: "POST",
        body: {
          name: generateMealPlanName(),
          servings: parseInt(people, 10) || 2,
          items: result.mealPlan
            .filter((day) => (selections[day.day] ?? 0) >= 0)
            .map((day) => ({
              recipeId: day.options[selections[day.day] ?? 0].recipeId,
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

        <button
          type="button"
          onClick={createManualPlan}
          disabled={saving}
          className="block mx-auto text-sm text-gray-500 underline hover:text-gray-700"
        >
          {saving ? "Aanmaken..." : "Handmatig aanmaken"}
        </button>
      </form>

      {error && <p className="text-danger text-sm mt-4">{error}</p>}

      {loading && <Loading message="AI genereert je weekmenu..." />}

      {result?.mealPlan && (
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h2 className="text-xl font-semibold mb-4">Je weekmenu</h2>
          <div className="flex flex-col gap-3">
            {result.mealPlan.map((day) => {
              const selected = selections[day.day] ?? 0;
              const SKIP = -1;

              function radioButton(isSelected: boolean) {
                return (
                  <span
                    className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                      isSelected ? "border-primary" : "border-gray-300"
                    }`}
                  >
                    {isSelected && <span className="w-2 h-2 rounded-full bg-primary" />}
                  </span>
                );
              }

              function select(idx: number) {
                const next = { ...selections, [day.day]: idx };
                setSelections(next);
                saveDraft(result!, next, ingredients, people, days);
              }

              return (
                <Card key={day.day}>
                  <p className="text-xs font-medium text-gray-400 uppercase mb-2">
                    Dag {day.day}
                    {day.ingredient ? ` — ${day.ingredient}` : ""}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {day.options.map((option, idx) => (
                      <button
                        key={option.recipeId}
                        type="button"
                        onClick={() => select(idx)}
                        className={`flex items-center gap-2.5 text-left rounded-lg px-2.5 py-2 transition-colors ${
                          idx === selected
                            ? "bg-primary/10 ring-1 ring-primary/30"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        {radioButton(idx === selected)}
                        {option.imageUrl ? (
                          <img
                            src={option.imageUrl}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover shrink-0"
                          />
                        ) : (
                          <RecipePlaceholder
                            className="w-10 h-10 rounded-lg shrink-0"
                            variant="hero"
                          />
                        )}
                        <div className="min-w-0">
                          <Link
                            to={`/recipe/${option.recipeId}`}
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            className="text-sm font-medium hover:underline"
                          >
                            {option.title}
                          </Link>
                          {(option.totalTimeMinutes || option.difficulty) && (
                            <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5">
                              {option.totalTimeMinutes && (
                                <span className="inline-flex items-center gap-0.5">
                                  <Clock size={10} />
                                  {option.totalTimeMinutes} min
                                </span>
                              )}
                              {option.totalTimeMinutes && option.difficulty && <span>·</span>}
                              {option.difficulty && <span>{option.difficulty}</span>}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => select(SKIP)}
                      className={`flex items-center gap-2.5 text-left rounded-lg px-2.5 py-2 transition-colors ${
                        selected === SKIP
                          ? "bg-primary/10 ring-1 ring-primary/30"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      {radioButton(selected === SKIP)}
                      <span className="text-sm text-gray-400 italic">
                        Ik kies zelf iets in de volgende stap
                      </span>
                    </button>
                  </div>
                </Card>
              );
            })}
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
