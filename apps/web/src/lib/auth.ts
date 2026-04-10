import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  token: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    allowMeat?: boolean;
    allowFish?: boolean;
  } | null;
  setAuth: (token: string, user: AuthState["user"]) => void;
  updateUser: (partial: Partial<NonNullable<AuthState["user"]>>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      updateUser: (partial) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...partial } : null,
        })),
      logout: () => set({ token: null, user: null }),
    }),
    { name: "kookos-auth" },
  ),
);
