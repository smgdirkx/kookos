import { useQueryClient } from "@tanstack/react-query";
import { Camera, ImagePlus, Link as LinkIcon, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, Loading, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";

export function AddRecipePage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [url, setUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handlePhoto(file: File) {
    setLoading(true);
    setStatus("AI analyseert je foto...");

    const base64 = await fileToBase64(file);

    try {
      const recipe = await api<Record<string, unknown>>("/api/ai/scan", {
        method: "POST",
        body: { image: base64 },
      });

      const saved = await api<{ id: string }>("/api/recipes", {
        method: "POST",
        body: { ...recipe, source: "scan" },
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

  return (
    <div>
      <PageHeader title="Recept toevoegen" />

      {loading && <Loading message={status} />}

      {!loading && (
        <>
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Scan uit kookboek</h2>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const file = e.target.files?.[0];
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
                disabled={loading}
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
                disabled={loading}
              >
                Bibliotheek
              </Button>
            </div>
          </section>

          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-gray-50 px-3 text-sm text-gray-400">of</span>
            </div>
          </div>

          <section>
            <h2 className="text-lg font-semibold mb-3">Importeer van website</h2>
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
                disabled={loading || !url.trim()}
              >
                Importeer recept
              </Button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
