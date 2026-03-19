import type { LucideIcon } from "lucide-react";
import { BookOpen, CalendarDays, Plus } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

const tabs: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: "/", label: "Recepten", icon: BookOpen, end: true },
  { to: "/meal-plans", label: "Weekmenu", icon: CalendarDays },
  { to: "/add-recipe", label: "Toevoegen", icon: Plus },
];

export function Layout() {
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
        </div>
      </nav>
    </div>
  );
}
