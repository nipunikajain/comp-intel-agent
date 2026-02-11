import { FileQuestion } from "lucide-react";

export interface EmptyStateProps {
  message?: string;
  className?: string;
}

export function EmptyState({ message = "No data available", className = "" }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50/30 py-8 text-center ${className}`}
      role="status"
    >
      <FileQuestion className="h-10 w-10 text-gray-400" aria-hidden />
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}
