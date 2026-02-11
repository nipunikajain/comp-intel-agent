"use client";

import type { NewsItem } from "@/lib/types";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export interface NewsDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  news: NewsItem & { company?: string };
  impact?: "Critical" | "Medium" | "Low";
}

export function NewsDetailDialog({ open, onOpenChange, news, impact = "Medium" }: NewsDetailDialogProps) {
  const headline = news.title ?? "No title";
  const summary = news.summary ?? "";
  const url = news.url ?? null;
  const date = news.date ?? "";
  const company = news.company ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="News details" className="space-y-4">
      <div className="space-y-4">
        {company && (
          <p className="text-sm font-medium text-gray-500">{company}</p>
        )}
        <h3 className="text-lg font-semibold text-gray-900">{headline}</h3>
        {date && (
          <Badge variant="outline" className="text-xs">
            {date}
          </Badge>
        )}
        {impact && (
          <Badge
            className={
              impact === "Critical"
                ? "bg-red-600"
                : impact === "Medium"
                  ? "bg-amber-600"
                  : "bg-gray-500"
            }
          >
            Impact: {impact}
          </Badge>
        )}
        {summary && (
          <div>
            <h4 className="text-xs font-semibold uppercase text-gray-500">Summary</h4>
            <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{summary}</p>
          </div>
        )}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 underline"
          >
            Read Original Source →
          </a>
        )}
      </div>
    </Dialog>
  );
}
