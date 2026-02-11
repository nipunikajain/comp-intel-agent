"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import type { MarketReport, ChangeEvent, Digest } from "@/lib/types";
import { getChanges, getHistoryDiff, refreshMonitor, generateDigest, getLatestDigest } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { SourcesFooter } from "@/components/SourcesFooter";
import { DigestView } from "@/components/DigestView";
import { Loader2, RefreshCw, FileText } from "lucide-react";

const CHANGE_TYPE_ICON: Record<string, string> = {
  pricing_change: "💰",
  new_feature: "⭐",
  news: "📰",
  website_update: "🔄",
  new_competitor: "🆕",
};

function changeTypeIcon(changeType: string): string {
  return CHANGE_TYPE_ICON[changeType] ?? "📌";
}

function severityBorder(severity: ChangeEvent["severity"]): string {
  switch (severity) {
    case "critical":
      return "border-l-4 border-l-red-500";
    case "high":
      return "border-l-4 border-l-orange-500";
    case "medium":
      return "border-l-4 border-l-blue-500";
    case "low":
    default:
      return "border-l-4 border-l-gray-400";
  }
}

function formatDetectedAt(iso: string): string {
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

export interface AlertsTabProps {
  report: MarketReport;
  monitorId?: string | null;
  /** When set, show "Changes Since Last Analysis" from history diff */
  jobId?: string | null;
}

function impactFromTitle(title: string): "Critical" | "Medium" | "Low" {
  const t = title.toLowerCase();
  if (t.includes("price") || t.includes("acquisition") || t.includes("discontinu")) return "Critical";
  if (t.includes("launch") || t.includes("feature") || t.includes("partnership")) return "Medium";
  return "Low";
}

export function AlertsTab({ report, monitorId, jobId }: AlertsTabProps) {
  const [changesData, setChangesData] = useState<{
    changes: ChangeEvent[];
    last_checked: string | null;
    company_name: string;
  } | null>(null);
  const [changesLoading, setChangesLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [historyDiff, setHistoryDiff] = useState<{
    changes: ChangeEvent[];
    previous_timestamp: string | null;
    current_timestamp: string | null;
  } | null>(null);
  const [historyDiffLoading, setHistoryDiffLoading] = useState(false);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestGenerating, setDigestGenerating] = useState(false);

  const fetchChanges = useCallback(async () => {
    if (!monitorId) return;
    setChangesLoading(true);
    try {
      const data = await getChanges(monitorId);
      setChangesData({
        changes: data.changes,
        last_checked: data.last_checked,
        company_name: data.company_name,
      });
    } catch {
      setChangesData(null);
    } finally {
      setChangesLoading(false);
    }
  }, [monitorId]);

  useEffect(() => {
    if (monitorId) fetchChanges();
    else setChangesData(null);
  }, [monitorId, fetchChanges]);

  useEffect(() => {
    if (!jobId) {
      setHistoryDiff(null);
      return;
    }
    setHistoryDiffLoading(true);
    getHistoryDiff(jobId)
      .then(setHistoryDiff)
      .catch(() => setHistoryDiff(null))
      .finally(() => setHistoryDiffLoading(false));
  }, [jobId]);

  const fetchLatestDigest = useCallback(async () => {
    if (!monitorId) return;
    setDigestLoading(true);
    try {
      const d = await getLatestDigest(monitorId);
      setDigest(d);
    } catch {
      setDigest(null);
    } finally {
      setDigestLoading(false);
    }
  }, [monitorId]);

  useEffect(() => {
    if (monitorId) fetchLatestDigest();
    else setDigest(null);
  }, [monitorId, fetchLatestDigest]);

  const handleGenerateDigest = useCallback(async () => {
    if (!monitorId) return;
    setDigestGenerating(true);
    try {
      const d = await generateDigest(monitorId);
      setDigest(d);
    } catch {
      // Keep previous digest state
    } finally {
      setDigestGenerating(false);
    }
  }, [monitorId]);

  const handleRefresh = useCallback(async () => {
    if (!monitorId) return;
    setRefreshLoading(true);
    try {
      await refreshMonitor(monitorId);
      await fetchChanges();
    } finally {
      setRefreshLoading(false);
    }
  }, [monitorId, fetchChanges]);

  const alerts = useMemo(() => {
    const list: Array<{
      date: string;
      company: string;
      title: string;
      summary: string | null;
      url: string | null;
      impact: "Critical" | "Medium" | "Low";
    }> = [];
    report.competitors.forEach((c) => {
      (c.data.recent_news ?? []).forEach((n) => {
        list.push({
          date: n.date ?? "",
          company: c.company_name,
          title: n.title,
          summary: n.summary ?? null,
          url: n.url ?? null,
          impact: impactFromTitle(n.title),
        });
      });
    });
    list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return list;
  }, [report.competitors]);

  const historyDiffHeaderText =
    historyDiff && historyDiff.previous_timestamp && historyDiff.current_timestamp
      ? (() => {
          try {
            const prev = new Date(historyDiff.previous_timestamp).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            const curr = new Date(historyDiff.current_timestamp).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            return `Changes detected between ${prev} and ${curr}`;
          } catch {
            return "Changes since last analysis";
          }
        })()
      : "Changes since last analysis";

  return (
    <div className="w-full space-y-6">
      {jobId && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            {historyDiffHeaderText}
          </h3>
          {historyDiffLoading ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : historyDiff && historyDiff.changes.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {historyDiff.changes.map((ev) => (
                <li key={ev.id}>
                  <Card
                    className={`rounded-xl border-gray-200 shadow-sm transition-shadow hover:shadow-md ${severityBorder(ev.severity)}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-start gap-2">
                        <span className="text-lg" title={ev.change_type}>
                          {changeTypeIcon(ev.change_type)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-gray-900">{ev.title}</p>
                          {ev.description && (
                            <p className="mt-0.5 text-sm text-gray-600">{ev.description}</p>
                          )}
                          {(ev.old_value != null || ev.new_value != null) && (
                            <p className="mt-1 text-xs text-gray-500">
                              {ev.old_value != null && ev.old_value !== "" && (
                                <span className="line-through">{ev.old_value}</span>
                              )}
                              {ev.old_value != null && ev.new_value != null && " → "}
                              {ev.new_value != null && ev.new_value !== "" && (
                                <span className="text-gray-700">{ev.new_value}</span>
                              )}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-gray-400">
                            {ev.competitor_name} · {formatDetectedAt(ev.detected_at)}
                          </p>
                          {ev.source_url && (
                            <a
                              href={ev.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-block text-sm text-blue-600 underline hover:text-blue-700"
                            >
                              Source
                            </a>
                          )}
                        </div>
                        <Badge variant="outline" className="shrink-0 text-xs capitalize">
                          {ev.severity}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          ) : historyDiff ? (
            <p className="mt-3 text-sm text-gray-500">
              No changes between these analyses.
            </p>
          ) : null}
        </section>
      )}

      {monitorId && (
        <section>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Change detection
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshLoading || changesLoading}
              className="shrink-0"
            >
              {refreshLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-1.5">Refresh now</span>
            </Button>
          </div>
          {changesLoading ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading changes…
            </div>
          ) : changesData ? (
            changesData.changes.length === 0 ? (
              <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50/50 p-6 text-center">
                <p className="text-sm text-gray-600">
                  No changes detected yet. We&apos;ll notify you when competitors make moves.
                </p>
              </div>
            ) : (
              <ul className="mt-3 space-y-3">
                {changesData.changes.map((ev) => (
                  <li key={ev.id}>
                    <Card
                      className={`rounded-xl border-gray-200 shadow-sm transition-shadow hover:shadow-md ${severityBorder(ev.severity)}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-start gap-2">
                          <span className="text-lg" title={ev.change_type}>
                            {changeTypeIcon(ev.change_type)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-gray-900">{ev.title}</p>
                            {ev.description && (
                              <p className="mt-0.5 text-sm text-gray-600">{ev.description}</p>
                            )}
                            {(ev.old_value != null || ev.new_value != null) && (
                              <p className="mt-1 text-xs text-gray-500">
                                {ev.old_value != null && ev.old_value !== "" && (
                                  <span className="line-through">{ev.old_value}</span>
                                )}
                                {ev.old_value != null && ev.new_value != null && " → "}
                                {ev.new_value != null && ev.new_value !== "" && (
                                  <span className="text-gray-700">{ev.new_value}</span>
                                )}
                              </p>
                            )}
                            <p className="mt-1 text-xs text-gray-400">
                              {ev.competitor_name} · {formatDetectedAt(ev.detected_at)}
                            </p>
                            {ev.source_url && (
                              <a
                                href={ev.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-block text-sm text-blue-600 underline hover:text-blue-700"
                              >
                                Source
                              </a>
                            )}
                          </div>
                          <Badge variant="outline" className="shrink-0 text-xs capitalize">
                            {ev.severity}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </section>
      )}

      {monitorId && (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Weekly Digest
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateDigest}
              disabled={digestGenerating || digestLoading}
              className="shrink-0"
            >
              {digestGenerating ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-1.5 h-4 w-4" />
              )}
              {digestGenerating ? "Generating…" : "Generate Digest"}
            </Button>
          </div>
          {digestLoading && !digest ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading digest…
            </div>
          ) : digest ? (
            <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <DigestView digest={digest} showActions={true} />
            </div>
          ) : changesData && changesData.changes.length > 0 ? (
            <p className="mt-3 text-sm text-gray-600">
              Your next digest will include {changesData.changes.length} detected change{changesData.changes.length !== 1 ? "s" : ""} and the latest analysis summary. Click &quot;Generate Digest&quot; to create it.
            </p>
          ) : (
            <p className="mt-3 text-sm text-gray-500">
              Generate a briefing that summarizes recent competitive activity, pricing changes, news, and recommendations. Run a refresh first to capture the latest changes.
            </p>
          )}
        </section>
      )}

      <section>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
        Recent alerts
      </h3>
      {alerts.length === 0 ? (
        <EmptyState message="No recent news from competitors" />
      ) : (
        <ul className="space-y-3">
          {alerts.map((a, i) => (
            <li key={i}>
              <Card className="rounded-xl border-gray-200 shadow-sm transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {a.date && (
                        <Badge variant="outline" className="mb-1 text-xs">
                          {a.date}
                        </Badge>
                      )}
                      <p className="font-medium text-gray-900">{a.company}</p>
                      <p className="font-semibold text-gray-900">{a.title}</p>
                      {a.summary && (
                        <p className="mt-0.5 text-sm text-gray-600">{a.summary}</p>
                      )}
                      {a.url && (
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-sm text-blue-600 underline hover:text-blue-700"
                        >
                          Source
                        </a>
                      )}
                    </div>
                    <Badge
                      className={
                        a.impact === "Critical"
                          ? "bg-red-600"
                          : a.impact === "Medium"
                            ? "bg-amber-600"
                            : "bg-gray-500"
                      }
                    >
                      {a.impact}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      </section>
      <SourcesFooter
        sources={report.competitors.flatMap((c) => c.data?.sources ?? [])}
        sourcesUsed={report.comparisons?.sources_used}
      />
    </div>
  );
}
