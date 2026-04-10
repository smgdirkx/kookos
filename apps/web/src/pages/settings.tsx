import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, KeyRound, Mail, User } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Button, Input, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";

type UserProfile = {
  id: string;
  name: string;
  email: string;
  allowMeat: boolean;
  allowFish: boolean;
};

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const updateUser = useAuthStore((s) => s.updateUser);
  const token = useAuthStore((s) => s.token);

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [success, setSuccess] = useState(false);
  const [showMeatVideo, setShowMeatVideo] = useState(false);

  // Fetch full profile (including diet prefs) on mount
  const { data: profile } = useQuery({
    queryKey: ["user-profile"],
    queryFn: () => api<UserProfile>("/api/users/me"),
  });

  // Sync diet prefs to auth store when profile loads
  useEffect(() => {
    if (profile) {
      updateUser({ allowMeat: profile.allowMeat, allowFish: profile.allowFish });
    }
  }, [profile, updateUser]);

  const mutation = useMutation({
    mutationFn: (data: {
      name?: string;
      email?: string;
      password?: string;
      allowMeat?: boolean;
      allowFish?: boolean;
    }) =>
      api<UserProfile>("/api/users/me", {
        method: "PATCH",
        body: data,
      }),
    onSuccess: (updated) => {
      if (token) {
        setAuth(token, {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          allowMeat: updated.allowMeat,
          allowFish: updated.allowFish,
        });
      }
      setPassword("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (data: { allowMeat?: boolean; allowFish?: boolean }) =>
      api<UserProfile>("/api/users/me", {
        method: "PATCH",
        body: data,
      }),
    onSuccess: (updated) => {
      updateUser({ allowMeat: updated.allowMeat, allowFish: updated.allowFish });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const data: Record<string, string> = {};
    if (name !== user?.name) data.name = name;
    if (email !== user?.email) data.email = email;
    if (password) data.password = password;
    if (Object.keys(data).length === 0) return;
    mutation.mutate(data);
  }

  const allowMeat = user?.allowMeat ?? profile?.allowMeat ?? false;
  const allowFish = user?.allowFish ?? profile?.allowFish ?? false;

  return (
    <div>
      <PageHeader title="Instellingen" />

      {/* Meat video modal */}
      {showMeatVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
          <div className="w-full max-w-sm bg-white rounded-2xl overflow-hidden shadow-xl">
            <div className="aspect-[9/16] bg-black">
              <iframe
                src="https://www.youtube.com/embed/6_XNelDxvII?autoplay=1"
                title="Weet je het zeker?"
                allow="autoplay; encrypted-media"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
            <div className="p-4 space-y-2">
              <Button
                fullWidth
                onClick={() => {
                  setShowMeatVideo(false);
                  toggleMutation.mutate({ allowMeat: true });
                }}
              >
                Ik wil toch vlees
              </Button>
              <Button variant="cta" fullWidth onClick={() => setShowMeatVideo(false)}>
                Ik blijf vegetarisch
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Diet preferences */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Voedingsvoorkeuren</h2>
        <p className="text-sm text-gray-500 mb-4">
          Standaard worden alleen vegetarische recepten getoond. Zet een optie aan om ook recepten
          met vlees of vis te zien. Bij het importeren of scannen worden vlees en vis automatisch
          vervangen door vegetarische alternatieven als de bijbehorende optie uit staat.
        </p>
        <div className="space-y-3">
          <label className="flex items-center justify-between rounded-xl bg-white p-4 shadow-xs">
            <span className="text-sm font-medium">Vlees toestaan</span>
            <button
              type="button"
              role="switch"
              aria-checked={allowMeat}
              onClick={() => {
                if (!allowMeat) {
                  setShowMeatVideo(true);
                } else {
                  toggleMutation.mutate({ allowMeat: false });
                }
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                allowMeat ? "bg-primary" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform mt-0.5 ${
                  allowMeat ? "translate-x-5.5 ml-0" : "translate-x-0.5"
                }`}
              />
            </button>
          </label>
          <label className="flex items-center justify-between rounded-xl bg-white p-4 shadow-xs">
            <span className="text-sm font-medium">Vis toestaan</span>
            <button
              type="button"
              role="switch"
              aria-checked={allowFish}
              onClick={() => toggleMutation.mutate({ allowFish: !allowFish })}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                allowFish ? "bg-primary" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform mt-0.5 ${
                  allowFish ? "translate-x-5.5 ml-0" : "translate-x-0.5"
                }`}
              />
            </button>
          </label>
        </div>
      </section>

      {/* Profile form */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Profiel</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Naam"
            icon={User}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Input
            label="E-mailadres"
            icon={Mail}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <Input
            label="Nieuw wachtwoord"
            icon={KeyRound}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Laat leeg om niet te wijzigen"
            minLength={6}
          />

          {mutation.isError && (
            <p className="text-sm text-red-600">
              {(mutation.error as Error).message || "Er ging iets mis"}
            </p>
          )}

          {success && (
            <p className="text-sm text-green-600 flex items-center gap-1">
              <Check size={16} />
              Opgeslagen
            </p>
          )}

          <Button type="submit" variant="cta" fullWidth disabled={mutation.isPending}>
            {mutation.isPending ? "Opslaan..." : "Opslaan"}
          </Button>
        </form>
      </section>
    </div>
  );
}
