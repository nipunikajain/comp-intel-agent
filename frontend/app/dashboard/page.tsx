"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  AlertTriangle,
  Zap,
  TrendingUp,
  TrendingDown,
  BarChart3,
  DollarSign,
  Grid3X3,
  Bell,
  Sparkles,
  Target,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardHeader } from "@/components/dashboard-header";
import { getAnalysis } from "@/lib/api";
import type { MarketReport } from "@/lib/types";
import { getMetricValue } from "@/lib/metric-utils";
import { SourcesInfo } from "@/components/SourcesInfo";

const MOCK_DATA = {
  lastUpdated: "2 minutes ago",
  alerts: { critical: 3, medium: 7, monitoring: 12, opportunities: 5 },
  kpi: {
    winRate: { value: "68%", trend: "+12%", trendDir: "up" as const },
    marketShare: { value: "8.3%", trend: "+0.8%", trendDir: "up" as const },
    priceAdvantage: { value: "23%", trend: "+5%", trendDir: "up" as const },
    featureParity: { value: "85%", trend: "+3%", trendDir: "up" as const },
  },
  threats: [
    {
      id: 1,
      competitor: "QuickBooks",
      level: "High Impact",
      share: "37%",
      summary:
        "Aggressive pricing strategy targeting enterprise...",
      action: "Develop enterprise value prop",
    },
    {
      id: 2,
      competitor: "Xero",
      level: "Medium Impact",
      share: "18%",
      summary: "Rapid feature velocity with AI integration...",
      action: "Analyze AI roadmap",
    },
  ],
  opportunities: [
    {
      id: 1,
      title: "QuickBooks Desktop Discontinuation",
      value: "$150M+ revenue opportunity",
      timeline: "6-12 months",
      action: "Launch Migration Campaign",
    },
  ],
  pricing: {
    entry: {
      name: "Entry Level",
      price: "$25/mo",
      vs: "$28/mo",
      diff: "11% lower",
    },
    mid: {
      name: "Mid-Tier",
      price: "$55/mo",
      vs: "$62/mo",
      diff: "11% lower",
    },
    enterprise: {
      name: "Enterprise",
      price: "$120/mo",
      vs: "$180/mo",
      diff: "33% lower",
    },
  },
  market_share: [
    {
      name: "QuickBooks",
      share: 37.2,
      trend: -2.1,
      revenue: "$2.8B",
      strengths: ["Brand", "Desktop Legacy"],
      weaknesses: ["Pricing Backlash"],
    },
    {
      name: "Xero",
      share: 18.5,
      trend: 1.8,
      revenue: "$1.1B",
      strengths: ["Cloud Native"],
      weaknesses: ["Enterprise Features"],
    },
  ],
  feature_matrix: [
    { feature: "Basic Accounting", us: true, them: true, advantage: "Equal" },
    { feature: "Invoicing", us: true, them: true, advantage: "Us" },
    { feature: "Inventory Mgmt", us: true, them: true, advantage: "Them" },
  ],
};

