import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

type IconButtonVariant = "primary" | "ghost" | "outline" | "danger";
type IconButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<IconButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-dark",
  ghost: "text-gray-500 hover:bg-gray-100 hover:text-gray-700",
  outline: "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50",
  danger: "text-danger hover:bg-danger-light",
};

const sizeClasses: Record<IconButtonSize, string> = {
  sm: "p-1.5 rounded-lg",
  md: "p-2.5 rounded-xl",
  lg: "p-3 rounded-xl",
};

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  badge?: number;
  label: string;
};

export function IconButton({
  icon: Icon,
  variant = "ghost",
  size = "md",
  badge,
  label,
  className = "",
  ...props
}: IconButtonProps) {
  const iconSize = size === "sm" ? 16 : size === "md" ? 20 : 24;

  return (
    <button
      aria-label={label}
      className={`relative inline-flex items-center justify-center transition-all disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      <Icon size={iconSize} />
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1 -right-1 bg-danger text-white text-[10px] font-bold rounded-full min-w-4 h-4 flex items-center justify-center px-1">
          {badge}
        </span>
      )}
    </button>
  );
}
