import type { Env } from "hono";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};

export interface AppEnv extends Env {
  Variables: {
    user: AppUser | null;
    session: unknown;
  };
}
