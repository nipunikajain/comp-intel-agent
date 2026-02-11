"use client";

import { useEffect, useRef, useState } from "react";
import type { SourceAttribution } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface SourcesInfoProps {
  sources: SourceAttribution[];
  /** Optional short label, e.g. "AI-estimated • Sources" */
  label?: string;
  /** Compact inline style for KPI/banner */
  compact?: boolean;
  className?: string;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function sourceTypeBadge(sourceType: string) {
  const isLlm = sourceType === "llm_estimate";
  return (
    <Badge
      variant={isLlm ? "warning" : "success"}
      className="text-xs"
    >
      {isLlm ? "AI Estimated" : "Scraped"}
    </Badge>
  );
}

function confidenceBadge(confidence: string) {
  const variant =
    confidence === "high"
      ? "success"
      : confidence === "medium"
        ? "warning"
        : "secondary";
  return (
    <Badge variant={variant} className="text-xs capitalize">
      {confidence}
    </Badge>
  );
}

export function SourcesInfo({ sources, label = "Sources", compact, className }: SourcesInfoProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [open]);

  if (!sources?.length) return null;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 hover:underline focus:outline-none focus:ring-2 focus:ring-slate-300 rounded",
          compact && "text-[11px]"
        )}
        aria-expanded={open}
        aria-label="Toggle sources"
      >
        <span aria-hidden>ℹ️</span>
        <span>{label}</span>
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-10 mt-1 min-w-[280px] rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
          role="dialog"
          aria-label="Source attribution"
        >
          <ul className="space-y-2">
            {sources.map((s, i) => (
              <li key={i} className="border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  {sourceTypeBadge(s.source_type)}
                  {confidenceBadge(s.confidence)}
                </div>
                {s.source_url.startsWith("http") ? (
                  <a
                    href={s.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 underline break-all hover:text-blue-700"
                  >
                    {s.source_url}
                  </a>
                ) : (
                  <span className="text-xs text-slate-600">{s.source_url}</span>
                )}
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {formatTimestamp(s.scraped_at)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
