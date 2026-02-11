"use client";

import { useState, useRef, useEffect } from "react";
import type { ConfidenceLevel } from "@/lib/types";

export interface CalculationTooltipProps {
  metric: string;
  methodology: string;
  inputs: { label: string; value: string }[];
  confidence: ConfidenceLevel;
  lastUpdated?: string;
  /** Optional: render trigger yourself; otherwise default ⓘ icon is used */
  trigger?: React.ReactNode;
  className?: string;
}

const CONFIDENCE_CONFIG: Record<
  ConfidenceLevel,
  { label: string; className: string }
> = {
  high: {
    label: "Based on scraped pricing data",
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  medium: {
    label: "AI-estimated from available data",
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
  low: {
    label: "Insufficient data — rough estimate",
    className: "bg-orange-100 text-orange-800 border-orange-200",
  },
};

export function CalculationTooltip({
  metric,
  methodology,
  inputs,
  confidence,
  lastUpdated,
  trigger,
  className = "",
}: CalculationTooltipProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const config = CONFIDENCE_CONFIG[confidence];

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        aria-label={`How is ${metric} calculated?`}
        title="How is this calculated?"
      >
        {trigger ?? <span className="text-sm font-medium">ⓘ</span>}
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="absolute left-0 top-full z-50 mt-1 max-w-[400px] rounded-lg border border-gray-200 bg-white p-4 shadow-lg"
          role="dialog"
          aria-labelledby="calc-title"
        >
          <h4 id="calc-title" className="text-sm font-semibold text-gray-900">
            How this is calculated
          </h4>
          <p className="mt-2 text-xs text-gray-700 leading-relaxed">
            {methodology}
          </p>
          {inputs.length > 0 && (
            <>
              <p className="mt-3 text-xs font-medium text-gray-600">
                Inputs used:
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
                {inputs.map((inp, i) => (
                  <li key={i}>
                    <span className="font-medium">{inp.label}:</span>{" "}
                    {inp.value}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div
            className={`mt-3 inline-block rounded border px-2 py-1 text-[10px] font-medium ${config.className}`}
          >
            {config.label}
          </div>
          {lastUpdated && (
            <p className="mt-2 text-[10px] text-gray-400">
              Last updated: {lastUpdated}
            </p>
          )}
        </div>
      )}
    </span>
  );
}
