import { config } from "dotenv";

config({ path: "../../.env" });

import { auth } from "../auth.js";

const email = "k00kos@drkx.nl";
const password = "k00kos@drkx";
const name = "k00kos";

try {
  const result = await auth.api.signUpEmail({
    body: { email, password, name },
  });
  console.log("User created:", result.user.email, result.user.id);
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Failed to create user:", message);
  process.exit(1);
}

process.exit(0);
