"use client";

import { useState } from "react";
import type { MarketReport } from "@/lib/types";
import { getMetricValue } from "@/lib/metric-utils";
import type { NewsItem } from "@/lib/types";
import { calculatePriceDifference, formatPriceDifference } from "@/lib/pricing-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalculationTooltip } from "@/components/CalculationTooltip";
import { SourcesInfo } from "@/components/SourcesInfo";
import { SourceBadge } from "@/components/SourceBadge";
import { SourcesFooter } from "@/components/SourcesFooter";
import { NewsDetailDialog } from "@/components/NewsDetailDialog";

export interface PricingTabProps {
  report: MarketReport;
  onAddNote?: (section: string) => void;
}

export function PricingTab({ report, onAddNote }: PricingTabProps) {
  const baseTiers = report.base_company_data.pricing_tiers ?? [];
  const firstCompetitor = report.competitors[0];
  const compTiers = firstCompetitor?.data?.pricing_tiers ?? [];

  const allNews = report.competitors.flatMap((c) =>
    (c.data.recent_news ?? []).map((n) => ({ ...n, company: c.company_name }))
  );
  const sortedNews = [...allNews].sort((a, b) => {
    const dA = a.date ?? "";
    const dB = b.date ?? "";
    return dB.localeCompare(dA);
  });

  const pricingSectionSources = report.competitors.flatMap((c) => c.data?.sources ?? []);

  const [newsDetailOpen, setNewsDetailOpen] = useState(false);
  const [selectedNews, setSelectedNews] = useState<(NewsItem & { company?: string }) | null>(null);
  const [selectedNewsImpact, setSelectedNewsImpact] = useState<"Critical" | "Medium" | "Low">("Medium");

  return (
    <div className="w-full space-y-8">
      {/* Section A — Pricing comparison cards */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <span className="text-sm text-gray-500" title="Prices normalized to monthly per-user rate for comparison">
            Pricing from scraped pages
          </span>
          <div className="flex items-center gap-2">
            {onAddNote && (
              <button type="button" onClick={() => onAddNote("pricing")} className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700" title="Add note" aria-label="Add note">📝</button>
            )}
            {firstCompetitor?.data?.sources?.[0] && (
            <SourceBadge source={firstCompetitor.data.sources[0]} />
          )}
          {pricingSectionSources.length > 0 && (
            <SourcesInfo sources={pricingSectionSources} label="All sources" compact />
          )}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {baseTiers.length === 0 ? (
            <p className="col-span-full text-sm text-gray-500">No pricing data available</p>
          ) : (
            baseTiers.slice(0, 4).map((tier, i) => {
              const compTier = compTiers[i];
              const diffResult = calculatePriceDifference(tier.price ?? null, compTier?.price ?? null);
              const { label, lower, tooltip } = formatPriceDifference(diffResult);
              const showBadge = diffResult.comparable || label === "Different pricing models";
              const normalizedLine =
                diffResult.comparable &&
                diffResult.baseMonthly != null &&
                diffResult.competitorMonthly != null
                  ? `~$${diffResult.baseMonthly.toFixed(1)}/mo vs ~$${diffResult.competitorMonthly.toFixed(1)}/mo (normalized)`
                  : null;
              const pricingInputs = [
                { label: "Base price", value: tier.price ?? "—" },
                { label: "Competitor price", value: compTier?.price ?? "—" },
              ];
              if (
                diffResult.comparable &&
                diffResult.baseMonthly != null &&
                diffResult.competitorMonthly != null
              ) {
                pricingInputs.push({
                  label: "Normalized",
                  value: `~$${diffResult.baseMonthly.toFixed(1)}/mo vs ~$${diffResult.competitorMonthly.toFixed(1)}/mo`,
                });
              }
              return (
                <Card key={tier.name} className="rounded-xl border-gray-200 shadow-sm">
                  <CardHeader className="pb-1">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <CardTitle className="text-sm font-medium text-gray-500">
                          {tier.name}
                        </CardTitle>
                        <CalculationTooltip
                          metric={`${tier.name} pricing`}
                          methodology="Direct comparison of scraped pricing data. Prices normalized to monthly rate where annual pricing was detected."
                          inputs={pricingInputs}
                          confidence="high"
                        />
                      </div>
                      {(tier.source ?? compTier?.source ?? firstCompetitor?.data?.sources?.[0]) && (
                        <SourceBadge
                          source={tier.source ?? compTier?.source ?? firstCompetitor?.data?.sources?.[0]}
                        />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <p className="text-xl font-bold text-blue-600">{tier.price ?? "—"}</p>
                    <p className="text-sm text-gray-500">
                      vs {compTier?.price ?? "—"}
                    </p>
                    {normalizedLine && (
                      <p className="text-xs text-gray-500" title="Prices normalized to monthly per-user rate for comparison">
                        {normalizedLine}
                      </p>
                    )}
                    {showBadge && (
                      <Badge
                        title={tooltip}
                        className={
                          label === "Different pricing models"
                            ? "mt-2 bg-gray-500 text-white"
                            : label === "Equal"
                              ? "mt-2 bg-gray-600 text-white"
                              : lower
                                ? "mt-2 bg-emerald-600 text-white"
                                : "mt-2 bg-red-600 text-white"
                        }
                      >
                        {label}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </section>

      {/* Section B — Recent Pricing Changes */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Recent Pricing Changes
          </h3>
          {onAddNote && (
            <button type="button" onClick={() => onAddNote("pricing")} className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700" title="Add note" aria-label="Add note">📝</button>
          )}
        </div>
        <div className="space-y-3">
          {sortedNews.length === 0 ? (
            <p className="text-sm text-gray-500">No recent news available</p>
          ) : (
            sortedNews.slice(0, 6).map((n, i) => {
              const compForNews = report.competitors.find((c) => c.company_name === n.company);
              const firstSource = compForNews?.data?.sources?.find((s) => s.source_type === "news_page") ?? compForNews?.data?.sources?.[0];
              return (
              <Card key={i} className="rounded-xl border-gray-200 shadow-sm">
                <CardContent className="flex flex-wrap items-start justify-between gap-2 p-4">
                  <div>
                    {n.date && (
                      <Badge variant="outline" className="mb-1 text-xs">
                        {n.date}
                      </Badge>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-gray-900">{n.company}</p>
                      {firstSource && <SourceBadge source={firstSource} />}
                    </div>
                    <p className="text-sm text-gray-600">{n.title}</p>
                    {n.summary && (
                      <p className="mt-0.5 text-sm text-gray-500 line-clamp-2">{n.summary}</p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-blue-600"
                        onClick={() => {
                          setSelectedNews({ ...n, company: n.company });
                          setSelectedNewsImpact(i === 0 ? "Critical" : i === 1 ? "Medium" : "Low");
                          setNewsDetailOpen(true);
                        }}
                      >
                        View Details
                      </Button>
                      {n.url && (
                        <a
                          href={n.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gray-500 underline hover:text-gray-700"
                        >
                          Source →
                        </a>
                      )}
                    </div>
                  </div>
                  <Badge
                    variant={i === 0 ? "destructive" : "secondary"}
                    className="shrink-0"
                  >
                    {i === 0 ? "Critical" : i === 1 ? "Medium" : "Low"}
                  </Badge>
                </CardContent>
              </Card>
              );
            })
          )}
        </div>
      </section>

      {/* Section C — Pricing Opportunities */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Pricing Opportunities
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="rounded-xl border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-900">
                Entry tier
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                {baseTiers[0]
                  ? `Position ${baseTiers[0].price ?? "—"} vs ${compTiers[0]?.price ?? "competitor"} for SMB wins.`
                  : "No data available"}
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-900">
                Mid-market
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                {baseTiers[1] || compTiers[1]
                  ? `Compare mid-tier pricing to strengthen win rate in mid-market.`
                  : "No data available"}
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-900">
                Enterprise
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                {getMetricValue(report.comparisons.pricing_advantage)
                  ? `Leverage: ${getMetricValue(report.comparisons.pricing_advantage)}`
                  : "Use full comparison for enterprise positioning."}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <SourcesFooter
        sources={pricingSectionSources}
        sourcesUsed={report.comparisons?.sources_used}
        aiNote
      />
      {selectedNews && (
        <NewsDetailDialog
          open={newsDetailOpen}
          onOpenChange={setNewsDetailOpen}
          news={selectedNews}
          impact={selectedNewsImpact}
        />
      )}
    </div>
  );
}
