/**
 * Helpers for metrics that can be either a plain string (legacy) or
 * MetricWithReasoning from the backend. Use these so the dashboard never
 * crashes on either format.
 */

import type { CalculationMethodology, MetricWithReasoning } from "@/lib/types";

export type MetricValue = string | MetricWithReasoning;

/**
 * Extract the display string from a metric (handles both old string and new
 * MetricWithReasoning from API).
 */
export function getMetricValue(metric: MetricValue | null | undefined): string {
  if (metric == null) return "";
  if (typeof metric === "string") return metric.trim();
  return (metric.value ?? "").trim();
}

/**
 * Get tooltip data from a metric when it's MetricWithReasoning. Returns null
 * for plain-string (old format) so callers can use fallback methodology.
 */
export function getMetricReasoning(
  metric: MetricValue | null | undefined
): CalculationMethodology | null {
  if (metric == null || typeof metric === "string") return null;
  return {
    metric: "",
    methodology: metric.reasoning?.trim() || "",
    inputs: (metric.inputs_used ?? []).map((i) => ({ label: i, value: "" })),
    confidence: (metric.confidence ?? "medium") as "high" | "medium" | "low",
  };
}
