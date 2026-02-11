"use client";

import type { MarketReport } from "@/lib/types";
import { getMetricValue } from "@/lib/metric-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SourceBadge } from "@/components/SourceBadge";
import { SourcesFooter } from "@/components/SourcesFooter";
import { AskAI } from "@/components/AskAI";

export interface AIInsightsTabProps {
  report: MarketReport;
  /** Job ID for Ask AI (from current analysis); optional */
  jobId?: string | null;
}

export function AIInsightsTab({ report, jobId }: AIInsightsTabProps) {
  const summary = report.comparisons.summary_text;

  return (
    <div className="w-full space-y-8">
      {/* Ask AI chat */}
      <AskAI jobId={jobId ?? null} report={report} />

      {/* Hero — summary as blockquote */}
      <section>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            🤖 AI-Estimated
          </span>
        </div>
        <blockquote className="rounded-xl border-l-4 border-blue-600 bg-blue-50/30 py-4 pl-6 pr-4 text-lg italic text-gray-800">
          {summary || "No summary available from analysis."}
        </blockquote>
      </section>

      {/* Key Findings */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Key Findings
        </h3>
        <ul className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/30 p-4">
          <li className="text-sm text-gray-700">
            · Win rate: <strong>{getMetricValue(report.comparisons.win_rate)}</strong>
          </li>
          <li className="text-sm text-gray-700">
            · Market share (est.): <strong>{getMetricValue(report.comparisons.market_share_estimate)}</strong>
          </li>
          <li className="text-sm text-gray-700">
            · Pricing: {getMetricValue(report.comparisons.pricing_advantage)}
          </li>
        </ul>
      </section>

      {/* SWOT per competitor */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Competitor SWOT
        </h3>
        <div className="space-y-6">
          {report.competitors.length === 0 ? (
            <p className="text-sm text-gray-500">No competitors in report</p>
          ) : (
            report.competitors.map((c) => (
              <Card key={c.company_url} className="rounded-xl border-gray-200 shadow-sm">
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">{c.company_name}</CardTitle>
                  {c.data?.sources?.[0] && <SourceBadge source={c.data.sources[0]} />}
                </CardHeader>
                <CardContent>
                  {!c.data.swot_analysis ? (
                    <p className="text-sm text-gray-500">No SWOT data available</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                        <p className="text-xs font-semibold uppercase text-emerald-700">
                          Strengths
                        </p>
                        <ul className="mt-1 list-inside list-disc text-sm text-gray-700">
                          {(c.data.swot_analysis.strength ?? []).map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                          {(c.data.swot_analysis.strength ?? []).length === 0 && <li>—</li>}
                        </ul>
                      </div>
                      <div className="rounded-lg border border-red-200 bg-red-50/30 p-3">
                        <p className="text-xs font-semibold uppercase text-red-700">
                          Weaknesses
                        </p>
                        <ul className="mt-1 list-inside list-disc text-sm text-gray-700">
                          {(c.data.swot_analysis.weakness ?? []).map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                          {(c.data.swot_analysis.weakness ?? []).length === 0 && <li>—</li>}
                        </ul>
                      </div>
                      <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-3">
                        <p className="text-xs font-semibold uppercase text-blue-700">
                          Opportunities
                        </p>
                        <ul className="mt-1 list-inside list-disc text-sm text-gray-700">
                          {(c.data.swot_analysis.opportunity ?? []).map((o, i) => (
                            <li key={i}>{o}</li>
                          ))}
                          {(c.data.swot_analysis.opportunity ?? []).length === 0 && <li>—</li>}
                        </ul>
                      </div>
                      <div className="rounded-lg border border-amber-200 bg-amber-50/30 p-3">
                        <p className="text-xs font-semibold uppercase text-amber-700">
                          Threats
                        </p>
                        <ul className="mt-1 list-inside list-disc text-sm text-gray-700">
                          {(c.data.swot_analysis.threat ?? []).map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                          {(c.data.swot_analysis.threat ?? []).length === 0 && <li>—</li>}
                        </ul>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
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
