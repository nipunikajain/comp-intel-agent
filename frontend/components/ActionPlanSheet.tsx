"use client";

import { useCallback } from "react";
import type { MarketReport } from "@/lib/types";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";

export interface ActionPlanSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityName: string;
  company: string;
  report: MarketReport;
}

function deriveActionPlan(
  opportunityName: string,
  company: string,
  report: MarketReport
): {
  overview: string;
  keySteps: string[];
  timeline: string;
  expectedImpact: string;
  resourcesNeeded: string[];
} {
  const comp = report.comparisons;
  const summary = comp.summary_text ?? "";

  const overview =
    `Capitalize on "${opportunityName}" in relation to ${company}. ` +
    (summary
      ? `Current market context: ${summary.slice(0, 200)}${summary.length > 200 ? "…" : ""}`
      : "Use competitive positioning and win rate insights to prioritize this opportunity.");

  const keySteps = [
    "Validate opportunity with sales and customer feedback against competitor positioning.",
    "Define success metrics and a short-term pilot (e.g., 30–60 days).",
    "Align product, marketing, and sales on messaging and differentiation.",
    "Monitor competitor moves and adjust tactics based on win/loss and market share signals.",
    "Review pricing and feature parity to strengthen the opportunity.",
  ].slice(0, 5);

  const timeline =
    "Weeks 1–2: Validation and scope; Weeks 3–6: Pilot and messaging; Weeks 7–12: Scale and iterate.";

  const expectedImpact =
    "Improved win rate in relevant segments, clearer differentiation vs. " +
    company +
    ", and stronger alignment of go-to-market with market opportunities.";

  const resourcesNeeded = [
    "Cross-functional team (product, marketing, sales)",
    "Access to win/loss and competitive intelligence",
    "Budget for pilot campaigns or enablement",
  ];

  return { overview, keySteps, timeline, expectedImpact, resourcesNeeded };
}

function planToCopyText(
  opportunityName: string,
  company: string,
  plan: ReturnType<typeof deriveActionPlan>
): string {
  return [
    `Action Plan: ${opportunityName}`,
    "",
    "Overview",
    plan.overview,
    "",
    "Key Steps",
    ...plan.keySteps.map((s, i) => `${i + 1}. ${s}`),
    "",
    "Timeline",
    plan.timeline,
    "",
    "Expected Impact",
    plan.expectedImpact,
    "",
    "Resources Needed",
    ...plan.resourcesNeeded.map((s) => `• ${s}`),
  ].join("\n");
}

export function ActionPlanSheet({
  open,
  onOpenChange,
  opportunityName,
  company,
  report,
}: ActionPlanSheetProps) {
  const plan = deriveActionPlan(opportunityName, company, report);
  const copyText = planToCopyText(opportunityName, company, plan);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      // Optional: toast or brief "Copied!" state
    } catch {
      // fallback for older browsers
    }
  }, [copyText]);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Action Plan: ${opportunityName}`}
      className="space-y-6"
    >
      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold uppercase text-gray-500">Overview</h3>
          <p className="mt-1 text-sm text-gray-700">{plan.overview}</p>
        </section>
        <section>
          <h3 className="text-sm font-semibold uppercase text-gray-500">Key Steps</h3>
          <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-gray-700">
            {plan.keySteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="text-sm font-semibold uppercase text-gray-500">Timeline</h3>
          <p className="mt-1 text-sm text-gray-700">{plan.timeline}</p>
        </section>
        <section>
          <h3 className="text-sm font-semibold uppercase text-gray-500">Expected Impact</h3>
          <p className="mt-1 text-sm text-gray-700">{plan.expectedImpact}</p>
        </section>
        <section>
          <h3 className="text-sm font-semibold uppercase text-gray-500">Resources Needed</h3>
          <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-gray-700">
            {plan.resourcesNeeded.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
        <Button onClick={handleCopy} variant="outline" size="sm" className="w-full sm:w-auto">
          <Copy className="mr-2 h-4 w-4" />
          Copy to Clipboard
        </Button>
      </div>
    </Sheet>
  );
}
