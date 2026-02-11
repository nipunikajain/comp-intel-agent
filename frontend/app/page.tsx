"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  initAnalysis,
  pollAnalysis,
  startMonitoring,
  getMonitors,
  getMonitorReport,
  type Scope,
} from "@/lib/api";
import type {
  AnalysisResponse,
  MarketReport,
  MonitoredCompany,
  ProgressStep,
} from "@/lib/types";
import { Dashboard } from "@/components/Dashboard";

const POLL_INTERVAL_MS = 1500;

const DEFAULT_PROGRESS_STEPS: ProgressStep[] = [
  { step: "Analyzing base company", status: "pending", timestamp: "" },
  { step: "Discovering competitors", status: "pending", timestamp: "" },
  { step: "Analyzing competitors", status: "pending", timestamp: "" },
  { step: "Generating insights", status: "pending", timestamp: "" },
];

function formatTimestamp(ts: string): string {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
}

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "global", label: "Global" },
  { value: "country", label: "Country" },
  { value: "regional", label: "Regional" },
  { value: "provincial", label: "Provincial" },
];

function regionPlaceholder(scope: Scope): string {
  switch (scope) {
    case "country":
      return "e.g. Canada, United States, United Kingdom";
    case "regional":
      return "e.g. North America, Europe, Asia Pacific";
    case "provincial":
      return "e.g. British Columbia, Ontario, California";
    default:
      return "";
  }
}

const LOADING_STAGES = [
  { atSeconds: 0, label: (company: string) => `Analyzing ${company}...` },
  { atSeconds: 8, label: () => "Discovering competitors..." },
  { atSeconds: 15, label: () => "Scraping competitor data..." },
  { atSeconds: 25, label: () => "Generating market intelligence..." },
];

const LOADING_FUN_FACTS = [
  "Competitive intelligence can reduce strategic surprises by up to 70%.",
  "Companies that track competitors weekly are 2x more likely to hit revenue targets.",
  "Pricing pages change on average every 6–12 months — we catch the latest.",
  "Win/loss analysis is one of the highest-ROI activities in B2B sales.",
  "The best battlecards are updated monthly; we help you stay current.",
];

function companyNameFromUrl(url: string): string {
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    const name = host.replace(/^www\./, "").split(".")[0] || "company";
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  } catch {
    return "your company";
  }
}

function formatDate(ts: string | null): string {
  if (!ts) return "Never";
  try {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts ?? "Never";
  }
}

const RECENT_ANALYSES_KEY = "recentAnalyses";
const RECENT_MAX = 20;

export interface RecentAnalysisEntry {
  jobId: string;
  companyName: string;
  timestamp: string;
  status: string;
}

