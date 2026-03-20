import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Camera, Globe, ImagePlus, Leaf, Link as LinkIcon, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, Loading, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { compressImage } from "@/lib/image";

type Step = "choose" | "scan" | "import";

export function AddRecipePage() {
  const [step, setStep] = useState<Step>("choose");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [url, setUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handlePhoto(file: File) {
    setLoading(true);
    setStatus("Foto verwerken...");

    try {
      const { base64, mediaType } = await compressImage(file);
      setStatus("AI analyseert je foto...");

      const recipe = await api<Record<string, unknown>>("/api/ai/scan", {
        method: "POST",
        body: { image: base64, mediaType },
      });

      const saved = await api<{ id: string }>("/api/recipes", {
        method: "POST",
        body: { ...recipe, source: "scan", scanImage: base64, scanMediaType: mediaType },
      });

      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      navigate(`/recipe/${saved.id}`, { replace: true });
    } catch (err: unknown) {
      setStatus(`Fout: ${err instanceof Error ? err.message : "Onbekende fout"}`);
      setLoading(false);
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setStatus("Recept importeren van website...");

    try {
      const recipe = await api<Record<string, unknown>>("/api/ai/import", {
        method: "POST",
        body: { url },
      });

      const saved = await api<{ id: string }>("/api/recipes", {
        method: "POST",
        body: { ...recipe, source: "url", sourceUrl: url },
      });

      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      navigate(`/recipe/${saved.id}`, { replace: true });
    } catch (err: unknown) {
      setStatus(`Fout: ${err instanceof Error ? err.message : "Onbekende fout"}`);
      setLoading(false);
    }
  }

  function handleBack() {
    setStep("choose");
    setUrl("");
    setStatus("");
  }

  return (
    <div>
      <PageHeader title="Recept toevoegen" back={step !== "choose" ? handleBack : undefined} />

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
              <p className="font-semibold text-gray-900">Scan uit kookboek</p>
              <p className="text-sm text-gray-500">Maak een foto van een recept</p>
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
            onClick={() => navigate("/add-recipe/groentenabonnement")}
            className="w-full flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50/50 transition-colors text-left"
          >
            <div className="flex-shrink-0 w-12 h-12 bg-green-100 text-green-600 rounded-xl flex items-center justify-center">
              <Leaf className="w-6 h-6" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Groentenabonnement</p>
              <p className="text-sm text-gray-500">Kies uit 200+ recepten</p>
            </div>
          </button>
        </div>
      )}

      {!loading && step === "scan" && (
        <section>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0];
              console.log("[scan] file selected", file?.type, file?.size);
              if (file) handlePhoto(file);
            }}
            className="hidden"
          />

          <div className="flex gap-3">
            <Button
              variant="cta"
              size="lg"
              icon={Camera}
              fullWidth
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.capture = "environment";
                  fileInputRef.current.click();
                }
              }}
            >
              Maak foto
            </Button>
            <Button
              variant="outline"
              size="lg"
              icon={ImagePlus}
              fullWidth
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.removeAttribute("capture");
                  fileInputRef.current.click();
                }
              }}
            >
              Bibliotheek
            </Button>
          </div>
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
    </div>
  );
}