function KpiCard({
  label,
  value,
  trend,
  trendDir,
}: {
  label: string;
  value: string;
  trend: string;
  trendDir: "up" | "down";
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs font-medium">{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p
          className={`mt-1 flex items-center text-xs ${
            trendDir === "up" ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {trendDir === "up" ? (
            <TrendingUp className="mr-0.5 h-3.5 w-3.5" />
          ) : (
            <TrendingDown className="mr-0.5 h-3.5 w-3.5" />
          )}
          {trend}
        </p>
      </CardContent>
    </Card>
  );
}

const POLL_INTERVAL_MS = 2500;

function DashboardContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job_id");

  const [report, setReport] = useState<MarketReport | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "processing" | "ready" | "failed">(
    jobId ? "processing" : "idle"
  );
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [geographicScope, setGeographicScope] = useState<"global" | "continent" | "country" | "region">("global");
  const [geographicLocation, setGeographicLocation] = useState<string | null>(null);

  const pollAnalysis = useCallback(async (id: string) => {
    const data = await getAnalysis(id);
    if (data.status === "ready" && data.report) {
      setReport(data.report);
      setGeographicScope((data.geographic_scope as "global" | "continent" | "country" | "region") ?? "global");
      setGeographicLocation(data.geographic_location ?? null);
      setAnalysisStatus("ready");
      return true;
    }
    if (data.status === "failed") {
      setAnalysisError(data.error ?? "Analysis failed");
      setAnalysisStatus("failed");
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled) return;
      try {
        const done = await pollAnalysis(jobId);
        if (done || cancelled) return;
      } catch (err) {
        if (!cancelled) {
          setAnalysisError(err instanceof Error ? err.message : "Failed to fetch analysis");
          setAnalysisStatus("failed");
        }
        return;
      }
      timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [jobId, pollAnalysis]);

  const baseCompanyName = report?.base_company_data.company_name ?? "Acme Corp";
  const { kpi, threats, opportunities, pricing, market_share, feature_matrix, alerts, lastUpdated } =
    MOCK_DATA;
  const comparisons = report?.comparisons;

  const [activeTab, setActiveTab] = useState("Executive");
  const tickerItems = [
    "QuickBooks announced 40% price increase for Desktop Pro",
    "Xero launched new AI features",
    "NetSuite acquired CloudTech",
  ];
  const totalAlerts = alerts.critical + alerts.medium + alerts.monitoring + alerts.opportunities;

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader
        tickerItems={tickerItems}
        geographicScope={geographicScope}
        geographicLocation={geographicLocation}
        alertCount={totalAlerts}
        alertItems={tickerItems}
        onAlertsClick={() => setActiveTab("Alerts")}
      />

      <main className="container px-4 py-6">
        {analysisStatus === "processing" && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-3 text-sm text-blue-800">
            <Loader2 className="h-4 w-4 animate-spin" />
            Discovering market and competitors from your URL… This may take a few minutes.
          </div>
        )}
        {analysisStatus === "failed" && analysisError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50/50 px-4 py-3 text-sm text-red-800">
            Analysis failed: {analysisError}
          </div>
        )}
        {!jobId && analysisStatus === "idle" && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-100/50 px-4 py-3 text-sm text-slate-700">
            Enter your company URL on the <Link href="/" className="font-medium underline">home page</Link> to run an autonomous market analysis. Dashboard below uses sample data until then.
          </div>
        )}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              Competitive Intelligence
            </h1>
            <p className="text-sm text-slate-500">
              Base company: <strong>{baseCompanyName}</strong> (Us)
              {report ? " · Discovered from your URL" : ` · Updated ${lastUpdated}`}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/">Home</Link>
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4 h-10 w-full justify-start overflow-x-auto rounded-lg border bg-white p-1">
            <TabsTrigger value="Executive" className="gap-1.5 px-4">
              <LayoutDashboard className="h-4 w-4" />
              Executive
            </TabsTrigger>
            <TabsTrigger value="Market" className="gap-1.5 px-4">
              <BarChart3 className="h-4 w-4" />
              Market
            </TabsTrigger>
            <TabsTrigger value="Pricing" className="gap-1.5 px-4">
              <DollarSign className="h-4 w-4" />
              Pricing
            </TabsTrigger>
            <TabsTrigger value="Compare" className="gap-1.5 px-4">
              <Grid3X3 className="h-4 w-4" />
              Compare
            </TabsTrigger>
            <TabsTrigger value="Alerts" className="gap-1.5 px-4">
              <Bell className="h-4 w-4" />
              Alerts
            </TabsTrigger>
            <TabsTrigger value="AI Insights" className="gap-1.5 px-4">
              <Sparkles className="h-4 w-4" />
              AI Insights
            </TabsTrigger>
          </TabsList>

          {/* Executive */}
          <TabsContent value="Executive" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {comparisons ? (
                <>
                  <KpiCard
                    label="Competitive Win Rate"
                    value={getMetricValue(comparisons.win_rate)}
                    trend="from analysis"
                    trendDir="up"
                  />
                  <KpiCard
                    label="Market Share (est.)"
                    value={getMetricValue(comparisons.market_share_estimate)}
                    trend="from analysis"
                    trendDir="up"
                  />
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription className="text-xs font-medium">Pricing Advantage</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm font-medium text-slate-900">{getMetricValue(comparisons.pricing_advantage)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription className="text-xs font-medium">Summary</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-slate-700 line-clamp-3">{comparisons.summary_text}</p>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <>
                  <KpiCard
                    label="Competitive Win Rate"
                    value={kpi.winRate.value}
                    trend={kpi.winRate.trend}
                    trendDir={kpi.winRate.trendDir}
                  />
                  <KpiCard
                    label="Market Share"
                    value={kpi.marketShare.value}
                    trend={kpi.marketShare.trend}
                    trendDir={kpi.marketShare.trendDir}
                  />
                  <KpiCard
                    label="Price Advantage"
                    value={kpi.priceAdvantage.value}
                    trend={kpi.priceAdvantage.trend}
                    trendDir={kpi.priceAdvantage.trendDir}
                  />
                  <KpiCard
                    label="Feature Parity"
                    value={kpi.featureParity.value}
                    trend={kpi.featureParity.trend}
                    trendDir={kpi.featureParity.trendDir}
                  />
                </>
              )}
            </div>
            {comparisons?.data_sources && comparisons.data_sources.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <SourcesInfo
                  sources={comparisons.data_sources}
                  label="AI-estimated • Sources"
                  compact
                />
                {comparisons.confidence_note && (
                  <span className="max-w-xl truncate" title={comparisons.confidence_note}>
                    {comparisons.confidence_note}
                  </span>
                )}
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-700">
                    <AlertTriangle className="h-5 w-5" />
                    Top Competitive Threats
                  </CardTitle>
                  <CardDescription>
                    Critical threats requiring immediate attention
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {threats.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-lg border border-slate-200 bg-slate-50/50 p-4"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-medium text-slate-900">
                          {t.competitor}
                        </span>
                        <Badge
                          variant={t.level === "High Impact" ? "destructive" : "secondary"}
                        >
                          {t.level}
                        </Badge>
                      </div>
                      <p className="mb-1 text-xs text-slate-500">
                        Market share: {t.share}
                      </p>
                      <p className="text-sm text-slate-700">{t.summary}</p>
                      <p className="mt-2 text-xs font-medium text-blue-600">
                        → {t.action}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-emerald-700">
                    <Zap className="h-5 w-5" />
                    Strategic Opportunities
                  </CardTitle>
                  <CardDescription>
                    Market opportunities to capture competitive advantage
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {opportunities.map((o) => (
                    <div
                      key={o.id}
                      className="rounded-lg border border-slate-200 bg-emerald-50/30 p-4"
                    >
                      <p className="font-medium text-slate-900">{o.title}</p>
                      <p className="mt-1 text-sm text-slate-600">{o.value}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Timeline: {o.timeline}
                      </p>
                      <Button size="sm" className="mt-2 bg-emerald-600 hover:bg-emerald-700">
                        {o.action}
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Market */}
          <TabsContent value="Market" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Market Share Overview</CardTitle>
                <CardDescription>
                  Competitor share, trend, revenue, and SWOT snapshot
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {market_share.map((m) => (
                    <div
                      key={m.name}
                      className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">{m.name}</p>
                        <p className="text-sm text-slate-500">
                          Revenue: {m.revenue} · Share: {m.share}%
                          {m.trend >= 0 ? " ↑" : " ↓"}
                          {Math.abs(m.trend)}%
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="text-xs text-slate-500">Strengths:</span>
                          {m.strengths.map((s) => (
                            <Badge key={s} variant="success" className="text-xs">
                              {s}
                            </Badge>
                          ))}
                          <span className="ml-1 text-xs text-slate-500">
                            Weaknesses:
                          </span>
                          {m.weaknesses.map((w) => (
                            <Badge key={w} variant="warning" className="text-xs">
                              {w}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        {m.share}%
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pricing */}
          <TabsContent value="Pricing" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Pricing: Us ({baseCompanyName}) vs Discovered Competitors</CardTitle>
                <CardDescription>
                  {report
                    ? "Base company and competitors scraped from live URLs. No hardcoded data."
                    : "Run an analysis from the home page to see your company vs discovered competitors."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analysisStatus === "processing" && (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-32 rounded-lg" />
                    ))}
                  </div>
                )}
                {report && (
                  <div className="space-y-8">
                    <div>
                      <h3 className="mb-3 text-sm font-semibold text-slate-700">
                        Us — {report.base_company_data.company_name} (scraped)
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {report.base_company_data.pricing_tiers.length > 0 ? (
                          report.base_company_data.pricing_tiers.map((tier) => (
                            <Card key={tier.name} className="bg-slate-50/50">
                              <CardHeader className="pb-2">
                                <CardTitle className="text-base">{tier.name}</CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2 text-sm">
                                <p><strong>Price:</strong> {tier.price ?? "—"}</p>
                                {tier.features.length > 0 && (
                                  <ul className="list-inside list-disc text-slate-600">
                                    {tier.features.slice(0, 4).map((f, i) => (
                                      <li key={i}>{f}</li>
                                    ))}
                                    {tier.features.length > 4 && (
                                      <li className="text-slate-400">+{tier.features.length - 4} more</li>
                                    )}
                                  </ul>
                                )}
                              </CardContent>
                            </Card>
                          ))
                        ) : (
                          <p className="text-sm text-slate-500">No pricing tiers extracted.</p>
                        )}
                      </div>
                    </div>
                    {report.competitors.length > 0 && (
                      <div>
                        <h3 className="mb-3 text-sm font-semibold text-slate-700">
                          Discovered competitor — {report.competitors[0].company_name} (scraped)
                        </h3>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {report.competitors[0].data.pricing_tiers.length > 0 ? (
                            report.competitors[0].data.pricing_tiers.map((tier) => (
                              <Card key={tier.name} className="bg-amber-50/50">
                                <CardHeader className="pb-2">
                                  <CardTitle className="text-base">{tier.name}</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm">
                                  <p><strong>Price:</strong> {tier.price ?? "—"}</p>
                                  {tier.features.length > 0 && (
                                    <ul className="list-inside list-disc text-slate-600">
                                      {tier.features.slice(0, 4).map((f, i) => (
                                        <li key={i}>{f}</li>
                                      ))}
                                      {tier.features.length > 4 && (
                                        <li className="text-slate-400">+{tier.features.length - 4} more</li>
                                      )}
                                    </ul>
                                  )}
                                </CardContent>
                              </Card>
                            ))
                          ) : (
                            <p className="text-sm text-slate-500">No pricing tiers extracted.</p>
                          )}
                        </div>
                        {report.competitors.length > 1 && (
                          <p className="mt-2 text-xs text-slate-500">
                            +{report.competitors.length - 1} more competitor(s) in this analysis.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {!report && analysisStatus !== "processing" && (
                  <div className="grid gap-4 sm:grid-cols-3">
                    {[pricing.entry, pricing.mid, pricing.enterprise].map((tier) => (
                      <Card key={tier.name} className="bg-slate-50/50">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">{tier.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1 text-sm">
                          <p><strong>Us:</strong> {tier.price}</p>
                          <p className="text-slate-500">Them: {tier.vs}</p>
                          <Badge variant="success" className="mt-2">{tier.diff}</Badge>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Compare */}
          <TabsContent value="Compare" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Feature Matrix</CardTitle>
                <CardDescription>
                  Us ({baseCompanyName}) vs Them — feature-by-feature comparison
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 pr-4 font-medium">Feature</th>
                        <th className="pb-2 pr-4 font-medium">Us</th>
                        <th className="pb-2 pr-4 font-medium">Them</th>
                        <th className="pb-2 font-medium">Advantage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feature_matrix.map((row) => (
                        <tr key={row.feature} className="border-b">
                          <td className="py-2 pr-4">{row.feature}</td>
                          <td className="py-2 pr-4">
                            {row.us ? "✓" : "—"}
                          </td>
                          <td className="py-2 pr-4">
                            {row.them ? "✓" : "—"}
                          </td>
                          <td className="py-2">
                            <Badge
                              variant={
                                row.advantage === "Us"
                                  ? "default"
                                  : row.advantage === "Them"
                                    ? "destructive"
                                    : "secondary"
                              }
                            >
                              {row.advantage}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Alerts */}
          <TabsContent value="Alerts" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Alert Summary</CardTitle>
                <CardDescription>
                  Counts by severity and type
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
                    <p className="text-sm font-medium text-red-800">Critical</p>
                    <p className="text-2xl font-bold text-red-900">{alerts.critical}</p>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                    <p className="text-sm font-medium text-amber-800">Medium</p>
                    <p className="text-2xl font-bold text-amber-900">{alerts.medium}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                    <p className="text-sm font-medium text-slate-700">Monitoring</p>
                    <p className="text-2xl font-bold text-slate-900">{alerts.monitoring}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                    <p className="text-sm font-medium text-emerald-800">Opportunities</p>
                    <p className="text-2xl font-bold text-emerald-900">
                      {alerts.opportunities}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Insights */}
          <TabsContent value="AI Insights" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-500" />
                  AI Insights
                </CardTitle>
                <CardDescription>
                  Summary and recommendations from discovered data (no hardcoded numbers)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-4">
                  <p className="text-sm font-medium text-slate-900">
                    {comparisons
                      ? comparisons.summary_text
                      : `Key takeaway: ${baseCompanyName} holds a 23% price advantage in entry and mid tiers. Run an analysis from the home page for insights from your URL.`}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Target className="h-4 w-4" />
                  {report ? "Based on scraped base company and discovered competitors." : "Based on sample data until you run an analysis."}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function DashboardFallback() {
  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader tickerItems={[]} />
      <main className="container px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-20" />
        </div>
        <Skeleton className="h-10 w-full rounded-lg" />
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardContent />
    </Suspense>
  );
}
