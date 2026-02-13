"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import type { MarketReport, ChangeEvent, IntelNote } from "@/lib/types";
import { getChanges, getHistory, getNotes } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExecutiveTab } from "@/components/tabs/ExecutiveTab";
import { MarketTab } from "@/components/tabs/MarketTab";
import { PricingTab } from "@/components/tabs/PricingTab";
import { CompareTab } from "@/components/tabs/CompareTab";
import { AlertsTab } from "@/components/tabs/AlertsTab";
import { AIInsightsTab } from "@/components/tabs/AIInsightsTab";
import { FrameworksTab } from "@/components/tabs/FrameworksTab";
import { NotesSidebar } from "@/components/NotesSidebar";
import { Bell, History, Loader2, Link2, X, FileText, HelpCircle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { ExportMenu } from "@/components/ExportMenu";

function tabToNoteSection(tab: string): string {
  const t = tab.toLowerCase();
  if (t === "executive") return "executive";
  if (t === "market") return "market";
  if (t === "pricing") return "pricing";
  if (t === "compare") return "compare";
  if (t === "alerts") return "executive";
  if (t === "ai insights") return "executive";
  if (t === "frameworks") return "executive";
  return "executive";
}

function getLatestScrapedAt(report: MarketReport): string | null {
  const all = report.competitors.flatMap((c) => c.data?.sources ?? []);
  const withDate = all.filter((s) => s.scraped_at);
  if (withDate.length === 0) return null;
  const latest = withDate.sort(
    (a, b) => new Date(b.scraped_at).getTime() - new Date(a.scraped_at).getTime()
  )[0];
  return latest?.scraped_at ?? null;
}

function formatDataFreshness(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** @deprecated Prefer scope + region; kept for analysis page compatibility */
export type GeographicScope = "global" | "continent" | "country" | "region";

export interface DashboardProps {
  report: MarketReport;
  /** Current analysis job_id (for Ask AI); optional when report is loaded without job context */
  jobId?: string | null;
  /** When set, show change-detection in Alerts and notification bell with recent changes */
  monitorId?: string | null;
  onNewAnalysis?: () => void;
  /** Scope: global | country | regional | provincial (preferred) */
  scope?: string;
  /** Region name when scope is not global */
  region?: string | null;
  /** @deprecated Use scope */
  competitionScope?: string;
  /** @deprecated Use region */
  geographicScope?: GeographicScope;
  /** @deprecated Use region */
  geographicLocation?: string | null;
  /** When user selects a historical report from the History panel, call this to load it */
  onLoadHistoricalReport?: (report: MarketReport) => void;
}

function scopeBadgeText(scopeOrGeographicScope?: string, regionOrLocation?: string | null): string {
  const scope = (scopeOrGeographicScope ?? "global").toLowerCase();
  const region = (regionOrLocation ?? "").toString().trim() || null;
  if (scope === "global" || !region) return "Global Analysis";
  const label =
    scope === "country"
      ? "Country"
      : scope === "regional"
        ? "Regional"
        : scope === "provincial"
          ? "Provincial"
          : "Regional";
  return `${label}: ${region}`;
}

function useTickerHeadlines(report: MarketReport): string[] {
  return useMemo(() => {
    const headlines: string[] = [];
    for (const comp of report.competitors) {
      for (const news of comp.data.recent_news) {
        if (news.title?.trim()) headlines.push(`${comp.company_name}: ${news.title.trim()}`);
      }
    }
    return headlines.length > 0 ? headlines : ["No competitor headlines yet."];
  }, [report.competitors]);
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function Dashboard({
  report,
  jobId,
  monitorId,
  onNewAnalysis,
  scope: scopeProp,
  region: regionProp,
  competitionScope,
  geographicScope = "global",
  geographicLocation,
  onLoadHistoricalReport,
}: DashboardProps) {
  const companyName = report.base_company_data.company_name;
  const tickerHeadlines = useTickerHeadlines(report);
  const alertsCount = report.competitors.reduce(
    (sum, c) => sum + (c.data.recent_news?.length ?? 0),
    0
  );
  const effectiveScope = scopeProp ?? geographicScope ?? competitionScope ?? "global";
  const effectiveRegion = regionProp ?? geographicLocation ?? null;
  const scopeBadge = scopeBadgeText(effectiveScope, effectiveRegion);
  const latestScraped = getLatestScrapedAt(report);

  const [activeTab, setActiveTab] = useState("Executive");
  const [comparePreselectCompetitor, setComparePreselectCompetitor] = useState<string | null>(null);
  const [recentChanges, setRecentChanges] = useState<ChangeEvent[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [shareToastVisible, setShareToastVisible] = useState(false);
  const shareToastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exportCompetitorName, setExportCompetitorName] = useState<string | null>(null);
  const [historyForJob, setHistoryForJob] = useState<{
    base_url: string;
    analyses: Array<{ timestamp: string; report: MarketReport }>;
  } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [notes, setNotes] = useState<IntelNote[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteSectionPreSelect, setNoteSectionPreSelect] = useState<string>("executive");
  const [methodologyModalOpen, setMethodologyModalOpen] = useState(false);

  useEffect(() => {
    if (!monitorId) {
      setRecentChanges([]);
      return;
    }
    getChanges(monitorId)
      .then((data) => setRecentChanges(data.changes ?? []))
      .catch(() => setRecentChanges([]));
  }, [monitorId]);

  // Fetch analysis history when we have a job (for Executive deltas and History panel)
  useEffect(() => {
    if (!jobId) {
      setHistoryForJob(null);
      return;
    }
    setHistoryLoading(true);
    getHistory(jobId)
      .then(setHistoryForJob)
      .catch(() => setHistoryForJob(null))
      .finally(() => setHistoryLoading(false));
  }, [jobId]);

  // Fetch notes when job changes
  useEffect(() => {
    if (!jobId) {
      setNotes([]);
      return;
    }
    getNotes(jobId)
      .then(setNotes)
      .catch(() => setNotes([]));
  }, [jobId]);

  const openNotesWithSection = useCallback((section: string) => {
    setNoteSectionPreSelect(section);
    setNotesOpen(true);
  }, []);

  const changesLast24h = useMemo(() => {
    const cutoff = Date.now() - ONE_DAY_MS;
    return recentChanges.filter((c) => new Date(c.detected_at).getTime() >= cutoff);
  }, [recentChanges]);

  const fiveRecent = useMemo(
    () => [...recentChanges].sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime()).slice(0, 5),
    [recentChanges]
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    }
    if (bellOpen) document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [bellOpen]);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value);
    if (value !== "Compare") {
      setComparePreselectCompetitor(null);
      setExportCompetitorName(null);
    }
  }, []);

  const handleSwitchToCompare = useCallback((competitorName: string) => {
    setComparePreselectCompetitor(competitorName);
    setActiveTab("Compare");
  }, []);

  const handleSwitchToAlerts = useCallback(() => {
    setActiveTab("Alerts");
  }, []);

  const openHistoryPanel = useCallback(() => {
    setHistoryPanelOpen(true);
  }, []);

  const previousReport = useMemo(() => {
    if (!historyForJob || historyForJob.analyses.length < 2) return null;
    return historyForJob.analyses[historyForJob.analyses.length - 2].report;
  }, [historyForJob]);

  const handleLoadHistoricalReport = useCallback(
    (report: MarketReport) => {
      onLoadHistoricalReport?.(report);
      setHistoryPanelOpen(false);
    },
    [onLoadHistoricalReport]
  );

  const handleCopyLink = useCallback(() => {
    if (!jobId || typeof window === "undefined") return;
    const url = `${window.location.origin}/analysis/${jobId}`;
    navigator.clipboard.writeText(url).then(() => {
      if (shareToastRef.current) clearTimeout(shareToastRef.current);
      setShareToastVisible(true);
      shareToastRef.current = setTimeout(() => {
        setShareToastVisible(false);
        shareToastRef.current = null;
      }, 2500);
    });
  }, [jobId]);

  return (
    <div className="w-full min-h-screen bg-gray-50">
      {/* Share toast */}
      {shareToastVisible && (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-medium text-gray-900">
            Link copied! Share this URL with your team.
          </p>
        </div>
      )}

      {/* Print-only header */}
      <div className="hidden print:block print:mb-4 print:px-4 print:pt-4 print:text-sm print:text-gray-600">
        {companyName} Competitive Intelligence — Printed {new Date().toLocaleDateString()}
      </div>
      {/* Header bar — full width flex row */}
      <header className="no-print sticky top-0 z-10 w-full border-b border-gray-200 bg-white shadow-sm">
        <div className="flex w-full flex-row flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-gray-900 sm:text-xl">
              {companyName} Competitive Intelligence
            </h1>
            <Badge variant="secondary" className="shrink-0 font-medium">
              {scopeBadge}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {monitorId && (
              <div className="relative shrink-0" ref={bellRef}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative rounded-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    setBellOpen((o) => !o);
                  }}
                  aria-label="Recent changes"
                >
                  <Bell className="h-5 w-5 text-gray-600" />
                  {changesLast24h.length > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
                      {changesLast24h.length > 99 ? "99+" : changesLast24h.length}
                    </span>
                  )}
                </Button>
                {bellOpen && (
                  <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-xl border border-gray-200 bg-white py-2 shadow-lg">
                    <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Recent changes
                    </p>
                    {fiveRecent.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-gray-500">No changes yet</p>
                    ) : (
                      <ul className="max-h-64 overflow-y-auto">
                        {fiveRecent.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                              onClick={() => {
                                setActiveTab("Alerts");
                                setBellOpen(false);
                              }}
                            >
                              <span className="font-medium text-gray-900 line-clamp-1">{c.title}</span>
                              <span className="text-xs text-gray-500">
                                {c.competitor_name} · {new Date(c.detected_at).toLocaleDateString()}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-2 border-t border-gray-100 px-3 pt-2">
                      <button
                        type="button"
                        className="text-sm font-medium text-blue-600 hover:text-blue-700"
                        onClick={() => {
                          setActiveTab("Alerts");
                          setBellOpen(false);
                        }}
                      >
                        View all in Alerts
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {latestScraped && (
              <span className="text-xs text-gray-500" title={`Last scraped: ${formatDataFreshness(latestScraped)}`}>
                ℹ️ Data freshness: Scraped {formatDataFreshness(latestScraped)}
              </span>
            )}
            <button
              type="button"
              onClick={() => setMethodologyModalOpen(true)}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              title="How we collect and analyze data"
            >
              <HelpCircle className="h-4 w-4" />
              Methodology
            </button>
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">
              Live Data
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 font-medium"
              onClick={handleSwitchToAlerts}
              title="View alerts"
            >
              Alerts {alertsCount > 0 ? `(${alertsCount})` : ""}
            </Button>
            {jobId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNoteSectionPreSelect(tabToNoteSection(activeTab));
                  setNotesOpen((o) => !o);
                }}
                className="shrink-0"
                title="Notes"
              >
                <FileText className="mr-1.5 h-4 w-4" />
                Notes
                {notes.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1 text-xs">
                    {notes.length > 99 ? "99+" : notes.length}
                  </Badge>
                )}
              </Button>
            )}
            {jobId && onLoadHistoricalReport && (
              <Button variant="outline" size="sm" onClick={openHistoryPanel} className="shrink-0">
                <History className="mr-1.5 h-4 w-4" />
                History
              </Button>
            )}
            {jobId && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                className="shrink-0"
                title="Copy shareable link"
              >
                <Link2 className="mr-1.5 h-4 w-4" />
                Copy link
              </Button>
            )}
            <ExportMenu
              jobId={jobId ?? null}
              currentTab={activeTab}
              competitorName={activeTab === "Compare" ? exportCompetitorName : null}
              variant="outline"
              className="shrink-0"
            />
            {onNewAnalysis && (
              <Button variant="outline" size="sm" onClick={onNewAnalysis}>
                New analysis
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Data Methodology modal */}
      <Dialog
        open={methodologyModalOpen}
        onOpenChange={setMethodologyModalOpen}
        title="Data Methodology"
        className="space-y-5"
      >
        <div className="space-y-4 text-sm text-gray-700">
          <section>
            <h3 className="font-semibold text-gray-900">How we collect data</h3>
            <p>
              Web scraping via Firecrawl, search via Tavily. Competitor and pricing pages are scraped to extract structured data.
            </p>
          </section>
          <section>
            <h3 className="font-semibold text-gray-900">How we analyze</h3>
            <p>
              OpenAI GPT-4o-mini extracts structured data from scraped content (pricing tiers, features, SWOT, news). Comparisons and estimates are derived from this data.
            </p>
          </section>
          <section>
            <h3 className="font-semibold text-gray-900">Confidence levels</h3>
            <ul className="list-inside list-disc space-y-1">
              <li><strong>High</strong> — Directly from scraped data (e.g. pricing, feature lists).</li>
              <li><strong>Medium</strong> — AI-derived from scraped data (e.g. win rate from pricing + features).</li>
              <li><strong>Low</strong> — AI-estimated with limited data (e.g. market size, user counts).</li>
            </ul>
          </section>
          <section>
            <h3 className="font-semibold text-gray-900">Limitations</h3>
            <p>
              Data is as current as the last scrape. Market and user estimates are AI-generated and should be independently verified for business decisions.
            </p>
          </section>
        </div>
      </Dialog>

      {/* History slide-out panel */}
      {historyPanelOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/20"
            aria-hidden
            onClick={() => setHistoryPanelOpen(false)}
          />
          <div className="fixed right-0 top-0 z-40 h-full w-full max-w-md border-l border-gray-200 bg-white shadow-xl sm:max-w-sm">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <h2 className="text-lg font-semibold text-gray-900">Analysis history</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setHistoryPanelOpen(false)}
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {historyLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span>Loading history…</span>
                  </div>
                ) : historyForJob && historyForJob.analyses.length > 0 ? (
                  <ul className="space-y-2">
                    {[...historyForJob.analyses].reverse().map((entry, idx) => {
                      const n = entry.report.competitors?.length ?? 0;
                      const summary = `${n} competitor${n !== 1 ? "s" : ""} analyzed`;
                      const ts = entry.timestamp;
                      const dateStr = (() => {
                        try {
                          return new Date(ts).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          });
                        } catch {
                          return ts;
                        }
                      })();
                      return (
                        <li key={idx}>
                          <button
                            type="button"
                            className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50/30"
                            onClick={() => handleLoadHistoricalReport(entry.report)}
                          >
                            <p className="text-sm font-medium text-gray-900">{dateStr}</p>
                            <p className="mt-0.5 text-xs text-gray-500">{summary}</p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="py-8 text-center text-sm text-gray-500">
                    No past analyses yet. Run more analyses to see history here.
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* News ticker — 100% width */}
      <div
        className="no-print flex w-full items-center gap-3 overflow-hidden border-b border-blue-200 bg-gradient-to-r from-blue-600 to-indigo-700 py-2 text-white"
        aria-label="Competitor news"
      >
        <div className="flex flex-1 min-w-0 w-max animate-ticker gap-8 whitespace-nowrap text-sm font-medium">
          {tickerHeadlines.map((headline, i) => (
            <span key={i} className="shrink-0">
              {headline}
            </span>
          ))}
          {tickerHeadlines.map((headline, i) => (
            <span key={`dup-${i}`} className="shrink-0" aria-hidden>
              {headline}
            </span>
          ))}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSwitchToAlerts}
          className="shrink-0 mr-3 bg-white/20 text-white hover:bg-white/30 border-0"
        >
          View Details
        </Button>
      </div>

      {/* Tab navigation + content — full width container */}
      <div className="max-w-7xl mx-auto w-full px-4 py-6 sm:px-6 lg:px-8">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="no-print mb-6 flex h-auto w-full flex-row flex-nowrap justify-start gap-1 overflow-x-auto rounded-full border border-gray-200 bg-gray-100/80 p-1.5 shadow-inner">
            <TabsTrigger
              value="Executive"
              className="rounded-full px-4 py-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-gray-200"
            >
              Executive
            </TabsTrigger>
            <TabsTrigger
              value="Market"
              className="rounded-full px-4 py-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-gray-200"
            >
              Market
            </TabsTrigger>
            <TabsTrigger
              value="Pricing"
              className="rounded-full px-4 py-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-gray-200"
            >
              Pricing
            </TabsTrigger>
            <TabsTrigger
              value="Compare"
              className="rounded-full px-4 py-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-gray-200"
            >
              Compare
            </TabsTrigger>
            <TabsTrigger
              value="Alerts"
              className="rounded-full px-4 py-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-gray-200"
            >
              Alerts
            </TabsTrigger>
            <TabsTrigger
              value="AI Insights"
              className="rounded-full px-4 py-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-gray-200"
            >
              AI Insights
            </TabsTrigger>
            <TabsTrigger
              value="Frameworks"
              className="rounded-full px-4 py-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-gray-200"
            >
              Frameworks
            </TabsTrigger>
          </TabsList>

          <TabsContent value="Executive" className="mt-0">
            <ExecutiveTab
              report={report}
              previousReport={previousReport}
              previousReportTimestamp={
                historyForJob && historyForJob.analyses.length >= 2
                  ? historyForJob.analyses[historyForJob.analyses.length - 2].timestamp
                  : null
              }
              onSwitchToCompare={handleSwitchToCompare}
              onAddNote={openNotesWithSection}
            />
          </TabsContent>
          <TabsContent value="Market" className="mt-0">
            <MarketTab report={report} onAddNote={openNotesWithSection} />
          </TabsContent>
          <TabsContent value="Pricing" className="mt-0">
            <PricingTab report={report} onAddNote={openNotesWithSection} />
          </TabsContent>
          <TabsContent value="Compare" className="mt-0">
            <CompareTab
              report={report}
              jobId={jobId ?? null}
              initialCompetitorName={comparePreselectCompetitor}
              onPreselectApplied={() => setComparePreselectCompetitor(null)}
              onExportContextChange={setExportCompetitorName}
              onAddNote={openNotesWithSection}
            />
          </TabsContent>
          <TabsContent value="Alerts" className="mt-0">
            <AlertsTab report={report} monitorId={monitorId} jobId={jobId ?? null} />
          </TabsContent>
          <TabsContent value="AI Insights" className="mt-0">
            <AIInsightsTab report={report} jobId={jobId ?? null} />
          </TabsContent>
          <TabsContent value="Frameworks" className="mt-0">
            <FrameworksTab report={report} jobId={jobId ?? null} />
          </TabsContent>
        </Tabs>
      </div>

      {jobId && (
        <NotesSidebar
          jobId={jobId}
          notes={notes}
          onNotesChange={setNotes}
          currentSection={notesOpen ? noteSectionPreSelect : tabToNoteSection(activeTab)}
          isOpen={notesOpen}
          onClose={() => setNotesOpen(false)}
        />
      )}
    </div>
  );
}
