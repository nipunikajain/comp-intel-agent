"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import type { MarketReport, Battlecard } from "@/lib/types";
import { generateBattlecard } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, Loader2, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { SourceBadge } from "@/components/SourceBadge";
import { SourcesFooter } from "@/components/SourcesFooter";
import { ExportMenu } from "@/components/ExportMenu";

export interface CompareTabProps {
  report: MarketReport;
  jobId?: string | null;
  initialCompetitorName?: string | null;
  onPreselectApplied?: () => void;
  /** Called when selected competitor changes (for export context in header) */
  onExportContextChange?: (competitorName: string | null) => void;
  onAddNote?: (section: string) => void;
}

type ViewMode = "Feature Comparison" | "SWOT Analysis" | "Battlecard";

export function CompareTab({ report, jobId, initialCompetitorName, onPreselectApplied, onExportContextChange, onAddNote }: CompareTabProps) {
  const [selectedCompetitorIndex, setSelectedCompetitorIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("Feature Comparison");
  const [battlecard, setBattlecard] = useState<Battlecard | null>(null);
  const [battlecardLoading, setBattlecardLoading] = useState(false);
  const [objectionExpanded, setObjectionExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (initialCompetitorName && report.competitors.length) {
      const i = report.competitors.findIndex((c) => c.company_name === initialCompetitorName);
      if (i >= 0) setSelectedCompetitorIndex(i);
      onPreselectApplied?.();
    }
  }, [initialCompetitorName, report.competitors, onPreselectApplied]);

  const base = report.base_company_data;
  const safeIndex = report.competitors.length
    ? Math.min(selectedCompetitorIndex, report.competitors.length - 1)
    : 0;
  const competitor = report.competitors[safeIndex] ?? null;
  const baseName = base.company_name;
  const compName = competitor?.company_name ?? "—";

  useEffect(() => {
    onExportContextChange?.(compName && compName !== "—" ? compName : null);
  }, [compName, onExportContextChange]);

  const fetchBattlecard = useCallback(async () => {
    if (!jobId || !compName) return;
    setBattlecardLoading(true);
    setBattlecard(null);
    try {
      const card = await generateBattlecard(jobId, compName);
      setBattlecard(card);
    } catch {
      setBattlecard(null);
    } finally {
      setBattlecardLoading(false);
    }
  }, [jobId, compName]);

  useEffect(() => {
    if (viewMode === "Battlecard" && jobId && compName) fetchBattlecard();
    else setBattlecard(null);
  }, [viewMode, jobId, compName, fetchBattlecard]);

  const copyQuestion = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const baseFeatures = useMemo(() => new Set((base.feature_list ?? []).map((f) => f.toLowerCase())), [base.feature_list]);
  const compFeatures = useMemo(
    () => new Set((competitor?.data?.feature_list ?? []).map((f) => f.toLowerCase())),
    [competitor]
  );
  const allFeatures = useMemo(() => {
    const set = new Set<string>();
    (base.feature_list ?? []).forEach((f) => set.add(f));
    (competitor?.data?.feature_list ?? []).forEach((f) => set.add(f));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [base.feature_list, competitor]);

  function getAdvantage(feature: string): string {
    const lower = feature.toLowerCase();
    const hasBase = baseFeatures.has(lower);
    const hasComp = compFeatures.has(lower);
    if (hasBase && hasComp) return "Equal";
    if (hasBase) return baseName;
    return compName;
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900">Competitor Analysis Tool</h3>
          {onAddNote && (
            <button type="button" onClick={() => onAddNote("compare")} className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700" title="Add note" aria-label="Add note">📝</button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-gray-600">Compare against:</label>
          <select
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm"
            value={safeIndex}
            onChange={(e) => setSelectedCompetitorIndex(Number(e.target.value))}
          >
            {report.competitors.map((c, i) => (
              <option key={c.company_url} value={i}>
                {c.company_name}
              </option>
            ))}
            {report.competitors.length === 0 && (
              <option value={0}>No competitors</option>
            )}
          </select>
          {onAddNote && compName && compName !== "—" && (
            <button
              type="button"
              onClick={() => onAddNote(`competitor:${compName}`)}
              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              title="Add note for this competitor"
              aria-label="Add note"
            >
              📝
            </button>
          )}
          <label className="ml-2 text-sm text-gray-600">View:</label>
          <select
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
          >
            <option>Feature Comparison</option>
            <option>SWOT Analysis</option>
            <option>Battlecard</option>
          </select>
          <ExportMenu
            jobId={jobId ?? null}
            currentTab="Compare"
            competitorName={compName !== "—" ? compName : null}
            variant="default"
            className="bg-blue-600 hover:bg-blue-700"
          />
        </div>
      </div>

      {viewMode === "Feature Comparison" && (
        <Card className="w-full rounded-xl border-gray-200 shadow-sm">
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50/50 px-4 py-2 text-xs text-gray-500">
              <span>Feature data:</span>
              {report.base_company_data.company_url && (
                <SourceBadge
                  source={{
                    source_url: report.base_company_data.company_url,
                    source_type: "homepage",
                    scraped_at: "",
                  }}
                />
              )}
              <span className="text-gray-400">·</span>
              {competitor?.data?.sources?.[0] && (
                <SourceBadge source={competitor.data.sources[0]} />
              )}
            </div>
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-left font-semibold text-gray-900">Feature</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-900">{baseName}</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-900">{compName}</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-900">Advantage</th>
                  </tr>
                </thead>
                <tbody>
                  {allFeatures.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                        No feature data available
                      </td>
                    </tr>
                  ) : (
                    allFeatures.map((feature) => {
                      const lower = feature.toLowerCase();
                      const hasBase = baseFeatures.has(lower);
                      const hasComp = compFeatures.has(lower);
                      const advantage = getAdvantage(feature);
                      return (
                        <tr key={feature} className="border-b border-gray-100">
                          <td className="px-4 py-2 font-medium text-gray-900">{feature}</td>
                          <td className="px-4 py-2">
                            {hasBase ? (
                              <Check className="h-5 w-5 text-emerald-600" />
                            ) : (
                              <X className="h-5 w-5 text-red-500" />
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {hasComp ? (
                              <Check className="h-5 w-5 text-emerald-600" />
                            ) : (
                              <X className="h-5 w-5 text-red-500" />
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <Badge
                              variant={advantage === "Equal" ? "secondary" : "default"}
                              className={
                                advantage === baseName
                                  ? "bg-blue-600"
                                  : advantage === compName
                                    ? "bg-amber-600"
                                    : ""
                              }
                            >
                              {advantage}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {viewMode === "SWOT Analysis" && (
        <Card className="rounded-xl border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">{compName} — SWOT</CardTitle>
          </CardHeader>
          <CardContent>
            {!competitor?.data?.swot_analysis ? (
              <p className="text-sm text-gray-500">No SWOT data available</p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500">From scraped data</span>
                  {competitor?.data?.sources?.[0] && (
                    <SourceBadge source={competitor.data.sources[0]} />
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                  <p className="text-xs font-semibold uppercase text-emerald-700">Strengths</p>
                  <ul className="mt-1 list-inside list-disc text-sm text-gray-700">
                    {(competitor.data.swot_analysis.strength ?? []).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                    {(competitor.data.swot_analysis.strength ?? []).length === 0 && (
                      <li>—</li>
                    )}
                  </ul>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50/30 p-4">
                  <p className="text-xs font-semibold uppercase text-red-700">Weaknesses</p>
                  <ul className="mt-1 list-inside list-disc text-sm text-gray-700">
                    {(competitor.data.swot_analysis.weakness ?? []).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                    {(competitor.data.swot_analysis.weakness ?? []).length === 0 && (
                      <li>—</li>
                    )}
                  </ul>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-4">
                  <p className="text-xs font-semibold uppercase text-blue-700">Opportunities</p>
                  <ul className="mt-1 list-inside list-disc text-sm text-gray-700">
                    {(competitor.data.swot_analysis.opportunity ?? []).map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                    {(competitor.data.swot_analysis.opportunity ?? []).length === 0 && (
                      <li>—</li>
                    )}
                  </ul>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50/30 p-4">
                  <p className="text-xs font-semibold uppercase text-amber-700">Threats</p>
                  <ul className="mt-1 list-inside list-disc text-sm text-gray-700">
                    {(competitor.data.swot_analysis.threat ?? []).map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                    {(competitor.data.swot_analysis.threat ?? []).length === 0 && (
                      <li>—</li>
                    )}
                  </ul>
                </div>
              </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {viewMode === "Battlecard" && (
        <div className="battlecard-view space-y-6" data-battlecard-print>
          {!jobId ? (
            <Card className="rounded-xl border-amber-200 bg-amber-50/50">
              <CardContent className="p-6">
                <p className="text-sm text-amber-800">
                  Battlecards are available when viewing an analysis from a shared link or a completed run. Run an analysis or open one from Recent analyses to generate a battlecard.
                </p>
              </CardContent>
            </Card>
          ) : battlecardLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50/50 py-12">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <span className="text-sm font-medium text-gray-600">Generating battlecard…</span>
            </div>
          ) : battlecard ? (
            <>
              {/* Print-only title for PDF */}
              <div className="hidden print:block print:mb-4">
                <h2 className="text-lg font-bold text-gray-900">
                  {battlecard.base_company} vs {battlecard.competitor} — Sales Battlecard
                </h2>
                <p className="text-xs text-gray-500">
                  Generated {new Date(battlecard.generated_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                </p>
              </div>

              <blockquote className="border-l-4 border-blue-600 bg-blue-50/30 py-4 pl-6 pr-4 text-base italic text-gray-800 print:border-gray-400 print:bg-gray-100">
                {battlecard.executive_summary}
              </blockquote>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Card className="rounded-xl border-emerald-200 bg-emerald-50/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold uppercase text-emerald-800">Why we win</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-inside list-disc space-y-1 text-sm text-gray-700">
                      {battlecard.why_we_win.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
                <Card className="rounded-xl border-red-200 bg-red-50/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold uppercase text-red-800">Why we lose</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-inside list-disc space-y-1 text-sm text-gray-700">
                      {battlecard.why_we_lose.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>

              <section>
                <h4 className="mb-2 text-sm font-semibold uppercase text-gray-500">Objection handling</h4>
                <div className="space-y-2">
                  {battlecard.objection_handlers.map((oh, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-gray-200 bg-white overflow-hidden"
                    >
                      <button
                        type="button"
                        className="no-print flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-900 hover:bg-gray-50"
                        onClick={() => setObjectionExpanded(objectionExpanded === i ? null : i)}
                      >
                        <span className="pr-2">When they say: {oh.objection}</span>
                        {objectionExpanded === i ? (
                          <ChevronUp className="h-4 w-4 shrink-0" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0" />
                        )}
                      </button>
                      <div className="hidden print:block px-4 pt-2 text-sm font-medium text-gray-900">
                        When they say: {oh.objection}
                      </div>
                      <div
                        className={`objection-content border-t border-gray-100 px-4 pb-3 pt-2 text-sm text-gray-700 ${
                          objectionExpanded === i ? "block" : "hidden"
                        } print:!block`}
                      >
                        <p><strong>You say:</strong> {oh.response}</p>
                        {oh.proof_point && (
                          <p className="mt-1 text-xs text-gray-500">Proof: {oh.proof_point}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="mb-2 text-sm font-semibold uppercase text-gray-500">Killer questions</h4>
                <ol className="list-decimal list-inside space-y-1.5">
                  {battlecard.killer_questions.map((q, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="shrink-0">{q}</span>
                      <button
                        type="button"
                        className="no-print shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        onClick={() => copyQuestion(q)}
                        title="Copy"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <h4 className="mb-2 text-sm font-semibold uppercase text-gray-500">Landmines to plant</h4>
                <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                  {battlecard.landmines.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </section>

              <Card className="rounded-xl border-gray-200 bg-gray-50/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold uppercase text-gray-500">Pricing position</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-800">{battlecard.pricing_comparison}</p>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">Our feature advantages</h4>
                  <ul className="list-inside list-disc text-sm text-gray-700">
                    {battlecard.feature_advantages.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">Their feature edges</h4>
                  <ul className="list-inside list-disc text-sm text-gray-700">
                    {battlecard.feature_gaps.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          ) : (
            <Card className="rounded-xl border-red-200 bg-red-50/30">
              <CardContent className="p-6">
                <p className="text-sm text-red-800">Failed to generate battlecard. Try again or pick another competitor.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <SourcesFooter
        sources={report.competitors.flatMap((c) => c.data?.sources ?? [])}
        sourcesUsed={report.comparisons?.sources_used}
      />
    </div>
  );
}
