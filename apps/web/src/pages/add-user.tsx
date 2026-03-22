import { useState } from "react";
import { Button, Input, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";

export function AddUserPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const data = await api<{ name: string; email: string }>("/api/users", {
        method: "POST",
        body: { name, email, password },
      });

      setSuccess(`Gebruiker "${data.name}" is aangemaakt`);
      setName("");
      setEmail("");
      setPassword("");
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
          type="text"
          placeholder="Wachtwoord"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />

        {error && <p className="text-danger text-sm text-center">{error}</p>}
        {success && <p className="text-green-600 text-sm text-center">{success}</p>}

        <Button type="submit" variant="cta" size="lg" fullWidth disabled={loading}>
          {loading ? "Aanmaken..." : "Gebruiker aanmaken"}
        </Button>
      </form>
    </div>
  );
}
