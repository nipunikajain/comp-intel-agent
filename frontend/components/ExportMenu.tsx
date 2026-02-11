"use client";

import { useState, useRef, useEffect } from "react";
import { Download, ChevronDown, FileText, Copy, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportAnalysis } from "@/lib/api";

const TAB_TO_API: Record<string, string> = {
  Executive: "executive",
  Market: "market",
  Pricing: "pricing",
  Compare: "compare",
  Alerts: "executive",
  "AI Insights": "executive",
};

export interface ExportMenuProps {
  jobId: string | null;
  /** Current dashboard tab (e.g. "Executive", "Compare") */
  currentTab: string;
  /** For Compare tab: selected competitor name (for compare/battlecard export) */
  competitorName?: string | null;
  disabled?: boolean;
  variant?: "default" | "outline" | "ghost";
  className?: string;
}

export function ExportMenu({
  jobId,
  currentTab,
  competitorName,
  disabled,
  variant = "outline",
  className,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const apiTab = TAB_TO_API[currentTab] ?? "executive";
  const isCompare = currentTab === "Compare";

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [open]);

  const handleExport = async (
    format: "pdf" | "markdown" | "html",
    exportTab: string,
    compName?: string | null
  ) => {
    if (!jobId) return;
    setLoading(format + exportTab);
    try {
      const blob = await exportAnalysis(jobId, format, exportTab, compName ?? undefined);
      if (format === "markdown") {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `competitive-intel-${exportTab}.md`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const html = await blob.text();
        const w = window.open("", "_blank");
        if (w) {
          w.document.write(html);
          w.document.close();
          if (format === "pdf") setTimeout(() => w.print(), 100);
        }
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(null);
      setOpen(false);
    }
  };

  const handleCopy = async () => {
    if (!jobId) return;
    setLoading("copy");
    try {
      const blob = await exportAnalysis(jobId, "markdown", apiTab, isCompare ? competitorName : undefined);
      const text = await blob.text();
      await navigator.clipboard.writeText(text);
      setToast("Copied to clipboard — paste into Slack, Notion, or Google Docs");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Copy failed");
    } finally {
      setLoading(null);
      setOpen(false);
    }
  };

  if (!jobId) return null;

  const loadingAny = loading !== null;

  return (
    <div className="relative inline-block" ref={menuRef}>
      <Button
        variant={variant}
        size="sm"
        disabled={disabled || loadingAny}
        onClick={() => setOpen((o) => !o)}
        className={className}
      >
        <Download className="mr-1.5 h-4 w-4" />
        Export
        <ChevronDown className="ml-1.5 h-4 w-4 opacity-70" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[220px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => handleExport("pdf", apiTab, isCompare ? competitorName : undefined)}
            disabled={loadingAny}
          >
            <FileText className="h-4 w-4 text-gray-500" />
            Export as PDF
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => handleExport("markdown", apiTab, isCompare ? competitorName : undefined)}
            disabled={loadingAny}
          >
            <Download className="h-4 w-4 text-gray-500" />
            Export as Markdown
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            onClick={handleCopy}
            disabled={loadingAny}
          >
            <Copy className="h-4 w-4 text-gray-500" />
            Copy as Formatted Text
          </button>
          {isCompare && (
            <button
              type="button"
              className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => handleExport("html", "battlecard", competitorName)}
              disabled={loadingAny}
            >
              <Shield className="h-4 w-4 text-gray-500" />
              Export Battlecard (One-Pager)
            </button>
          )}
        </div>
      )}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg"
          role="status"
        >
          <p className="text-sm font-medium text-gray-900">{toast}</p>
        </div>
      )}
    </div>
  );
}
