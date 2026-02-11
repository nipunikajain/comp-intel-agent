"use client";

import { useMemo } from "react";
import type { MarketReport } from "@/lib/types";
import { getMetricReasoning, getMetricValue } from "@/lib/metric-utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalculationTooltip } from "@/components/CalculationTooltip";
import { SourceBadge } from "@/components/SourceBadge";
import { SourcesInfo } from "@/components/SourcesInfo";
import { SourcesFooter } from "@/components/SourcesFooter";

export interface MarketTabProps {
  report: MarketReport;
  onAddNote?: (section: string) => void;
}

const SEGMENT_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-violet-500", "bg-rose-500"];

export function MarketTab({ report, onAddNote }: MarketTabProps) {
  const base = report.base_company_data;
  const comps = report.competitors;
  const shareEst = getMetricValue(report.comparisons.market_share_estimate);

  const entities = useMemo(() => {
    const list: { name: string; isBase: boolean; strengths: string[]; weaknesses: string[] }[] = [
      {
        name: base.company_name,
        isBase: true,
        strengths: [],
        weaknesses: [],
      },
    ];
    comps.forEach((c) => {
      list.push({
        name: c.company_name,
        isBase: false,
        strengths: c.data.swot_analysis?.strength ?? [],
        weaknesses: c.data.swot_analysis?.weakness ?? [],
      });
    });
    return list;
  }, [base.company_name, comps]);

  const totalEntities = entities.length;
  const baseShare = shareEst ? parseFloat(shareEst.replace(/[^0-9.]/g, "")) : 0;
  const sharePerCompetitor = totalEntities > 1 && !Number.isNaN(baseShare)
    ? (100 - baseShare) / (totalEntities - 1)
    : 100 / totalEntities;
  const shares = entities.map((e) =>
    e.isBase && !Number.isNaN(baseShare) ? baseShare : sharePerCompetitor
  );

  const comparisonSources = report.comparisons?.data_sources ?? [];

  return (
    <div className="w-full space-y-8">
      {/* Section A — 3 stat cards */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <span className="text-sm text-gray-500">Market metrics</span>
          {onAddNote && (
            <button
              type="button"
              onClick={() => onAddNote("market")}
              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              title="Add note"
              aria-label="Add note"
            >
              📝
            </button>
          )}
          {comparisonSources.length > 0 && (
            <SourcesInfo sources={comparisonSources} label="ℹ️ Sources" compact />
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(() => {
            const comp = report.comparisons;
            const marketSizeReasoning = getMetricReasoning(comp?.total_market_size);
            const marketSizeTooltip = marketSizeReasoning
              ? { methodology: marketSizeReasoning.methodology || "AI estimate from market knowledge.", inputs: marketSizeReasoning.inputs, confidence: marketSizeReasoning.confidence }
              : { methodology: "AI estimate based on the identified competitors, their known market positions, and the AI model's training knowledge about this industry. This is NOT sourced from a specific market research report.", inputs: [] as { label: string; value: string }[], confidence: "low" as const };
            const activeUsersReasoning = getMetricReasoning(comp?.total_active_users);
            const activeUsersTooltip = activeUsersReasoning
              ? { methodology: activeUsersReasoning.methodology || "AI estimate from public data.", inputs: activeUsersReasoning.inputs, confidence: activeUsersReasoning.confidence }
              : { methodology: "AI estimate aggregated from publicly mentioned user counts, competitor press releases, and industry knowledge.", inputs: [] as { label: string; value: string }[], confidence: "low" as const };
            return (
              <>
                <Card className="rounded-xl border-gray-200 shadow-sm">
                  <CardHeader className="pb-1">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <CardTitle className="text-sm font-medium text-gray-500">
                          Total Market Size
                        </CardTitle>
                        <CalculationTooltip
                          metric="Total Market Size"
                          methodology={marketSizeTooltip.methodology}
                          inputs={marketSizeTooltip.inputs}
                          confidence={marketSizeTooltip.confidence}
                        />
                      </div>
                      <SourceBadge aiEstimatedOnly />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold text-gray-900">
                      {getMetricValue(comp?.total_market_size) || "Est. $XXB"}
                    </p>
                  </CardContent>
                </Card>
                <Card className="rounded-xl border-gray-200 shadow-sm">
                  <CardHeader className="pb-1">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <CardTitle className="text-sm font-medium text-gray-500">
                          Active Users
                        </CardTitle>
                        <CalculationTooltip
                          metric="Active Users"
                          methodology={activeUsersTooltip.methodology}
                          inputs={activeUsersTooltip.inputs}
                          confidence={activeUsersTooltip.confidence}
                        />
                      </div>
                      <SourceBadge aiEstimatedOnly />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold text-gray-900">
                      {getMetricValue(comp?.total_active_users) || "—"}
                    </p>
                  </CardContent>
                </Card>
              </>
            );
          })()}
          <Card className="rounded-xl border-gray-200 shadow-sm">
            <CardHeader className="pb-1">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <CardTitle className="text-sm font-medium text-gray-500">
                    Cloud Adoption
                  </CardTitle>
                  <CalculationTooltip
                    metric="Cloud Adoption"
                    methodology="Qualitative assessment based on competitor technology stacks and product delivery models observed during scraping."
                    inputs={[]}
                    confidence="low"
                  />
                </div>
                <SourceBadge aiEstimatedOnly />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-gray-900">High</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Section B — Market Share Analysis */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Market Share Analysis
          </h3>
          {onAddNote && (
            <button type="button" onClick={() => onAddNote("market")} className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700" title="Add note" aria-label="Add note">📝</button>
          )}
        </div>
        <div className="space-y-4">
          {entities.map((e, i) => (
            <Card key={e.name} className="rounded-xl border-gray-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-gray-900">{e.name}</span>
                  <Badge variant="secondary">{shares[i].toFixed(1)}%</Badge>
                </div>
                <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]}`}
                    style={{ width: `${Math.min(100, shares[i])}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {e.strengths.length > 0 && (
                    <span className="text-xs font-medium text-emerald-600">
                      Strengths: {e.strengths.slice(0, 2).join(", ")}
                    </span>
                  )}
                  {e.weaknesses.length > 0 && (
                    <span className="text-xs font-medium text-red-600">
                      Weaknesses: {e.weaknesses.slice(0, 2).join(", ")}
                    </span>
                  )}
                  {e.strengths.length === 0 && e.weaknesses.length === 0 && (
                    <span className="text-xs text-gray-500">—</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Section C — Market Segment Leaders */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Market Segment Leaders
          </h3>
          {onAddNote && (
            <button type="button" onClick={() => onAddNote("market")} className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700" title="Add note" aria-label="Add note">📝</button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {["Small Business", "Mid-Market", "Enterprise", "Freelancers"].map((seg, i) => (
            <Card key={seg} className="rounded-xl border-gray-200 shadow-sm">
              <CardHeader className="pb-1">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <CardTitle className="text-sm font-semibold text-gray-900">{seg}</CardTitle>
                  <SourceBadge aiEstimatedOnly />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  Leader: {comps[i]?.company_name ?? base.company_name ?? "—"}
                </p>
                <p className="text-xs text-gray-500">Share: — % · Growth: —</p>
              </CardContent>
            </Card>
          ))}
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
    </div>
  );
}
