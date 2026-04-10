import { CookingPot } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input } from "@/components/ui";
import { useAuthStore } from "@/lib/auth";

export function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Register
      const registerRes = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, invitationCode }),
      });

      const registerData = await registerRes.json();
      if (!registerRes.ok) {
        throw new Error(registerData.error ?? "Registratie mislukt");
      }

      // Auto-login after registration
      const loginRes = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const loginData = await loginRes.json();
      if (!loginRes.ok) {
        throw new Error("Account aangemaakt, maar inloggen mislukt. Probeer in te loggen.");
      }

      setAuth(loginData.token ?? "cookie", loginData.user);
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
          <p className="text-gray-500 mt-1">Maak een account aan</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="text"
            placeholder="Naam"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
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
            minLength={6}
          />
          <Input
            type="text"
            placeholder="Uitnodigingscode"
            value={invitationCode}
            onChange={(e) => setInvitationCode(e.target.value)}
            required
          />

          {error && <p className="text-danger text-sm text-center">{error}</p>}

          <Button type="submit" variant="cta" size="lg" fullWidth disabled={loading}>
            {loading ? "Account aanmaken..." : "Account aanmaken"}
          </Button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Heb je al een account?{" "}
          <Link to="/login" className="text-cta font-medium">
            Inloggen
          </Link>
        </p>
      </div>
    </div>
  );
}
