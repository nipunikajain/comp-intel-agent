"use client";

import { useState } from "react";
import type { MarketReport } from "@/lib/types";
import { getMetricReasoning, getMetricValue } from "@/lib/metric-utils";
import { normalizeToMonthlyPrice } from "@/lib/pricing-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalculationTooltip } from "@/components/CalculationTooltip";
import { EmptyState } from "@/components/EmptyState";
import { SourcesFooter } from "@/components/SourcesFooter";
import { ActionPlanSheet } from "@/components/ActionPlanSheet";
import { SourceBadge } from "@/components/SourceBadge";
import { ChevronRight } from "lucide-react";

export interface ExecutiveTabProps {
  report: MarketReport;
  /** When set, show "vs. last analysis" delta on KPI cards */
  previousReport?: MarketReport | null;
  previousReportTimestamp?: string | null;
  onSwitchToCompare?: (competitorName: string) => void;
  /** Open notes sidebar with section pre-selected */
  onAddNote?: (section: string) => void;
}

function extractPriceAdvantagePercent(text: string): string {
  const match = text.match(/(\d+)\s*%/);
  return match ? `${match[1]}%` : text;
}

function computeFeatureParity(report: MarketReport): string {
  const baseFeatures = report.base_company_data.feature_list || [];
  if (baseFeatures.length === 0) return "N/A";
  const competitorFeatures = new Set(
    report.competitors.flatMap((c) => (c.data.feature_list || []).map((f) => f.toLowerCase()))
  );
  const overlap = baseFeatures.filter((f) => competitorFeatures.has(f.toLowerCase())).length;
  const pct = Math.round((overlap / baseFeatures.length) * 100);
  return `${pct}%`;
}

/** Parse a numeric value from strings like "68%" or "2x" for comparison */
function parseKpiNumber(s: string | undefined): number | null {
  if (!s || typeof s !== "string") return null;
  const pct = s.match(/(\d+(?:\.\d+)?)\s*%?/);
  if (pct) return parseFloat(pct[1]);
  const mult = s.match(/(\d+(?:\.\d+)?)\s*x/i);
  if (mult) return parseFloat(mult[1]);
  return null;
}

