import {
  type DifficultyLevel,
  difficultyLabels,
  difficultyLevels,
  type MaxTimeOption,
  maxTimeLabels,
  maxTimeOptions,
} from "@kookos/shared";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Clock, Save, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
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

const MIN_RECIPES = 10;

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
  warnings?: string[];
};

type Selections = Record<number, number>;

const STORAGE_KEY = "kookos-draft-meal-plan";
const FORM_KEY = "kookos-meal-plan-form";

type Preferences = {
  maxTime: MaxTimeOption;
  difficulty: DifficultyLevel | "";
  varietyCuisine: boolean;
  seasonal: boolean;
  freeText: string;
};

const defaultPreferences: Preferences = {
  maxTime: 0,
  difficulty: "",
  varietyCuisine: true,
  seasonal: false,
  freeText: "",
};

function loadDraft(): {
  result: MealPlanResult;
  selections: Selections;
  ingredients: string;
  people: string;
  days: string;
  preferences?: Preferences;
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
  preferences: Preferences,
) {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ result, selections, ingredients, people, days, preferences }),
  );
}

function clearDraft() {
  sessionStorage.removeItem(STORAGE_KEY);
}

type FormState = {
  ingredients: string;
  people: string;
  days: string;
  preferences: Preferences;
};

function loadFormState(): FormState | null {
  try {
    const raw = sessionStorage.getItem(FORM_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveFormState(state: FormState) {
  sessionStorage.setItem(FORM_KEY, JSON.stringify(state));
}

export function MealPlanPage() {
  const navigate = useNavigate();
  const draft = loadDraft();
  const savedForm = loadFormState();

  const { data: recipeCount, isLoading: countLoading } = useQuery<{ id: string }[]>({
    queryKey: ["recipes"],
    queryFn: () => api("/api/recipes"),
    select: (data) => data,
  });

  const hasEnoughRecipes = (recipeCount?.length ?? 0) >= MIN_RECIPES;

  // Form state: draft (post-generate) takes priority, then saved form state, then defaults
  const [ingredients, setIngredients] = useState(
    draft?.ingredients ?? savedForm?.ingredients ?? "",
  );
  const [people, setPeople] = useState(draft?.people ?? savedForm?.people ?? "2");
  const [days, setDays] = useState(draft?.days ?? savedForm?.days ?? "5");
  const [prefs, setPrefs] = useState<Preferences>(
    draft?.preferences ?? savedForm?.preferences ?? defaultPreferences,
  );
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [result, setResult] = useState<MealPlanResult | null>(draft?.result ?? null);
  const [selections, setSelections] = useState<Selections>(draft?.selections ?? {});
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkWarnings, setCheckWarnings] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Persist form inputs so they survive navigation
  useEffect(() => {
    saveFormState({ ingredients, people, days, preferences: prefs });
  }, [ingredients, people, days, prefs]);

  function cancelDraft() {
    clearDraft();
    sessionStorage.removeItem(FORM_KEY);
    navigate("/meal-plans");
  }

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

  function buildRequestBody() {
    return {
      availableIngredients: ingredients
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      numberOfPeople: parseInt(people, 10) || 2,
      numberOfDays: parseInt(days, 10) || 5,
      ...(prefs.maxTime > 0 && { maxTimeMinutes: prefs.maxTime }),
      ...(prefs.difficulty && { difficulty: prefs.difficulty }),
      varietyCuisine: prefs.varietyCuisine,
      seasonal: prefs.seasonal,
      ...(prefs.freeText.trim() && { preferences: prefs.freeText.trim() }),
    };
  }

  async function checkAndGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!ingredients.trim()) return;
    setError("");
    setResult(null);
    setCheckWarnings(null);
    setChecking(true);

    try {
      const check = await api<{ warnings: string[] }>("/api/ai/meal-plan/check", {
        method: "POST",
        body: buildRequestBody(),
      });

      if (check.warnings.length > 0) {
        setCheckWarnings(check.warnings);
        setChecking(false);
        return;
      }

      await doGenerate();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
      setChecking(false);
    }
  }

  async function doGenerate() {
    setCheckWarnings(null);
    setChecking(false);
    setLoading(true);
    setError("");

    try {
      const data = await api<MealPlanResult>("/api/ai/meal-plan", {
        method: "POST",
        body: buildRequestBody(),
      });
      const defaultSelections: Selections = {};
      for (const day of data.mealPlan) {
        defaultSelections[day.day] = 0;
      }
      setResult(data);
      setSelections(defaultSelections);
      saveDraft(data, defaultSelections, ingredients, people, days, prefs);
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
      sessionStorage.removeItem(FORM_KEY);
      navigate(`/meal-plans/${saved.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
    }
    setSaving(false);
  }

  if (countLoading) {
    return (
      <div>
        <PageHeader title="Nieuw menu" back={cancelDraft} />
        <Loading message="Laden..." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Nieuw menu" back={cancelDraft} />

      {!hasEnoughRecipes && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p>
                Je hebt pas {recipeCount?.length ?? 0} recepten. Het resultaat zal beperkt zijn.{" "}
                <Link to="/add-recipe" className="underline font-medium hover:text-amber-900">
                  Voeg meer recepten toe
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={checkAndGenerate} className="space-y-4">
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

        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setPrefsOpen(!prefsOpen)}
            className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Voorkeuren
            <ChevronDown
              size={16}
              className={`text-gray-400 transition-transform ${prefsOpen ? "rotate-180" : ""}`}
            />
          </button>

          {prefsOpen && (
            <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
              <div className="flex gap-4 pt-3">
                <div className="w-full">
                  <label htmlFor="max-time" className="block text-sm font-medium mb-1">
                    Bereidingstijd
                  </label>
                  <select
                    id="max-time"
                    value={prefs.maxTime}
                    onChange={(e) =>
                      setPrefs({ ...prefs, maxTime: Number(e.target.value) as MaxTimeOption })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
                  >
                    {maxTimeOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {maxTimeLabels[opt]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-full">
                  <label htmlFor="difficulty" className="block text-sm font-medium mb-1">
                    Moeilijkheid
                  </label>
                  <select
                    id="difficulty"
                    value={prefs.difficulty}
                    onChange={(e) =>
                      setPrefs({ ...prefs, difficulty: e.target.value as DifficultyLevel | "" })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
                  >
                    <option value="">Geen voorkeur</option>
                    {difficultyLevels.map((level) => (
                      <option key={level} value={level}>
                        {difficultyLabels[level]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prefs.varietyCuisine}
                    onChange={(e) => setPrefs({ ...prefs, varietyCuisine: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm">Variatie in keuken</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prefs.seasonal}
                    onChange={(e) => setPrefs({ ...prefs, seasonal: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm">Seizoensgebonden</span>
                </label>
              </div>

              <Textarea
                label="Extra wensen"
                placeholder="bijv. geen pasta deze week, graag een keer stamppot, liefst lichte maaltijden"
                value={prefs.freeText}
                onChange={(e) => setPrefs({ ...prefs, freeText: e.target.value })}
                rows={2}
              />
            </div>
          )}
        </div>

        <Button
          type="submit"
          variant="cta"
          size="lg"
          fullWidth
          icon={Sparkles}
          disabled={loading || checking || !ingredients.trim()}
        >
          {checking ? "Controleren..." : loading ? "Bezig met plannen..." : "Genereer weekmenu"}
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

      {checkWarnings && checkWarnings.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <ul className="text-sm text-amber-800 space-y-1">
              {checkWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="cta" size="sm" icon={Sparkles} onClick={doGenerate} fullWidth>
              Toch doorgaan
            </Button>
            <Link
              to="/add-recipe"
              className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Recepten toevoegen
            </Link>
          </div>
        </div>
      )}

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
                saveDraft(result!, next, ingredients, people, days, prefs);
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
