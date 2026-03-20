import { CookingPot } from "lucide-react";

export function RecipePlaceholder({
  className = "",
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "hero";
}) {
  return (
    <div
      className={`flex items-center justify-center ${
        variant === "hero"
          ? "bg-gradient-to-br from-cta to-cta-dark"
          : "bg-gradient-to-br from-cta-light to-primary/5"
      } ${className}`}
    >
      <CookingPot
        className={`w-2/5 h-2/5 ${variant === "hero" ? "text-white/60 max-w-16 max-h-16" : "text-cta/40 max-w-12 max-h-12"}`}
      />
    </div>
  );
}
