import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  action?: ReactNode;
  back?: () => void;
};

export function PageHeader({ title, action, back }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-2">
        {back && (
          <button
            type="button"
            onClick={back}
            className="p-1 -ml-1 text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>
      {action}
    </div>
  );
}
