import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "cta" | "danger" | "ghost" | "outline";
type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-dark active:bg-primary-dark",
  secondary: "bg-secondary text-white hover:bg-secondary-dark active:bg-secondary-dark",
  cta: "bg-cta text-white hover:bg-cta-dark active:bg-cta-dark",
  danger: "bg-danger text-white hover:bg-red-700 active:bg-red-800",
  ghost: "bg-transparent text-gray-600 hover:bg-gray-100 active:bg-gray-200",
  outline: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 active:bg-gray-100",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm rounded-lg",
  md: "px-4 py-2.5 text-sm rounded-xl",
  lg: "px-4 py-3 rounded-xl",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  fullWidth?: boolean;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  iconRight: IconRight,
  fullWidth,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-all disabled:opacity-50 disabled:pointer-events-none ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      disabled={disabled}
      {...props}
    >
      {Icon && <Icon size={size === "sm" ? 16 : 18} />}
      {children}
      {IconRight && <IconRight size={size === "sm" ? 16 : 18} />}
    </button>
  );
}
