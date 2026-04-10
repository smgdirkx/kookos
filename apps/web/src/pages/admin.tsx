import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CircleCheck, Copy, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";

type InvitationCode = {
  id: string;
  code: string;
  createdAt: string;
  active: boolean;
};

export function AdminPage() {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);

  const { data: codes = [], isLoading } = useQuery({
    queryKey: ["invitation-codes"],
    queryFn: () => api<InvitationCode[]>("/api/invitation-codes"),
  });

  const createMutation = useMutation({
    mutationFn: () => api<InvitationCode>("/api/invitation-codes", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invitation-codes"] }),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api(`/api/invitation-codes/${id}`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invitation-codes"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/invitation-codes/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invitation-codes"] }),
  });

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div>
      <PageHeader title="Admin" />

      <h2 className="text-lg font-semibold mb-3">Uitnodigingscodes</h2>

      <Button
        variant="cta"
        fullWidth
        onClick={() => createMutation.mutate()}
        disabled={createMutation.isPending}
      >
        <Plus size={18} />
        {createMutation.isPending ? "Aanmaken..." : "Nieuwe code genereren"}
      </Button>

      {isLoading && <p className="text-center text-gray-500 mt-6">Laden...</p>}

      <div className="mt-4 space-y-2">
        {codes.map((ic) => (
          <div
            key={ic.id}
            className="flex items-center justify-between rounded-xl bg-white p-3 shadow-xs"
          >
            <div className="min-w-0">
              <p className="font-mono text-lg font-semibold tracking-wider">{ic.code}</p>
              {ic.active ? (
                <p className="text-sm text-green-600">Actief</p>
              ) : (
                <p className="text-sm text-gray-400">Gedeactiveerd</p>
              )}
            </div>

            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => toggleMutation.mutate(ic.id)}
                className={`p-2 rounded-lg transition-colors ${
                  ic.active
                    ? "text-gray-400 hover:text-orange-500 hover:bg-orange-50"
                    : "text-gray-400 hover:text-green-600 hover:bg-green-50"
                }`}
                title={ic.active ? "Deactiveren" : "Activeren"}
              >
                {ic.active ? <Ban size={18} /> : <CircleCheck size={18} />}
              </button>
              {ic.active && (
                <button
                  type="button"
                  onClick={() => copyCode(ic.code)}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                >
                  <Copy size={18} />
                  {copied === ic.code && (
                    <span className="absolute -mt-8 -ml-4 text-xs text-green-600 bg-white px-1 rounded shadow">
                      Gekopieerd
                    </span>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => deleteMutation.mutate(ic.id)}
                className="p-2 rounded-lg text-gray-400 hover:text-danger hover:bg-red-50"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {!isLoading && codes.length === 0 && (
        <p className="text-center text-gray-500 mt-6">Nog geen uitnodigingscodes</p>
      )}
    </div>
  );
}
