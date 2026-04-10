import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  CalendarDays,
  EllipsisVertical,
  Heart,
  LogOut,
  Plus,
  Settings,
  ShoppingCart,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";

const leftTabs: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: "/", label: "Recept", icon: BookOpen, end: true },
  { to: "/meal-plans", label: "Menu", icon: CalendarDays },
];

const rightTabs: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/shared-recipes", label: "Aanbevolen", icon: Heart },
];

function TabLink({
  to,
  label,
  icon: Icon,
  end,
  badge,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }: { isActive: boolean }) =>
        `flex flex-col items-center py-2 px-3 text-xs transition-colors ${
          isActive ? "text-primary" : "text-gray-400"
        }`
      }
    >
      {({ isActive }: { isActive: boolean }) => (
        <>
          <span className="relative">
            <Icon size={22} strokeWidth={isActive ? 2.5 : 2} className="mb-0.5" />
            {badge != null && badge > 0 && (
              <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-4 h-4 flex items-center justify-center px-1">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </span>
          <span className={isActive ? "font-medium" : ""}>{label}</span>
        </>
      )}
    </NavLink>
  );
}

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { data: unseenData } = useQuery<{ count: number }>({
    queryKey: ["shared-unseen-count"],
    queryFn: () => api("/api/shares/unseen-count"),
    refetchInterval: 60_000,
  });

  // Mark as seen when visiting shared-recipes page
  useEffect(() => {
    if (location.pathname === "/shared-recipes" && unseenData?.count) {
      api("/api/shares/mark-seen", { method: "POST" }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["shared-unseen-count"] });
      });
    }
  }, [location.pathname, unseenData?.count, queryClient]);

  async function handleLogout() {
    setMenuOpen(false);
    await fetch("/api/auth/sign-out", {
      method: "POST",
      credentials: "include",
    });
    logout();
    navigate("/login", { replace: true });
  }

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div className="min-h-dvh flex flex-col">
      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-6 pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 safe-bottom">
        <div className="mx-auto max-w-2xl flex items-center justify-around relative">
          {leftTabs.map((tab) => (
            <TabLink key={tab.to} {...tab} />
          ))}

          {/* Center add button */}
          <NavLink
            to="/add-recipe"
            className={({ isActive }: { isActive: boolean }) =>
              `absolute left-1/2 -translate-x-1/2 -top-1 w-11 h-11 rounded-full flex items-center justify-center shadow-md transition-all ${
                isActive
                  ? "bg-cta text-white scale-105"
                  : "bg-cta text-white hover:bg-cta-dark active:scale-95"
              }`
            }
          >
            <Plus size={22} strokeWidth={2.5} />
          </NavLink>

          {/* Spacer for the FAB */}
          <div className="w-12" />

          {rightTabs.map((tab) => (
            <TabLink
              key={tab.to}
              {...tab}
              badge={tab.to === "/shared-recipes" ? unseenData?.count : undefined}
            />
          ))}

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className={`flex flex-col items-center py-2 px-3 text-xs transition-colors ${
                menuOpen ? "text-primary" : "text-gray-400"
              }`}
            >
              <EllipsisVertical size={22} strokeWidth={menuOpen ? 2.5 : 2} className="mb-0.5" />
              <span className={menuOpen ? "font-medium" : ""}>Meer</span>
            </button>

            {menuOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
                {user && (
                  <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-100">
                    {user.name}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/shopping-lists");
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <ShoppingCart size={16} />
                  <span>Boodschappenlijst</span>
                </button>
                {user?.email.endsWith("@drkx.nl") && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/instellingen");
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Settings size={16} />
                    <span>Instellingen</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <LogOut size={16} />
                  <span>Uitloggen</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
    </div>
  );
}
