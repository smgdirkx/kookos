import type { LucideIcon } from "lucide-react";

type FilterChipProps = {
  label: string;
  selected: boolean;
  onClick: () => void;
  icon?: LucideIcon;
};

export function FilterChip({ label, selected, onClick, icon: Icon }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
        selected ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      {Icon && <Icon size={12} className={selected ? "fill-current" : ""} />}
      {label}
    </button>
  );
}
