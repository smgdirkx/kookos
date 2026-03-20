import heic2any from "heic2any";

const MAX_DIMENSION = 1568;

export async function compressImage(file: File): Promise<{ base64: string; mediaType: string }> {
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
