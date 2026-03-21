import heic2any from "heic2any";

const MAX_DIMENSION_SCAN = 1568; // Claude API limiet
const MAX_DIMENSION_PHOTO = 1200; // Gerechtfoto's

function isHeic(file: File): boolean {
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    file.name.toLowerCase().endsWith(".heic")
  );
}

async function convertHeic(file: File): Promise<Blob> {
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
  return Array.isArray(converted) ? converted[0] : converted;
}

function resizeAndEncode(
  blob: Blob,
  maxDimension: number,
  quality: number,
): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > maxDimension || h > maxDimension) {
        const scale = maxDimension / Math.max(w, h);
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
      const webpUrl = canvas.toDataURL("image/webp", quality);
      const isWebp = webpUrl.startsWith("data:image/webp");
      const dataUrl = isWebp ? webpUrl : canvas.toDataURL("image/jpeg", quality);
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

/** Comprimeer afbeelding voor AI scan (max 1568px, quality 0.8) */
export async function compressImage(file: File): Promise<{ base64: string; mediaType: string }> {
  const blob = isHeic(file) ? await convertHeic(file) : file;
  return resizeAndEncode(blob, MAX_DIMENSION_SCAN, 0.8);
}

/** Comprimeer gerechtfoto voor opslag (max 1200px, webp quality 0.9) */
export async function compressPhoto(file: File): Promise<{ base64: string; mediaType: string }> {
  const blob = isHeic(file) ? await convertHeic(file) : file;
  return resizeAndEncode(blob, MAX_DIMENSION_PHOTO, 0.9);
}
