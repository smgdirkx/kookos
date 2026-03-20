import type { LucideIcon } from "lucide-react";
import { BookOpen, CalendarDays, EllipsisVertical, LogOut, Plus, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/lib/auth";

const tabs: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: "/", label: "Recepten", icon: BookOpen, end: true },
  { to: "/meal-plans", label: "Weekmenu", icon: CalendarDays },
  { to: "/add-recipe", label: "Toevoegen", icon: Plus },
];

export function Layout() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
        <div className="mx-auto max-w-2xl flex justify-around">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }: { isActive: boolean }) =>
                `flex flex-col items-center py-2 px-3 text-xs transition-colors ${
                  isActive ? "text-primary" : "text-gray-400"
                }`
              }
            >
              {({ isActive }: { isActive: boolean }) => (
                <>
                  <tab.icon size={22} strokeWidth={isActive ? 2.5 : 2} className="mb-0.5" />
                  <span className={isActive ? "font-medium" : ""}>{tab.label}</span>
                </>
              )}
            </NavLink>
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
                    navigate("/add-recipe/gebruiker");
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <UserPlus size={16} />
                  <span>Gebruiker toevoegen</span>
                </button>
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
