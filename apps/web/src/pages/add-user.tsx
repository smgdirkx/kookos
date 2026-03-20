import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, PageHeader } from "@/components/ui";

export function AddUserPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Aanmaken mislukt");

      navigate("/add-recipe", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    }
    setLoading(false);
  }

  return (
    <div>
      <PageHeader title="Gebruiker toevoegen" />

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
        />

        {error && <p className="text-danger text-sm text-center">{error}</p>}

        <Button type="submit" variant="cta" size="lg" fullWidth disabled={loading}>
          {loading ? "Aanmaken..." : "Gebruiker aanmaken"}
        </Button>
      </form>
    </div>
  );
}
