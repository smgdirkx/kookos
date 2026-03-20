import { config } from "dotenv";

config({ path: "../../.env" });

import { syncExternalRecipes } from "../services/scraper.js";

const batchSize = parseInt(process.argv[2] || "10", 10);
const result = await syncExternalRecipes(batchSize);
console.log(JSON.stringify(result, null, 2));
process.exit(0);
