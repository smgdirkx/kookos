import type { LucideIcon } from "lucide-react";
import { forwardRef, type InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  icon?: LucideIcon;
  label?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ icon: Icon, label, className = "", id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium mb-1">
            {label}
          </label>
        )}
        <div className="relative">
          {Icon && (
            <Icon
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
          )}
          <input
            ref={ref}
            id={inputId}
            className={`w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow ${Icon ? "pl-10" : ""} ${className}`}
            {...props}
          />
        </div>
      </div>
    );
  },
);

Input.displayName = "Input";
