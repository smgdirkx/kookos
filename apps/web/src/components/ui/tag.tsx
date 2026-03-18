import type { ReactNode } from "react";

type TagVariant = "default" | "primary" | "secondary" | "success" | "danger" | "warning";

const variantClasses: Record<TagVariant, string> = {
  default: "bg-gray-100 text-gray-700",
  primary: "bg-primary-light text-primary-dark",
  secondary: "bg-secondary-light text-secondary-dark",
  success: "bg-success-light text-green-700",
  danger: "bg-danger-light text-red-700",
  warning: "bg-cta-light text-amber-700",
};

type TagProps = {
  variant?: TagVariant;
  children: ReactNode;
  className?: string;
};

export function Tag({ variant = "default", children, className = "" }: TagProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
