import { Loader2 } from "lucide-react";

type LoadingProps = {
  message?: string;
};

export function Loading({ message = "Laden..." }: LoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <Loader2 size={24} className="animate-spin mb-2" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
