import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShoppingCart, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, EmptyState, Input, Loading, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";

type ShoppingListSummary = {
  id: string;
  name: string;
  mealPlanId: string | null;
  mealPlanName: string | null;
  itemCount: number;
  checkedCount: number;
  createdAt: string;
  updatedAt: string;
};

type MealPlanOption = {
  id: string;
  name: string;
};

type ModalStep = "choose" | "manual" | "meal-plan";

function NewListModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; mealPlanId?: string }) => void;
}) {
  const [step, setStep] = useState<ModalStep>("choose");
  const [name, setName] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");

  const { data: mealPlans = [] } = useQuery<MealPlanOption[]>({
    queryKey: ["meal-plans-options"],
    queryFn: async () => {
      const plans = await api<{ id: string; name: string }[]>("/api/meal-plans");
      return plans.map((p) => ({ id: p.id, name: p.name }));
    },
    enabled: open && step === "meal-plan",
  });

  function reset() {
    setStep("choose");
    setName("");
    setSelectedPlanId("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit() {
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      mealPlanId: step === "meal-plan" && selectedPlanId ? selectedPlanId : undefined,
    });
    reset();
  }

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <button
        type="button"
        className="fixed inset-0 bg-black/40 animate-fade-in cursor-default"
        onClick={handleClose}
        aria-label="Sluiten"
        tabIndex={-1}
      />
      <div className="relative bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm animate-scale-in">
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X size={18} />
        </button>

        {step === "choose" && (
          <>
            <h2 className="text-lg font-semibold mb-4">Nieuwe boodschappenlijst</h2>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setStep("manual")}
                className="w-full flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-primary hover:bg-primary/5 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Plus size={20} className="text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Lege lijst</p>
                  <p className="text-xs text-gray-400">Begin met een lege boodschappenlijst</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setStep("meal-plan")}
                className="w-full flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-primary hover:bg-primary/5 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center shrink-0">
                  <ShoppingCart size={20} className="text-secondary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Vanuit weekmenu</p>
                  <p className="text-xs text-gray-400">Ingrediënten uit een weekmenu importeren</p>
                </div>
              </button>
            </div>
          </>
        )}

        {step === "manual" && (
          <>
            <h2 className="text-lg font-semibold mb-4">Nieuwe lijst</h2>
            <Input
              label="Naam"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bijv. Boodschappen deze week"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              ref={(el) => el?.focus()}
            />
            <div className="flex gap-2 mt-4">
              <Button variant="ghost" onClick={() => setStep("choose")} className="flex-1">
                Terug
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                className="flex-1"
                disabled={!name.trim()}
              >
                Aanmaken
              </Button>
            </div>
          </>
        )}

        {step === "meal-plan" && (
          <>
            <h2 className="text-lg font-semibold mb-4">Weekmenu kiezen</h2>
            {mealPlans.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Geen weekmenu's beschikbaar</p>
            ) : (
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto mb-3">
                {mealPlans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => {
                      setSelectedPlanId(plan.id);
                      setName(`Boodschappen - ${plan.name}`);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      selectedPlanId === plan.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    {plan.name}
                  </button>
                ))}
              </div>
            )}
            {selectedPlanId && (
              <Input
                label="Naam"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Naam van de lijst"
              />
            )}
            <div className="flex gap-2 mt-4">
              <Button variant="ghost" onClick={() => setStep("choose")} className="flex-1">
                Terug
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                className="flex-1"
                disabled={!selectedPlanId || !name.trim()}
              >
                Aanmaken
              </Button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function ShoppingListsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);

  const { data: lists, isLoading } = useQuery<ShoppingListSummary[]>({
    queryKey: ["shopping-lists"],
    queryFn: () => api("/api/shopping-lists"),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; mealPlanId?: string }) =>
      api<{ id: string }>("/api/shopping-lists", { method: "POST", body: data }),
    onSuccess: (newList) => {
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
      setShowModal(false);
      navigate(`/shopping-lists/${newList.id}`);
    },
  });

  if (isLoading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Boodschappen"
        action={
          <Button variant="cta" size="sm" icon={Plus} onClick={() => setShowModal(true)}>
            Nieuw
          </Button>
        }
      />

      {!lists?.length ? (
        <EmptyState
          icon={ShoppingCart}
          title="Nog geen boodschappenlijsten"
          description="Maak je eerste boodschappenlijst aan!"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {lists.map((list) => (
            <Link key={list.id} to={`/shopping-lists/${list.id}`}>
              <Card interactive>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-sm">{list.name}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {list.checkedCount}/{list.itemCount} afgevinkt
                      {list.mealPlanName && (
                        <span className="ml-2">· Weekmenu: {list.mealPlanName}</span>
                      )}
                    </p>
                  </div>
                  <div className="text-xs text-gray-300">
                    {new Date(list.createdAt).toLocaleDateString("nl-NL", {
                      day: "numeric",
                      month: "short",
                    })}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <NewListModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreate={(data) => createMutation.mutate(data)}
      />
    </div>
  );
}
