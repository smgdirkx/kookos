import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type BadgeProps = {
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
};

export function Badge({ icon: Icon, children, className = "" }: BadgeProps) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm ${className}`}
    >
      {Icon && <Icon size={14} className="text-gray-500" />}
      {children}
    </div>
  );
}
