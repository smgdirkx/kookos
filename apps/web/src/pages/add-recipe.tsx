import { useQueryClient } from "@tanstack/react-query";
import heic2any from "heic2any";
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

const MAX_DIMENSION = 1568;

async function compressImage(file: File): Promise<{ base64: string; mediaType: string }> {
  // HEIC/HEIF: converteer eerst naar JPEG via heic2any
  let imageBlob: Blob = file;
  if (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    file.name.toLowerCase().endsWith(".heic")
  ) {
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
    imageBlob = Array.isArray(converted) ? converted[0] : converted;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageBlob);
    img.onload = () => {
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas niet beschikbaar"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      // Safari ondersteunt geen webp canvas export, fallback naar jpeg
      const webpUrl = canvas.toDataURL("image/webp", 0.8);
      const isWebp = webpUrl.startsWith("data:image/webp");
      const dataUrl = isWebp ? webpUrl : canvas.toDataURL("image/jpeg", 0.85);
      const mediaType = isWebp ? "image/webp" : "image/jpeg";
      URL.revokeObjectURL(url);
      resolve({ base64: dataUrl.split(",")[1], mediaType });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Afbeelding kon niet geladen worden"));
    };
    img.src = url;
  });
}