function getRecentAnalyses(): RecentAnalysisEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_ANALYSES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addToRecentAnalyses(entry: RecentAnalysisEntry) {
  if (typeof window === "undefined") return;
  try {
    const list = getRecentAnalyses().filter((e) => e.jobId !== entry.jobId);
    list.unshift(entry);
    localStorage.setItem(RECENT_ANALYSES_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    // ignore
  }
}

export default function Home() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState("");
  const [scope, setScope] = useState<Scope>("global");
  const [region, setRegion] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<MarketReport | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [monitorId, setMonitorId] = useState<string | null>(null);
  const [monitorForChanges, setMonitorForChanges] = useState(false);
  const [monitors, setMonitors] = useState<MonitoredCompany[]>([]);
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>(DEFAULT_PROGRESS_STEPS);
  const [loadingStage, setLoadingStage] = useState(0);
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const [funFactIndex, setFunFactIndex] = useState(0);
  const [analysisScope, setAnalysisScope] = useState<Scope>("global");
  const [analysisRegion, setAnalysisRegion] = useState<string | null>(null);
  const [recentAnalyses, setRecentAnalyses] = useState<RecentAnalysisEntry[]>([]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const url = baseUrl.trim();
      if (!url) {
        setError("Please enter a company URL");
        return;
      }
      if (scope !== "global" && !region.trim()) {
        setError("Please enter a region");
        return;
      }
      setError(null);
      setStatus("loading");
      setReport(null);
      setJobId(null);
      setProgressSteps(DEFAULT_PROGRESS_STEPS);
      setLoadingStage(0);
      setLoadingElapsed(0);
      setFunFactIndex(0);
      try {
        const id = await initAnalysis(url, {
          scope,
          region: scope === "global" ? null : region.trim() || null,
        });
        setJobId(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start analysis");
        setStatus("failed");
      }
    },
    [baseUrl, scope, region]
  );

  // Time-based loading stage (0s, 8s, 15s, 25s) and fun fact rotation
  useEffect(() => {
    if (status !== "loading") return;
    const stageIntervals = [8000, 7000, 10000]; // 0→1 at 8s, 1→2 at 15s, 2→3 at 25s
    const t1 = setTimeout(() => setLoadingStage(1), stageIntervals[0]);
    const t2 = setTimeout(() => setLoadingStage(2), stageIntervals[0] + stageIntervals[1]);
    const t3 = setTimeout(() => setLoadingStage(3), stageIntervals[0] + stageIntervals[1] + stageIntervals[2]);
    const factInterval = setInterval(() => {
      setFunFactIndex((i) => (i + 1) % LOADING_FUN_FACTS.length);
    }, 5500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearInterval(factInterval);
    };
  }, [status, jobId]);

  useEffect(() => {
    if (!jobId || status !== "loading") return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled) return;
      try {
        const data: AnalysisResponse = await pollAnalysis(jobId);
        if (data.progress && data.progress.length > 0) {
          setProgressSteps(data.progress);
        }
        if (data.status === "ready" && data.report) {
          const companyName =
            data.report.base_company_data?.company_name ??
            companyNameFromUrl(data.report.base_company_data?.company_url ?? "");
          addToRecentAnalyses({
            jobId,
            companyName,
            timestamp: new Date().toISOString(),
            status: "ready",
          });
          setReport(data.report);
          setAnalysisScope((data.geographic_scope as Scope) ?? "global");
          setAnalysisRegion(data.geographic_location ?? data.region ?? null);
          setStatus("ready");
          // If user opted in to monitoring, register this company for change tracking
          if (monitorForChanges && data.report.base_company_data?.company_url) {
            startMonitoring(data.report.base_company_data.company_url, {
              companyName: data.report.base_company_data.company_name ?? undefined,
              scope: (data.geographic_scope as string) ?? "global",
              region: data.region ?? data.geographic_location ?? undefined,
            })
              .then(({ monitor_id }) => {
                setMonitorId(monitor_id);
              })
              .catch(() => {});
          }
          router.push(`/analysis/${jobId}`);
          return;
        }
        if (data.status === "failed") {
          setError(data.error ?? "Analysis failed");
          setStatus("failed");
          return;
        }
        timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to fetch analysis");
          setStatus("failed");
        }
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [jobId, status, monitorForChanges, router]);

  const handleNewAnalysis = useCallback(() => {
    setStatus("idle");
    setReport(null);
    setJobId(null);
    setMonitorId(null);
    setError(null);
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      u.searchParams.delete("monitor_id");
      window.history.replaceState({}, "", u.toString());
    }
  }, []);

  // Load monitors list when idle
  useEffect(() => {
    if (status !== "idle") return;
    getMonitors()
      .then(setMonitors)
      .catch(() => setMonitors([]));
  }, [status]);

  // Load recent analyses from localStorage when landing page is idle (e.g. on mount or when returning)
  useEffect(() => {
    if (status === "idle") setRecentAnalyses(getRecentAnalyses());
  }, [status]);

  // Open dashboard from URL ?monitor_id=... when landing with a saved monitor
  const urlMonitorId = searchParams.get("monitor_id");
  useEffect(() => {
    if (!urlMonitorId || report || status === "loading") return;
    let cancelled = false;
    getMonitorReport(urlMonitorId)
      .then((data) => {
        if (cancelled) return;
        setReport(data.report);
        setMonitorId(data.monitor_id);
        setStatus("ready");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [urlMonitorId]);

  return (
    <main className="min-h-screen w-full bg-white">
      {status !== "ready" && (
        <div className="mx-auto max-w-2xl px-4 py-16 sm:py-24">
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
              Competitive Intelligence
            </h1>
            <p className="mt-2 text-gray-600">
              Real-time competitor tracking & strategic insights
            </p>

            <form onSubmit={handleSubmit} className="mt-10">
              <label htmlFor="base_url" className="sr-only">
                Company URL
              </label>
              <Input
                id="base_url"
                type="url"
                placeholder="Enter company URL (e.g. https://www.sage.com)"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                disabled={status === "loading"}
                className="h-12 rounded-xl border-gray-200 bg-gray-50/50 text-base shadow-sm placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-blue-500"
              />
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-gray-700">Competition Scope</p>
                <div className="flex flex-row flex-wrap items-center gap-3">
                  <select
                    id="scope"
                    value={scope}
                    onChange={(e) => setScope(e.target.value as Scope)}
                    disabled={status === "loading"}
                    className="h-11 rounded-xl border border-gray-200 bg-gray-50/50 px-3 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {SCOPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {scope !== "global" && (
                    <Input
                      id="region"
                      type="text"
                      placeholder={regionPlaceholder(scope)}
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      disabled={status === "loading"}
                      className="h-11 min-w-[200px] rounded-xl border-gray-200 bg-gray-50/50 text-sm shadow-sm placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-w-[280px]"
                    />
                  )}
                </div>
              </div>
              <label className="mt-4 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={monitorForChanges}
                  onChange={(e) => setMonitorForChanges(e.target.checked)}
                  disabled={status === "loading"}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Monitor for changes</span>
              </label>
              <Button
                type="submit"
                disabled={status === "loading"}
                className="mt-4 w-full rounded-xl bg-blue-600 py-6 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:w-auto sm:min-w-[180px]"
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  "Analyze"
                )}
              </Button>
            </form>

            {status === "loading" && (
              <div className="mt-10 w-full max-w-lg mx-auto">
                <p className="mb-3 text-center text-sm text-gray-500">
                  This typically takes 30–60 seconds
                </p>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-700 ease-out"
                    style={{
                      width: `${
                        (progressSteps.filter((s) => s.status === "done").length +
                          (progressSteps.some((s) => s.status === "in_progress") ? 0.5 : 0)) *
                        (100 / 4)
                      }%`,
                    }}
                  />
                </div>
                <div className="mt-4 flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-500" />
                  <p className="text-sm font-medium text-gray-800">
                    {loadingStage === 0
                      ? LOADING_STAGES[0].label(companyNameFromUrl(baseUrl))
                      : LOADING_STAGES[loadingStage].label()}
                  </p>
                </div>
                <ul className="mt-6 space-y-3 text-left">
                  {LOADING_STAGES.map((_, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                        {i < loadingStage ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                            <Check className="h-3 w-3" />
                          </span>
                        ) : i === loadingStage ? (
                          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                        ) : (
                          <Circle className="h-5 w-5 text-gray-300" strokeWidth={2} />
                        )}
                      </span>
                      <span
                        className={
                          i <= loadingStage ? "text-sm font-medium text-gray-800" : "text-sm text-gray-400"
                        }
                      >
                        {i === 0
                          ? `Analyzing ${companyNameFromUrl(baseUrl)}...`
                          : i === 1
                            ? "Discovering competitors..."
                            : i === 2
                              ? "Scraping competitor data..."
                              : "Generating market intelligence..."}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 rounded-lg border border-gray-100 bg-gray-50/80 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Did you know?
                  </p>
                  <p className="mt-1 text-sm text-gray-700">
                    {LOADING_FUN_FACTS[funFactIndex]}
                  </p>
                </div>
              </div>
            )}

            {error && status === "failed" && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50/50 p-4 text-left">
                <p className="text-sm font-medium text-red-800">{error}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 border-red-200 text-red-700 hover:bg-red-100"
                  onClick={() => {
                    setError(null);
                    setStatus("idle");
                  }}
                >
                  Retry
                </Button>
              </div>
            )}

            {status === "idle" && monitors.length > 0 && (
              <section className="mt-14 border-t border-gray-200 pt-10">
                <h2 className="text-lg font-semibold text-gray-900">Monitored Companies</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Click a company to open its latest analysis and change alerts.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {monitors.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={async () => {
                        try {
                          const data = await getMonitorReport(m.id);
                          setReport(data.report);
                          setMonitorId(data.monitor_id);
                          setStatus("ready");
                          if (typeof window !== "undefined") {
                            const u = new URL(window.location.href);
                            u.searchParams.set("monitor_id", data.monitor_id);
                            window.history.replaceState({}, "", u.toString());
                          }
                        } catch {
                          setError("Could not load report for this company.");
                        }
                      }}
                      className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/30"
                    >
                      <div>
                        <p className="font-medium text-gray-900">
                          {m.company_name || new URL(m.base_url).hostname.replace(/^www\./, "")}
                        </p>
                        <p className="text-xs text-gray-500">Last checked: {formatDate(m.last_checked)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {m.has_digest && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                            Digest available
                          </span>
                        )}
                        {(m.change_count ?? 0) > 0 && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            {m.change_count} change{(m.change_count ?? 0) !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {status === "ready" && report && !jobId && (
        <div className="w-full">
          <Dashboard
            report={report}
            jobId={jobId}
            monitorId={monitorId}
            onNewAnalysis={handleNewAnalysis}
            onLoadHistoricalReport={(r) => setReport(r)}
            scope={analysisScope}
            region={analysisRegion}
          />
        </div>
      )}

      {status === "idle" && recentAnalyses.length > 0 && (
        <section className="mx-auto max-w-2xl border-t border-gray-200 px-4 pt-10 pb-16">
          <h2 className="text-lg font-semibold text-gray-900">Recent analyses</h2>
          <p className="mt-1 text-sm text-gray-500">
            Open a previous analysis or share the link with your team.
          </p>
          <ul className="mt-4 space-y-2">
            {recentAnalyses.map((entry) => (
              <li key={entry.jobId}>
                <Link
                  href={`/analysis/${entry.jobId}`}
                  className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 transition hover:border-blue-200 hover:bg-blue-50/30"
                >
                  <div>
                    <p className="font-medium text-gray-900">{entry.companyName || "Analysis"}</p>
                    <p className="text-xs text-gray-500">
                      {formatDate(entry.timestamp)}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 capitalize">
                    {entry.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
