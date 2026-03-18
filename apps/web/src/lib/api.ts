import { useAuthStore } from "./auth";

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    credentials: "include", // sends cookies automatically
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    useAuthStore.getState().logout();
    throw new Error("Sessie verlopen, log opnieuw in");
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.message ?? error.error ?? "Verzoek mislukt");
  }

  return res.json() as Promise<T>;
}
