import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Check,
  ChevronRight,
  ClipboardPaste,
  Globe,
  ImagePlus,
  Leaf,
  Link as LinkIcon,
  Loader2,
  PenLine,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TagInput } from "@/components/tag-input";
import { Button, Input, Loading, PageHeader, Textarea, useConfirm } from "@/components/ui";
import { api } from "@/lib/api";
import { compressImage } from "@/lib/image";

type Step = "choose" | "scan" | "import" | "paste";

type CompressedImage = { base64: string; mediaType: string };

type BackgroundTask = {
  id: number;
  status: "processing" | "done" | "error";
  recipeId?: string;
  error?: string;
};

let taskIdCounter = 0;

export function AddRecipePage() {
  const [step, setStep] = useState<Step>("choose");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [url, setUrl] = useState("");
  const [pasteText, setPasteText] = useState("");

  // Scan state
  const [recipePhoto, setRecipePhoto] = useState<CompressedImage | null>(null);
  const [dishPhoto, setDishPhoto] = useState<CompressedImage | null>(null);
  const [scanTags, setScanTags] = useState<string[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTask[]>([]);

  const recipeInputRef = useRef<HTMLInputElement>(null);
  const dishInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirm, confirmModal] = useConfirm();

  function updateTask(id: number, update: Partial<BackgroundTask>) {
    setBackgroundTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...update } : t)));
  }

  async function submitScan(photo: CompressedImage, dish: CompressedImage | null, tags: string[]) {
    const saved = await api<{ id: string }>("/api/ai/scan", {
      method: "POST",
      body: {
        image: photo.base64,
        mediaType: photo.mediaType,
        ...(dish ? { dishImage: dish.base64, dishMediaType: dish.mediaType } : {}),
        ...(tags.length ? { extraTags: tags } : {}),
      },
    });
    queryClient.invalidateQueries({ queryKey: ["recipes"] });
    return saved;
  }

  async function confirmNoDishPhoto(): Promise<boolean> {
    if (dishPhoto) return true;
    return confirm({
      title: "Geen foto van het gerecht",
      description: "Weet je zeker dat je door wilt zonder foto van het gerecht?",
      confirmLabel: "Doorgaan",
      variant: "primary",
    });
  }

  async function handleGenerate() {
    if (!recipePhoto) return;
    if (!(await confirmNoDishPhoto())) return;
    setLoading(true);
    setStatus("AI analyseert je foto...");

    try {
      const saved = await submitScan(recipePhoto, dishPhoto, scanTags);
      navigate(`/recipe/${saved.id}`, { replace: true });
    } catch (err: unknown) {
      setStatus(`Fout: ${err instanceof Error ? err.message : "Onbekende fout"}`);
      setLoading(false);
    }
  }

  async function handleGenerateAndNext() {
    if (!recipePhoto) return;
    if (!(await confirmNoDishPhoto())) return;
    const taskId = ++taskIdCounter;
    const photo = recipePhoto;
    const dish = dishPhoto;
    const tags = [...scanTags];

    setBackgroundTasks((prev) => [...prev, { id: taskId, status: "processing" }]);

    // Reset photos for next scan (tags blijven staan)
    setRecipePhoto(null);
    setDishPhoto(null);

    // Process in background
    submitScan(photo, dish, tags)
      .then((saved) => updateTask(taskId, { status: "done", recipeId: saved.id }))
      .catch((err: unknown) =>
        updateTask(taskId, {
          status: "error",
          error: err instanceof Error ? err.message : "Onbekende fout",
        }),
      );
  }

  async function handlePhotoSelect(file: File, type: "recipe" | "dish") {
    setCompressing(true);
    try {
      const compressed = await compressImage(file);
      if (type === "recipe") {
        setRecipePhoto(compressed);
      } else {
        setDishPhoto(compressed);
      }
    } catch (err: unknown) {
      setStatus(
        `Fout bij verwerken foto: ${err instanceof Error ? err.message : "Onbekende fout"}`,
      );
    } finally {
      setCompressing(false);
    }
  }

  function openFilePicker(ref: React.RefObject<HTMLInputElement | null>) {
    if (!ref.current) return;
    ref.current.value = "";
    ref.current.click();
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setStatus("Recept importeren van website...");

    try {
      const saved = await api<{ id: string }>("/api/ai/import", {
        method: "POST",
        body: { url },
      });

      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      navigate(`/recipe/${saved.id}`, { replace: true });
    } catch (err: unknown) {
      setStatus(`Fout: ${err instanceof Error ? err.message : "Onbekende fout"}`);
      setLoading(false);
    }
  }

  async function handlePaste(e: React.FormEvent) {
    e.preventDefault();
    if (!pasteText.trim()) return;
    setLoading(true);
    setStatus("Tekst analyseren met AI...");

    try {
      const saved = await api<{ id: string }>("/api/ai/paste", {
        method: "POST",
        body: { text: pasteText },
      });

      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      navigate(`/recipe/${saved.id}`, { replace: true });
    } catch (err: unknown) {
      setStatus(`Fout: ${err instanceof Error ? err.message : "Onbekende fout"}`);
      setLoading(false);
    }
  }

  async function handleManual() {
    setLoading(true);
    setStatus("Nieuw recept aanmaken...");
    try {
      const saved = await api<{ id: string }>("/api/recipes", {
        method: "POST",
        body: {
          title: "Nieuw recept",
          instructions: "-",
          source: "manual",
        },
      });
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      navigate(`/recipe/${saved.id}`, { replace: true, state: { edit: true } });
    } catch (err: unknown) {
      setStatus(`Fout: ${err instanceof Error ? err.message : "Onbekende fout"}`);
      setLoading(false);
    }
  }

  function handleBack() {
    setStep("choose");
    setUrl("");
    setPasteText("");
    setStatus("");
    setRecipePhoto(null);
    setDishPhoto(null);
  }

  const processingCount = backgroundTasks.filter((t) => t.status === "processing").length;

  return (
    <div>
      <PageHeader title="Recepten toevoegen" back={step !== "choose" ? handleBack : undefined} />

      {loading && <Loading message={status} />}

      {!loading && step === "choose" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setStep("scan")}
            className="w-full flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50/50 transition-colors text-left"
          >
            <div className="flex-shrink-0 w-12 h-12 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Foto van kookboek</p>
              <p className="text-sm text-gray-500">Maak een foto van een recept</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate("/add-recipe/community")}
            className="w-full flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50/50 transition-colors text-left"
          >
            <div className="flex-shrink-0 w-12 h-12 bg-teal-100 text-teal-600 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Kopieer van de community</p>
              <p className="text-sm text-gray-500">Kopieer recepten van andere gebruikers</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate("/add-recipe/groentenabonnement")}
            className="w-full flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50/50 transition-colors text-left"
          >
            <div className="flex-shrink-0 w-12 h-12 bg-green-100 text-green-600 rounded-xl flex items-center justify-center">
              <Leaf className="w-6 h-6" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Groentenabonnement</p>
              <p className="text-sm text-gray-500">Kies uit 1500+ recepten</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStep("import")}
            className="w-full flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50/50 transition-colors text-left"
          >
            <div className="flex-shrink-0 w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Importeer van website</p>
              <p className="text-sm text-gray-500">Plak een URL van een receptensite</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStep("paste")}
            className="w-full flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50/50 transition-colors text-left"
          >
            <div className="flex-shrink-0 w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center">
              <ClipboardPaste className="w-6 h-6" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Tekst plakken</p>
              <p className="text-sm text-gray-500">Plak de tekst van een recept</p>
            </div>
          </button>

          <button
            type="button"
            onClick={handleManual}
            className="w-full flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50/50 transition-colors text-left"
          >
            <div className="flex-shrink-0 w-12 h-12 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
              <PenLine className="w-6 h-6" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Handmatig toevoegen</p>
              <p className="text-sm text-gray-500">Typ zelf een nieuw recept</p>
            </div>
          </button>
        </div>
      )}

      {!loading && step === "scan" && (
        <section className="space-y-4">
          {/* Hidden file inputs */}
          <input
            ref={recipeInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handlePhotoSelect(file, "recipe");
            }}
            className="hidden"
          />
          <input
            ref={dishInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handlePhotoSelect(file, "dish");
            }}
            className="hidden"
          />

          {compressing && <Loading message="Foto verwerken..." />}

          {!compressing && (
            <>
              {/* Two photo slots side by side */}
              <div className="flex gap-3">
                {/* Recipe text photo */}
                <div className="flex-1 space-y-1.5">
                  <p className="text-xs font-medium text-gray-500">Recepttekst</p>
                  {recipePhoto ? (
                    <div className="relative">
                      <img
                        src={`data:${recipePhoto.mediaType};base64,${recipePhoto.base64}`}
                        alt="Recept"
                        className="w-full aspect-[3/4] object-cover rounded-xl border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => setRecipePhoto(null)}
                        className="absolute top-1.5 right-1.5 p-1 bg-white/90 rounded-full shadow-sm"
                      >
                        <X className="w-3.5 h-3.5 text-gray-600" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openFilePicker(recipeInputRef)}
                      className="w-full aspect-[3/4] rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-orange-300 hover:text-orange-400 transition-colors"
                    >
                      <BookOpen className="w-6 h-6" />
                      <span className="text-xs">Foto van tekst</span>
                    </button>
                  )}
                </div>

                {/* Dish photo (optional) */}
                <div className="flex-1 space-y-1.5">
                  <p className="text-xs font-medium text-gray-500">
                    Foto gerecht <span className="text-gray-400">(optioneel)</span>
                  </p>
                  {dishPhoto ? (
                    <div className="relative">
                      <img
                        src={`data:${dishPhoto.mediaType};base64,${dishPhoto.base64}`}
                        alt="Gerecht"
                        className="w-full aspect-[3/4] object-cover rounded-xl border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => setDishPhoto(null)}
                        className="absolute top-1.5 right-1.5 p-1 bg-white/90 rounded-full shadow-sm"
                      >
                        <X className="w-3.5 h-3.5 text-gray-600" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openFilePicker(dishInputRef)}
                      className="w-full aspect-[3/4] rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-orange-300 hover:text-orange-400 transition-colors"
                    >
                      <ImagePlus className="w-6 h-6" />
                      <span className="text-xs">Foto van gerecht</span>
                      <span className="text-[10px] text-gray-300">Aanbevolen</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Tags (e.g. cookbook name) */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-500">
                  Tags <span className="text-gray-400">(bijv. kookboek)</span>
                </p>
                <TagInput value={scanTags} onChange={setScanTags} />
              </div>

              {/* Action buttons — only when recipe photo is selected */}
              {recipePhoto && (
                <>
                  <hr className="border-gray-200" />
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      size="lg"
                      icon={Sparkles}
                      fullWidth
                      onClick={handleGenerate}
                    >
                      Importeer en bekijk
                    </Button>
                    <Button
                      variant="primary"
                      size="lg"
                      icon={ChevronRight}
                      fullWidth
                      onClick={handleGenerateAndNext}
                    >
                      Nog eentje
                    </Button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Background tasks */}
          {backgroundTasks.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500">
                Verwerking{processingCount > 0 && ` (${processingCount} bezig)`}
              </p>
              {backgroundTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 p-2.5 bg-white rounded-lg border border-gray-200"
                >
                  {task.status === "processing" && (
                    <Loader2 className="w-4 h-4 text-orange-500 animate-spin flex-shrink-0" />
                  )}
                  {task.status === "done" && (
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                  )}
                  {task.status === "error" && <X className="w-4 h-4 text-red-500 flex-shrink-0" />}
                  <span className="text-sm text-gray-700 flex-1">
                    {task.status === "processing" && "AI analyseert..."}
                    {task.status === "done" && "Recept opgeslagen"}
                    {task.status === "error" && `Fout: ${task.error}`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {status && !compressing && <p className="text-sm text-red-500 text-center">{status}</p>}
        </section>
      )}

      {!loading && step === "import" && (
        <section>
          <form onSubmit={handleImport} className="space-y-3">
            <Input
              type="url"
              placeholder="https://www.ah.nl/recept/..."
              icon={LinkIcon}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              icon={Sparkles}
              disabled={!url.trim()}
            >
              Importeer recept
            </Button>
          </form>
        </section>
      )}

      {!loading && step === "paste" && (
        <section>
          <form onSubmit={handlePaste} className="space-y-3">
            <Textarea
              placeholder="Plak hier de tekst van je recept..."
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={10}
            />
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              icon={Sparkles}
              disabled={pasteText.trim().length < 10}
            >
              Verwerk recept
            </Button>
          </form>
        </section>
      )}
      {confirmModal}
    </div>
  );
}
