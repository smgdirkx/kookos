import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";

type LinkButtonVariant = "primary" | "secondary" | "cta" | "ghost" | "outline";
type LinkButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<LinkButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-dark",
  secondary: "bg-secondary text-white hover:bg-secondary-dark",
  cta: "bg-cta text-white hover:bg-cta-dark",
  ghost: "text-gray-600 hover:bg-gray-100",
  outline: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50",
};

const sizeClasses: Record<LinkButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm rounded-lg",
  md: "px-4 py-2.5 text-sm rounded-xl",
  lg: "px-4 py-3 rounded-xl",
};

type LinkButtonProps = LinkProps & {
  variant?: LinkButtonVariant;
  size?: LinkButtonSize;
  icon?: LucideIcon;
  children: ReactNode;
};

export function LinkButton({
  variant = "primary",
  size = "md",
  icon: Icon,
  children,
  className = "",
  ...props
}: LinkButtonProps) {
  return (
    <Link
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-all ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {Icon && <Icon size={size === "sm" ? 16 : 18} />}
      {children}
    </Link>
  );
}
