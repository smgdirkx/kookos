/**
 * Eenmalig script: converteer alle bestaande recipe_images naar webp.
 *
 * Gebruik:
 *   cd apps/api && npx tsx src/scripts/convert-images-webp.ts
 *
 * Wat het doet:
 * 1. Haalt alle recipe_images op die NIET al .webp zijn
 * 2. Download elke afbeelding van S3
 * 3. Comprimeert naar webp (max 1200px, quality 90) via sharp
 * 4. Upload het nieuwe bestand naar S3
 * 5. Update de DB url
 * 6. Verwijdert het oude bestand uit S3
 */
import { config } from "dotenv";

config({ path: "../../.env" });

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../db/index.js";
import { recipeImages } from "../db/schema.js";
import { S3_BUCKET, s3 } from "../s3.js";

const MAX_DIMENSION = 1200;
const WEBP_QUALITY = 90;

async function main() {
  const allImages = await db.select().from(recipeImages);
  const toConvert = allImages.filter((img) => !img.url.endsWith(".webp"));

  console.log(`Totaal: ${allImages.length} afbeeldingen, ${toConvert.length} te converteren`);

  if (toConvert.length === 0) {
    console.log("Niets te doen.");
    process.exit(0);
  }

  let converted = 0;
  let failed = 0;

  for (const image of toConvert) {
    const oldKey = image.url;
    const newKey = oldKey.replace(/\.[^.]+$/, ".webp");

    try {
      // Download van S3
      const getResult = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: oldKey }));
      const body = await getResult.Body?.transformToByteArray();
      if (!body) {
        console.error(`  SKIP ${oldKey}: geen body`);
        failed++;
        continue;
      }

      // Comprimeer naar webp
      const compressed = await sharp(Buffer.from(body))
        .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();

      const savings = Math.round((1 - compressed.length / body.length) * 100);

      // Upload nieuw bestand
      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: newKey,
          Body: compressed,
          ContentType: "image/webp",
        }),
      );

      // Update DB
      await db.update(recipeImages).set({ url: newKey }).where(eq(recipeImages.id, image.id));

      // Verwijder oud bestand
      if (newKey !== oldKey) {
        await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: oldKey }));
      }

      converted++;
      console.log(
        `  OK ${oldKey} → ${newKey} (${formatSize(body.length)} → ${formatSize(compressed.length)}, ${savings}% kleiner)`,
      );
    } catch (err: unknown) {
      failed++;
      console.error(`  FOUT ${oldKey}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\nKlaar: ${converted} geconverteerd, ${failed} mislukt`);
  process.exit(failed > 0 ? 1 : 0);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

main();
