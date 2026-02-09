/**
 * API client for Competitive Intelligence backend.
 * Autonomous workflow: init-analysis (base_url) → poll analysis/{job_id}.
 * Base URL: NEXT_PUBLIC_API_URL or http://localhost:8000
 */

export interface PricingTier {
  name: string;
  price: string | null;
  features: string[];
}

export interface BaseProfile {
  company_name: string;
  company_url: string;
  pricing_tiers: PricingTier[];
  feature_list: string[];
}

export interface CompetitorData {
  pricing_tiers: PricingTier[];
  recent_news: Array<{ title: string; summary?: string | null; url?: string | null; date?: string | null }>;
  feature_list: string[];
  swot_analysis: {
    strength?: string[];
    weakness?: string[];
    opportunity?: string[];
    threat?: string[];
  } | null;
}

export interface CompetitorProfile {
  company_name: string;
  company_url: string;
  data: CompetitorData;
}

export interface ComparisonSummary {
  summary_text: string;
  win_rate: string;
  market_share_estimate: string;
  pricing_advantage: string;
}

export interface MarketReport {
  base_company_data: BaseProfile;
  competitors: CompetitorProfile[];
  comparisons: ComparisonSummary;
}

export interface AnalysisResponse {
  job_id: string;
  status: "processing" | "ready" | "failed";
  base_url: string | null;
  report: MarketReport | null;
  error: string | null;
}

function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

/** Start autonomous market discovery from a base company URL. Returns job_id to poll. */
export async function initAnalysis(baseUrl: string): Promise<{ job_id: string }> {
  const res = await fetch(`${getBaseUrl()}/init-analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base_url: baseUrl }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Failed to start analysis: ${res.status}`);
  }
  return res.json();
}

/** Get analysis status and report. Poll until status is ready or failed. */
export async function getAnalysis(jobId: string): Promise<AnalysisResponse> {
  const res = await fetch(`${getBaseUrl()}/analysis/${jobId}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error("Analysis not found");
    throw new Error(`Failed to fetch analysis: ${res.status}`);
  }
  return res.json();
}
