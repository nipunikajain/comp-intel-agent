"use client";

import { useState } from "react";
import type { SourceAttribution } from "@/lib/types";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SourcesFooterProps {
  sources: SourceAttribution[];
  /** URLs that fed into synthesis (from ComparisonSummary.sources_used); merged with source_urls for count */
  sourcesUsed?: string[];
  /** Optional: "AI-estimated" note when tab includes LLM-generated data */
  aiNote?: boolean;
  className?: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function sourceTypeLabel(type: string): string {
  switch (type) {
    case "pricing_page":
      return "Pricing Page";
    case "news_page":
      return "News Page";
    case "homepage":
      return "Homepage";
    case "llm_estimate":
      return "AI Estimate";
    default:
      return type;
  }
}

export function SourcesFooter({ sources, sourcesUsed = [], aiNote = false, className }: SourcesFooterProps) {
  const [collapsed, setCollapsed] = useState(true);
  const uniqueByUrl = Array.from(
    new Map(sources.map((s) => [s.source_url, s])).values()
  );
  const allUrls = Array.from(
    new Set([
      ...uniqueByUrl.map((s) => s.source_url).filter(Boolean),
      ...(sourcesUsed || []).filter(Boolean),
    ])
  );
  const count = allUrls.length || uniqueByUrl.length;
  const latestDate =
    uniqueByUrl.length > 0
      ? uniqueByUrl
          .filter((s) => s.scraped_at)
          .sort((a, b) => new Date(b.scraped_at).getTime() - new Date(a.scraped_at).getTime())[0]
          ?.scraped_at
      : null;
  const dateStr = latestDate ? formatDate(latestDate) : "—";

  return (
    <div
      className={cn(
        "mt-8 rounded-lg border border-gray-200 bg-gray-50/80 text-sm",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left font-medium text-gray-700 hover:bg-gray-100/80"
        aria-expanded={!collapsed}
      >
        <span>Data Sources</span>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronUp className="h-4 w-4 text-gray-500" />
        )}
      </button>
      {!collapsed && (
        <div className="border-t border-gray-200 px-4 py-3">
          <p className="text-gray-600">
            This analysis was generated from {count} source{count !== 1 ? "s" : ""} on {dateStr}.
            {aiNote && " All market estimates are AI-generated and should be independently verified."}
          </p>
          <ul className="mt-3 space-y-2">
            {allUrls.length > 0
              ? allUrls.map((url, i) => {
                  const att = uniqueByUrl.find((s) => s.source_url === url);
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-2 text-xs">
                      {att && (
                        <span className="rounded bg-gray-200 px-1.5 py-0.5 font-medium text-gray-600">
                          {sourceTypeLabel(att.source_type)}
                        </span>
                      )}
                      {url.startsWith("http") ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 underline hover:text-blue-700"
                        >
                          {url}
                        </a>
                      ) : (
                        <span className="text-gray-600">{url}</span>
                      )}
                    </li>
                  );
                })
              : uniqueByUrl.map((s, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-gray-200 px-1.5 py-0.5 font-medium text-gray-600">
                      {sourceTypeLabel(s.source_type)}
                    </span>
                    {s.source_url.startsWith("http") ? (
                      <a
                        href={s.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline hover:text-blue-700"
                      >
                        {s.source_url}
                      </a>
                    ) : (
                      <span className="text-gray-600">{s.source_url}</span>
                    )}
                  </li>
                ))}
          </ul>
        </div>
      )}
    </div>
  );
}