export function ExecutiveTab({
  report,
  previousReport,
  previousReportTimestamp,
  onSwitchToCompare,
  onAddNote,
}: ExecutiveTabProps) {
  const base = report.base_company_data;
  const comp = report.comparisons;
  const priceAdvantageDisplay = extractPriceAdvantagePercent(getMetricValue(comp.pricing_advantage));
  const featureParity = computeFeatureParity(report);

  const [actionPlanOpen, setActionPlanOpen] = useState(false);
  const [actionPlanOpportunity, setActionPlanOpportunity] = useState<{ text: string; company: string } | null>(null);

  const allOpportunities = report.competitors.flatMap((c) =>
    (c.data.swot_analysis?.opportunity ?? []).map((t) => ({ company: c.company_name, text: t }))
  );
  const allThreats = report.competitors.flatMap((c) =>
    (c.data.swot_analysis?.threat ?? []).map((t) => ({ company: c.company_name, text: t }))
  );

  const prevComp = previousReport?.comparisons;
  const prevWin = prevComp ? parseKpiNumber(getMetricValue(prevComp.win_rate)) : null;
  const currWin = parseKpiNumber(getMetricValue(comp.win_rate));
  const prevShare = prevComp ? parseKpiNumber(getMetricValue(prevComp.market_share_estimate)) : null;
  const currShare = parseKpiNumber(getMetricValue(comp.market_share_estimate));
  const prevPrice = prevComp ? parseKpiNumber(getMetricValue(prevComp.pricing_advantage)) : null;
  const currPrice = parseKpiNumber(getMetricValue(comp.pricing_advantage));
  const prevParity = previousReport ? parseKpiNumber(computeFeatureParity(previousReport)) : null;
  const currParity = parseKpiNumber(featureParity);

  const tooltipText =
    previousReportTimestamp != null
      ? `Compared to analysis from ${(() => {
          try {
            return new Date(previousReportTimestamp).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
          } catch {
            return previousReportTimestamp;
          }
        })()}`
      : undefined;

  // Build tooltip inputs from report for transparency
  const baseEntryTier = base.pricing_tiers?.[0];
  const baseEntryPrice = baseEntryTier?.price ?? "—";
  const baseNorm = baseEntryPrice !== "—" ? normalizeToMonthlyPrice(baseEntryPrice) : null;
  const competitorEntryPrices = report.competitors
    .map((c) => c.data.pricing_tiers?.[0]?.price)
    .filter(Boolean) as string[];
  const avgCompPrice =
    competitorEntryPrices.length > 0
      ? competitorEntryPrices.reduce((sum, p) => {
          const n = normalizeToMonthlyPrice(p).monthly;
          return sum + (n ?? 0);
        }, 0) / competitorEntryPrices.length
      : null;
  const baseFeatures = report.base_company_data.feature_list || [];
  const competitorFeaturesSet = new Set(
    report.competitors.flatMap((c) => (c.data.feature_list || []).map((f) => f.toLowerCase()))
  );
  const featureOverlap = baseFeatures.filter((f) => competitorFeaturesSet.has(f.toLowerCase())).length;
  const strengthsCount = report.competitors.reduce(
    (acc, c) => acc + (c.data.swot_analysis?.strength?.length ?? 0),
    0
  );
  const threatsCount = report.competitors.reduce(
    (acc, c) => acc + (c.data.swot_analysis?.threat?.length ?? 0),
    0 );
  const swotRatio =
    threatsCount > 0 ? `${strengthsCount} strengths / ${threatsCount} threats` : "N/A";

  const winRateReasoning = getMetricReasoning(comp.win_rate);
  const winRateTooltip = winRateReasoning
    ? { methodology: winRateReasoning.methodology || "Estimated by AI from competitive data.", inputs: winRateReasoning.inputs, confidence: winRateReasoning.confidence }
    : {
        methodology:
          "Estimated by AI based on pricing advantage, feature coverage, and market positioning relative to discovered competitors.",
        inputs: [
          { label: "Base pricing", value: baseEntryPrice !== "—" ? `${baseEntryPrice} entry tier` : "—" },
          { label: "Avg competitor pricing", value: avgCompPrice != null ? `~$${avgCompPrice.toFixed(0)}/mo entry tier` : "—" },
          { label: "Feature parity", value: featureParity },
          { label: "SWOT strengths vs threats ratio", value: swotRatio },
        ],
        confidence: "medium" as const,
      };
  const marketShareReasoning = getMetricReasoning(comp.market_share_estimate);
  const marketShareTooltip = marketShareReasoning
    ? { methodology: marketShareReasoning.methodology || "Estimated by AI from market positioning.", inputs: marketShareReasoning.inputs, confidence: marketShareReasoning.confidence }
    : {
        methodology:
          "Estimated by AI based on the company's market positioning, competitor landscape analysis, and publicly available information about the industry.",
        inputs: report.competitors.length
          ? [
              { label: "Competitors considered", value: report.competitors.map((c) => c.company_name).join(", ") },
              { label: "Market share estimate", value: getMetricValue(comp.market_share_estimate) },
            ]
          : [{ label: "Market share estimate", value: getMetricValue(comp.market_share_estimate) }],
        confidence: "low" as const,
      };
  const pricingAdvantageReasoning = getMetricReasoning(comp.pricing_advantage);
  const pricingAdvantageTooltip = pricingAdvantageReasoning
    ? { methodology: pricingAdvantageReasoning.methodology || "Calculated from scraped pricing data.", inputs: pricingAdvantageReasoning.inputs, confidence: pricingAdvantageReasoning.confidence }
    : {
        methodology:
          "Calculated by comparing normalized monthly prices across matching tier levels between the base company and competitors.",
        inputs: [
          {
            label: "Base entry price",
            value:
              baseEntryPrice === "—"
                ? "—"
                : `${baseEntryPrice}${baseNorm?.monthly != null ? ` (~$${baseNorm.monthly.toFixed(1)}/mo)` : ""}`,
          },
          {
            label: "Competitor comparison",
            value:
              avgCompPrice != null
                ? `Avg ~$${avgCompPrice.toFixed(1)}/mo across ${report.competitors.length} competitor(s)`
                : "—",
          },
        ],
        confidence: (baseEntryTier?.price && competitorEntryPrices.length > 0 ? "high" : "low") as "high" | "medium" | "low",
      };

  const kpiCards = [
    {
      label: "Competitive Win Rate",
      value: getMetricValue(comp.win_rate),
      vsPrevious:
        currWin != null && prevWin != null
          ? { improved: currWin >= prevWin, from: `${prevWin}%` }
          : undefined,
      aiEstimated: true,
      tooltip: winRateTooltip,
    },
    {
      label: "Market Share",
      value: getMetricValue(comp.market_share_estimate),
      vsPrevious:
        currShare != null && prevShare != null
          ? { improved: currShare >= prevShare, from: getMetricValue(prevComp?.market_share_estimate) || `${prevShare}%` }
          : undefined,
      aiEstimated: true,
      tooltip: marketShareTooltip,
    },
    {
      label: "Price Advantage",
      value: priceAdvantageDisplay,
      vsPrevious:
        currPrice != null && prevPrice != null
          ? { improved: currPrice >= prevPrice, from: getMetricValue(prevComp?.pricing_advantage) || `${prevPrice}` }
          : undefined,
      aiEstimated: true,
      tooltip: pricingAdvantageTooltip,
    },
    {
      label: "Feature Parity",
      value: featureParity,
      vsPrevious:
        currParity != null && prevParity != null
          ? { improved: currParity >= prevParity, from: `${prevParity}%` }
          : undefined,
      aiEstimated: false,
      tooltip: {
        methodology:
          "Calculated as: (features present in base company that also appear in at least one competitor) / (total unique features across all competitors) × 100",
        inputs: [
          { label: "Base features", value: String(baseFeatures.length) },
          { label: "Total competitor features", value: String(competitorFeaturesSet.size) },
          { label: "Overlapping", value: String(featureOverlap) },
        ],
        confidence: "high" as const,
      },
    },
  ];

  return (
    <div className="w-full space-y-8">
      {/* Section A — 4 KPI cards */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold uppercase tracking-wide text-gray-500">Key metrics</span>
          {onAddNote && (
            <button
              type="button"
              onClick={() => onAddNote("executive")}
              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              title="Add note"
              aria-label="Add note"
            >
              📝
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpiCards.map((kpi) => (
            <Card key={kpi.label} className="rounded-xl border-gray-200 shadow-sm">
              <CardHeader className="pb-1">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <div className="flex items-center gap-1">
                    <CardTitle className="text-sm font-medium text-gray-500">{kpi.label}</CardTitle>
                    <CalculationTooltip
                      metric={kpi.label}
                      methodology={kpi.tooltip.methodology}
                      inputs={kpi.tooltip.inputs}
                      confidence={kpi.tooltip.confidence}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    {onAddNote && (
                      <button
                        type="button"
                        onClick={() => onAddNote("executive")}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Add note"
                        aria-label="Add note"
                      >
                        📝
                      </button>
                    )}
                    {kpi.aiEstimated && <SourceBadge aiEstimatedOnly />}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
                {kpi.vsPrevious && tooltipText ? (
                  <span
                    className="mt-1 inline-flex items-center gap-1 text-xs"
                    title={tooltipText}
                  >
                    <span
                      className={
                        kpi.vsPrevious.improved
                          ? "text-emerald-600"
                          : "text-red-600"
                      }
                    >
                      {kpi.vsPrevious.improved ? "↑" : "↓"} from {kpi.vsPrevious.from}
                    </span>
                  </span>
                ) : (
                  <Badge className="mt-1 bg-gray-100 text-xs text-gray-600">—</Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Section B — Two columns */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="rounded-xl border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-red-700">Top Competitive Threats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {allThreats.length === 0 ? (
              <EmptyState message="No threat data available" />
            ) : (
              allThreats.slice(0, 5).map((t, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-gray-100 bg-gray-50/50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-900">{t.company}</span>
                    <Badge variant={i === 0 ? "destructive" : "secondary"}>
                      {i === 0 ? "High Impact" : "Medium Impact"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{t.text}</p>
                  {onSwitchToCompare && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      onClick={() => onSwitchToCompare(t.company)}
                    >
                      Deep Dive <ChevronRight className="ml-0.5 h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border-gray-200 bg-emerald-50/30 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-emerald-800">Strategic Opportunities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {allOpportunities.length === 0 ? (
              <EmptyState message="No opportunity data available" />
            ) : (
              allOpportunities.slice(0, 4).map((o, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-emerald-200 bg-white p-3"
                >
                  <p className="font-medium text-gray-900">{o.text}</p>
                  <p className="text-xs text-gray-500">{o.company}</p>
                  <Button
                    size="sm"
                    className="mt-2 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => {
                      setActionPlanOpportunity({ text: o.text, company: o.company });
                      setActionPlanOpen(true);
                    }}
                  >
                    Action Plan
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      {/* Section C — AI Strategic Recommendations */}
      <section>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
          AI Strategic Recommendations
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="rounded-xl border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-900">
                Immediate Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-inside list-disc space-y-1 text-sm text-gray-600">
                {comp.summary_text ? (
                  <>
                    <li>Address pricing positioning vs competitors</li>
                    <li>Highlight feature gaps in sales enablement</li>
                    <li>Monitor competitor news for quick response</li>
                  </>
                ) : (
                  <li>No data available</li>
                )}
              </ul>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-900">
                Product Priorities
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-inside list-disc space-y-1 text-sm text-gray-600">
                {base.feature_list?.length ? (
                  <>
                    <li>Strengthen differentiators from competitor feature sets</li>
                    <li>Close gaps where competitors lead</li>
                    <li>Leverage strengths in positioning</li>
                  </>
                ) : (
                  <li>No data available</li>
                )}
              </ul>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-900">
                Market Focus
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-inside list-disc space-y-1 text-sm text-gray-600">
                <li>Use win rate and share estimates for targeting</li>
                <li>Emphasize price advantage in competitive deals</li>
                <li>Track segment shifts from SWOT opportunities</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
      <SourcesFooter
        sources={[
          ...report.competitors.flatMap((c) => c.data?.sources ?? []),
          ...(report.comparisons?.data_sources ?? []),
        ]}
        sourcesUsed={report.comparisons?.sources_used}
        aiNote
      />
      {actionPlanOpportunity && (
        <ActionPlanSheet
          open={actionPlanOpen}
          onOpenChange={setActionPlanOpen}
          opportunityName={actionPlanOpportunity.text}
          company={actionPlanOpportunity.company}
          report={report}
        />
      )}
    </div>
  );
}
