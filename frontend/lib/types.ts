/**
 * TypeScript interfaces matching the backend API response exactly.
 * Backend: FastAPI + Pydantic schemas (schemas.py).
 */

export interface SourceAttribution {
  source_url: string;
  source_type: "pricing_page" | "news_page" | "homepage" | "llm_estimate";
  scraped_at: string;
  confidence?: "high" | "medium" | "low";
}

export interface PricingTier {
  name: string;
  price: string | null;
  features: string[];
  /** Source URL and type this tier was scraped from */
  source?: SourceAttribution | null;
}

export interface NewsItem {
  title: string;
  summary?: string | null;
  url?: string | null;
  date?: string | null;
  /** "scraped" | "discovered" */
  source_type?: string | null;
}

export interface SWOTAnalysis {
  strength?: string[];
  weakness?: string[];
  opportunity?: string[];
  threat?: string[];
}

/** Structured competitor data (extracted by researcher). */
export interface Competitor {
  pricing_tiers: PricingTier[];
  recent_news: NewsItem[];
  feature_list: string[];
  swot_analysis: SWOTAnalysis | null;
  sources?: SourceAttribution[];
}

export interface BaseProfile {
  company_name: string;
  company_url: string;
  pricing_tiers: PricingTier[];
  feature_list: string[];
}

export interface CompetitorProfile {
  company_name: string;
  company_url: string;
  data: Competitor;
}

/** Backend-sourced metric with reasoning (how it was calculated). */
export interface MetricWithReasoning {
  value: string;
  reasoning: string;
  confidence: "high" | "medium" | "low";
  inputs_used: string[];
}

/** Display value for a metric: string (legacy) or MetricWithReasoning from API. */
export type MetricValue = string | MetricWithReasoning;

export function isMetricWithReasoning(
  m: MetricValue | null | undefined
): m is MetricWithReasoning {
  return m != null && typeof m === "object" && "value" in m && "reasoning" in m;
}

export function metricDisplayValue(m: MetricValue | null | undefined): string {
  if (m == null) return "";
  return isMetricWithReasoning(m) ? (m.value ?? "").trim() : String(m).trim();
}

export interface ComparisonSummary {
  summary_text: string;
  win_rate: MetricValue;
  market_share_estimate: MetricValue;
  pricing_advantage: MetricValue;
  total_market_size?: MetricValue | null;
  total_active_users?: MetricValue | null;
  market_segments?: Array<Record<string, string>> | null;
  strategic_recommendations?: Record<string, string[] | { text: string; reasoning?: string }[]> | null;
  data_sources?: SourceAttribution[];
  /** All URLs that fed into this synthesis (base + competitors) */
  sources_used?: string[];
  confidence_note?: string | null;
}

export interface MarketReport {
  base_company_data: BaseProfile;
  competitors: CompetitorProfile[];
  comparisons: ComparisonSummary;
}

export type AnalysisStatus = "processing" | "ready" | "failed";

export type ProgressStatus = "done" | "in_progress" | "pending";

export interface ProgressStep {
  step: string;
  status: ProgressStatus;
  timestamp: string;
}

export interface AnalysisResponse {
  job_id: string;
  status: AnalysisStatus;
  base_url: string | null;
  report: MarketReport | null;
  error: string | null;
  competition_scope?: string | null;
  region?: string | null;
  geographic_scope?: string | null;
  geographic_location?: string | null;
  progress?: ProgressStep[];
}

// --- Monitoring ---

export interface MonitoredCompany {
  id: string;
  base_url: string;
  company_name: string;
  scope: string;
  region: string | null;
  created_at: string;
  last_checked: string | null;
  check_interval_hours: number;
  change_count?: number;
  has_digest?: boolean;
}

export interface ChangeEvent {
  id: string;
  monitored_company_id: string;
  competitor_name: string;
  change_type: string;
  title: string;
  description: string;
  old_value?: string | null;
  new_value?: string | null;
  severity: "critical" | "high" | "medium" | "low";
  detected_at: string;
  source_url?: string | null;
}

export interface ChangesResponse {
  monitor_id: string;
  company_name: string;
  changes: ChangeEvent[];
  last_checked: string | null;
}

/** Deal context for Ask AI — prospect and deal details for tailored guidance */
export interface DealContext {
  prospect_company: string;
  prospect_size: string;
  use_case: string;
  buyer_role: string;
  pain_point: string;
}

// --- Digest ---

export interface DigestSection {
  title: string;
  type: string;
  items: Array<Record<string, unknown>>;
}

export interface Digest {
  monitor_id: string;
  company_name: string;
  period: string;
  executive_summary: string;
  sections: DigestSection[];
  generated_at: string;
}

// --- Intel notes (annotations on analysis) ---

export type NoteType = "comment" | "insight" | "action_item" | "question";

export interface IntelNote {
  id: string;
  job_id: string;
  author: string;
  section: string;
  content: string;
  created_at: string;
  note_type: NoteType;
}

// --- Calculation methodology (transparency for metrics) ---

export type ConfidenceLevel = "high" | "medium" | "low";

export interface CalculationMethodology {
  metric: string;
  methodology: string;
  inputs: { label: string; value: string }[];
  confidence: ConfidenceLevel;
  lastUpdated?: string;
}

// --- Battlecard ---

export interface ObjectionHandler {
  objection: string;
  response: string;
  proof_point: string | null;
}

export interface Battlecard {
  base_company: string;
  competitor: string;
  generated_at: string;
  executive_summary: string;
  why_we_win: string[];
  why_we_lose: string[];
  objection_handlers: ObjectionHandler[];
  pricing_comparison: string;
  feature_advantages: string[];
  feature_gaps: string[];
  killer_questions: string[];
  landmines: string[];
}

// --- Competitive frameworks ---

export type FrameworkType =
  | "positioning_matrix"
  | "pricing_power"
  | "feature_gap"
  | "porters_five"
  | "value_chain";

export interface CompetitiveFramework {
  framework_type: FrameworkType;
  title: string;
  description: string;
  data: Record<string, unknown>;
  generated_at: string;
}
