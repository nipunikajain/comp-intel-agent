"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAnalysis, type GeographicScope } from "@/lib/api";
import type { AnalysisResponse, MarketReport, ProgressStep } from "@/lib/types";
import { Dashboard } from "@/components/Dashboard";

const POLL_INTERVAL_MS = 1500;

const DEFAULT_PROGRESS_STEPS: ProgressStep[] = [
  { step: "Analyzing base company", status: "pending", timestamp: "" },
  { step: "Discovering competitors", status: "pending", timestamp: "" },
  { step: "Analyzing competitors", status: "pending", timestamp: "" },
  { step: "Generating insights", status: "pending", timestamp: "" },
];

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
];

function companyNameFromUrl(url: string): string {
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    const name = host.replace(/^www\./, "").split(".")[0] || "company";
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  } catch {
    return "company";
  }
}

const RECENT_ANALYSES_KEY = "recentAnalyses";
const RECENT_MAX = 20;

function addToRecentAnalyses(entry: {
  jobId: string;
  companyName: string;
  timestamp: string;
  status: string;
}) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(RECENT_ANALYSES_KEY);
    const list: Array<{ jobId: string; companyName: string; timestamp: string; status: string }> = raw
      ? JSON.parse(raw)
      : [];
    const without = list.filter((e) => e.jobId !== entry.jobId);
    without.unshift(entry);
    localStorage.setItem(RECENT_ANALYSES_KEY, JSON.stringify(without.slice(0, RECENT_MAX)));
  } catch {
    // ignore
  }
}

export default function AnalysisPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = typeof params.jobId === "string" ? params.jobId : null;

  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "not_found">("loading");
  const [report, setReport] = useState<MarketReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>(DEFAULT_PROGRESS_STEPS);
  const [loadingStage, setLoadingStage] = useState(0);
  const [funFactIndex, setFunFactIndex] = useState(0);
  const [geographicScope, setGeographicScope] = useState<GeographicScope>("global");
  const [geographicLocation, setGeographicLocation] = useState<string | null>(null);

  const fetchAnalysis = useCallback(async () => {
    if (!jobId) return;
    try {
      const data: AnalysisResponse = await getAnalysis(jobId);
      if (data.status === "ready" && data.report) {
        setReport(data.report);
        setGeographicScope((data.geographic_scope as GeographicScope) ?? "global");
        setGeographicLocation(data.geographic_location ?? null);
        setStatus("ready");
        addToRecentAnalyses({
          jobId,
          companyName: data.report.base_company_data?.company_name ?? companyNameFromUrl(data.report.base_company_data?.company_url ?? ""),
          timestamp: new Date().toISOString(),
          status: "ready",
        });
        return;
      }
      if (data.status === "failed") {
        setError(data.error ?? "Analysis failed");
        setStatus("failed");
        return;
      }
      setBaseUrl(data.base_url ?? "");
      setStatus("loading");
      setProgressSteps(
        data.progress?.length
          ? data.progress.map((p) => (typeof p === "object" && p && "step" in p ? p : DEFAULT_PROGRESS_STEPS[0]))
          : DEFAULT_PROGRESS_STEPS
      );
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        setStatus("not_found");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load analysis");
        setStatus("failed");
      }
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) {
      setStatus("not_found");
      return;
    }
    fetchAnalysis();
  }, [jobId, fetchAnalysis]);

  useEffect(() => {
    if (status !== "loading" || !jobId) return;
    const stageIntervals = [8000, 7000, 10000];
    const t1 = setTimeout(() => setLoadingStage(1), stageIntervals[0]);
    const t2 = setTimeout(() => setLoadingStage(2), stageIntervals[0] + stageIntervals[1]);
    const t3 = setTimeout(() => setLoadingStage(3), stageIntervals[0] + stageIntervals[1] + stageIntervals[2]);
    const factInterval = setInterval(
      () => setFunFactIndex((i) => (i + 1) % LOADING_FUN_FACTS.length),
      5500
    );
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
        const data: AnalysisResponse = await getAnalysis(jobId);
        if (data.progress?.length) setProgressSteps(data.progress);
        if (data.status === "ready" && data.report) {
          setReport(data.report);
          setGeographicScope((data.geographic_scope as GeographicScope) ?? "global");
          setGeographicLocation(data.geographic_location ?? null);
          setStatus("ready");
          addToRecentAnalyses({
            jobId,
            companyName: data.report.base_company_data?.company_name ?? companyNameFromUrl(data.report.base_company_data?.company_url ?? ""),
            timestamp: new Date().toISOString(),
            status: "ready",
          });
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
  }, [jobId, status]);

  const handleNewAnalysis = useCallback(() => {
    router.push("/");
  }, [router]);

  if (status === "not_found") {
    return (
      <main className="min-h-screen w-full bg-white flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-semibold text-gray-900">Analysis not found</h1>
          <p className="mt-2 text-gray-600">
            This analysis may have expired or the link is invalid.
          </p>
          <Button asChild className="mt-6">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (status === "failed") {
    return (
      <main className="min-h-screen w-full bg-white flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-semibold text-gray-900">Analysis failed</h1>
          <p className="mt-2 text-gray-600">{error}</p>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (status === "loading") {
    return (
      <main className="min-h-screen w-full bg-white">
        <div className="mx-auto max-w-2xl px-4 py-16 sm:py-24">
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
              Competitive Intelligence
            </h1>
            <p className="mt-2 text-gray-600">Loading analysis…</p>
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
                    : (LOADING_STAGES[loadingStage] as unknown as { label: () => string }).label()}
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
                <p className="mt-1 text-sm text-gray-700">{LOADING_FUN_FACTS[funFactIndex]}</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (status === "ready" && report) {
    return (
      <div className="w-full">
        <Dashboard
          report={report}
          jobId={jobId}
          onNewAnalysis={handleNewAnalysis}
          onLoadHistoricalReport={(r) => setReport(r)}
          geographicScope={geographicScope}
          geographicLocation={geographicLocation}
        />
      </div>
    );
  }

  return null;
}
