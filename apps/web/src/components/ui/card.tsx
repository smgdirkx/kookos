import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  interactive?: boolean;
};

const paddingClasses = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

export function Card({
  children,
  padding = "md",
  interactive,
  className = "",
  ...props
}: CardProps) {
  return (
    <div
      className={`bg-white rounded-xl border border-gray-100 shadow-sm ${paddingClasses[padding]} ${interactive ? "active:scale-[0.98] transition-transform cursor-pointer" : ""} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
