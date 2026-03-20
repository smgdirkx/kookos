import { CookingPot } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input } from "@/components/ui";
import { useAuthStore } from "@/lib/auth";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Inloggen mislukt");

      setAuth(data.token ?? "cookie", data.user);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-cta-light flex items-center justify-center mb-4">
            <CookingPot size={32} className="text-cta" />
          </div>
          <h1 className="text-4xl font-bold">Kookos</h1>
          <p className="text-gray-500 mt-1">Je favoriete recepten, altijd bij de hand</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="email"
            placeholder="E-mailadres"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Wachtwoord"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <p className="text-danger text-sm text-center">{error}</p>}

          <Button type="submit" variant="cta" size="lg" fullWidth disabled={loading}>
            {loading ? "Laden..." : "Inloggen"}
          </Button>
        </form>
      </div>
    </div>
  );
}
