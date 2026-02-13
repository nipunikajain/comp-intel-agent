/**
 * API client for Competitive Intelligence backend.
 * All requests go to NEXT_PUBLIC_API_URL or http://localhost:8000.
 * Access code is sent in the x-access-code header (from gate session or NEXT_PUBLIC_API_ACCESS_KEY).
 */

import type {
  AnalysisResponse,
  Battlecard,
  ChangeEvent,
  ChangesResponse,
  CompetitiveFramework,
  DealContext,
  Digest,
  IntelNote,
  MarketReport,
  MonitoredCompany,
} from "./types";

const STORED_ACCESS_CODE_KEY = "ci_access_code";

const API_BASE =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
    : process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const API_ACCESS_KEY =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_ACCESS_KEY) || "";

/** Store the access code after successful gate verification (used by PasswordGate). */
export function setStoredAccessCode(code: string): void {
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(STORED_ACCESS_CODE_KEY, code);
    } catch {
      // ignore
    }
  }
}

function getAccessCode(): string {
  if (typeof window !== "undefined") {
    try {
      const stored = sessionStorage.getItem(STORED_ACCESS_CODE_KEY);
      if (stored != null && stored !== "") return stored;
    } catch {
      // ignore
    }
  }
  return API_ACCESS_KEY;
}

/** Headers to send with every API request (x-access-code from stored value or env). */
function apiHeaders(extra: HeadersInit = {}): HeadersInit {
  const base: Record<string, string> = {};
  const code = getAccessCode();
  if (code) base["x-access-code"] = code;
  return { ...base, ...(extra as Record<string, string>) };
}

/** Scope for competitor discovery: global | country | regional | provincial */
export type Scope = "global" | "country" | "regional" | "provincial";

/** @deprecated Use Scope and initAnalysis(..., { scope, region }) */
export type GeographicScope = "global" | "continent" | "country" | "region";

/**
 * Start analysis for a base company URL.
 * @param baseUrl Company URL to analyze.
 * @param options Optional scope and region for geographic scoping.
 * @returns The job_id to use for polling.
 */
export async function initAnalysis(
  baseUrl: string,
  options?: { scope?: Scope; region?: string | null }
): Promise<string> {
  const body: { base_url: string; scope?: string; region?: string | null } = {
    base_url: baseUrl,
  };
  const scope = (options?.scope ?? "global").toLowerCase();
  body.scope = scope;
  if (scope !== "global" && options?.region != null && options.region !== "")
    body.region = options.region ?? null;

  const res = await fetch(`${API_BASE}/init-analysis`, {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Failed to start analysis: ${res.status}`;
    try {
      const body = await res.json();
      if (body.detail) {
        message = typeof body.detail === "string" ? body.detail : body.detail[0]?.msg ?? message;
      }
    } catch {
      // use default message
    }
    throw new Error(message);
  }
  const data = (await res.json()) as { job_id: string };
  return data.job_id;
}

/**
 * Poll analysis status and report.
 * Call every 3 seconds until status is "ready" or "failed".
 */
export async function pollAnalysis(jobId: string): Promise<AnalysisResponse> {
  const res = await fetch(`${API_BASE}/analysis/${jobId}`, {
    headers: apiHeaders(),
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("Analysis not found");
    throw new Error(`Failed to fetch analysis: ${res.status}`);
  }
  const data = (await res.json()) as AnalysisResponse;
  return data;
}

/** Alias for pollAnalysis (GET /analysis/{job_id}). */
export const getAnalysis = pollAnalysis;

export interface AskAIResponse {
  answer: string;
  sources_referenced: string[];
}

function hasDealContext(ctx: DealContext | null | undefined): boolean {
  if (!ctx) return false;
  return !!(
    (ctx.prospect_company && ctx.prospect_company.trim()) ||
    (ctx.prospect_size && ctx.prospect_size.trim()) ||
    (ctx.use_case && ctx.use_case.trim()) ||
    (ctx.buyer_role && ctx.buyer_role.trim()) ||
    (ctx.pain_point && ctx.pain_point.trim())
  );
}

/**
 * Ask a follow-up question about a completed analysis.
 * Pass dealContext for deal-specific guidance (prospect company, size, use case, buyer role, pain point).
 */
export async function askAI(
  jobId: string,
  question: string,
  dealContext?: DealContext | null
): Promise<AskAIResponse> {
  const body: { job_id: string; question: string; deal_context?: DealContext } = {
    job_id: jobId,
    question,
  };
  if (dealContext && hasDealContext(dealContext)) body.deal_context = dealContext;
  const res = await fetch(`${API_BASE}/ask-ai`, {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("Analysis not found or not ready");
    const message = await res.json().catch(() => ({}));
    throw new Error(
      (message as { detail?: string }).detail ?? `Ask AI failed: ${res.status}`
    );
  }
  return res.json() as Promise<AskAIResponse>;
}

// --- Monitoring ---

/**
 * Start monitoring a company (runs initial analysis in background).
 */
export async function startMonitoring(
  baseUrl: string,
  options?: { companyName?: string; scope?: string; region?: string }
): Promise<{ monitor_id: string }> {
  const res = await fetch(`${API_BASE}/monitor`, {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      base_url: baseUrl,
      company_name: options?.companyName ?? null,
      scope: options?.scope ?? "global",
      region: options?.region ?? null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? `Failed to start monitoring: ${res.status}`);
  }
  const data = (await res.json()) as { monitor_id: string };
  return { monitor_id: data.monitor_id };
}

/**
 * Get detected changes for a monitor.
 */
export async function getChanges(monitorId: string): Promise<ChangesResponse> {
  const res = await fetch(`${API_BASE}/monitor/${encodeURIComponent(monitorId)}/changes`, {
    headers: apiHeaders(),
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("Monitor not found");
    throw new Error(`Failed to fetch changes: ${res.status}`);
  }
  return res.json() as Promise<ChangesResponse>;
}

/**
 * List all monitored companies.
 */
export async function getMonitors(): Promise<MonitoredCompany[]> {
  const res = await fetch(`${API_BASE}/monitors`, { headers: apiHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch monitors: ${res.status}`);
  return res.json() as Promise<MonitoredCompany[]>;
}

/**
 * Trigger a refresh (re-analysis and change detection) for a monitor.
 */
export async function refreshMonitor(monitorId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/monitor/${encodeURIComponent(monitorId)}/refresh`, {
    method: "POST",
    headers: apiHeaders(),
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("Monitor not found");
    throw new Error(`Failed to refresh: ${res.status}`);
  }
}

/**
 * Get the latest report for a monitored company (to show dashboard).
 */
export async function getMonitorReport(
  monitorId: string
): Promise<{ monitor_id: string; report: MarketReport }> {
  const res = await fetch(`${API_BASE}/monitor/${encodeURIComponent(monitorId)}/report`, {
    headers: apiHeaders(),
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("Monitor or report not found");
    throw new Error(`Failed to fetch report: ${res.status}`);
  }
  return res.json() as Promise<{ monitor_id: string; report: MarketReport }>;
}

/**
 * Generate a competitive intelligence digest for a monitored company.
 */
export async function generateDigest(monitorId: string): Promise<Digest> {
  const res = await fetch(`${API_BASE}/generate-digest/${encodeURIComponent(monitorId)}`, {
    method: "POST",
    headers: apiHeaders(),
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("Monitor not found");
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string }).detail ?? `Failed to generate digest: ${res.status}`
    );
  }
  return res.json() as Promise<Digest>;
}

/**
 * Get the most recently generated digest for a monitor.
 */
export async function getLatestDigest(monitorId: string): Promise<Digest> {
  const res = await fetch(`${API_BASE}/digest/${encodeURIComponent(monitorId)}/latest`, {
    headers: apiHeaders(),
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("Monitor or digest not found");
    throw new Error(`Failed to fetch digest: ${res.status}`);
  }
  return res.json() as Promise<Digest>;
}

// --- Analysis history (by job_id / base_url) ---

export interface HistoryResponse {
  base_url: string;
  analyses: Array<{ timestamp: string; report: MarketReport }>;
}

export interface HistoryDiffResponse {
  changes: ChangeEvent[];
  previous_timestamp: string | null;
  current_timestamp: string | null;
}

/**
 * Get all past analyses for the same base_url as this job.
 */
export async function getHistory(
  jobId: string
): Promise<{ base_url: string; analyses: Array<{ timestamp: string; report: MarketReport }> }> {
  const res = await fetch(`${API_BASE}/history/${encodeURIComponent(jobId)}`, {
    headers: apiHeaders(),
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("Analysis job not found");
    throw new Error(`Failed to fetch history: ${res.status}`);
  }
  return res.json() as Promise<HistoryResponse>;
}

/**
 * Get changes between the latest two analyses for this job's base_url.
 */
export async function getHistoryDiff(
  jobId: string
): Promise<{
  changes: ChangeEvent[];
  previous_timestamp: string | null;
  current_timestamp: string | null;
}> {
  const res = await fetch(`${API_BASE}/history/${encodeURIComponent(jobId)}/diff`, {
    headers: apiHeaders(),
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("Analysis job not found");
    throw new Error(`Failed to fetch history diff: ${res.status}`);
  }
  return res.json() as Promise<HistoryDiffResponse>;
}

/**
 * Add a note to an analysis.
 */
export async function addNote(
  jobId: string,
  body: { section: string; content: string; author?: string | null; note_type?: string }
): Promise<IntelNote> {
  const res = await fetch(`${API_BASE}/notes/${encodeURIComponent(jobId)}`, {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      section: body.section,
      content: body.content,
      author: body.author ?? undefined,
      note_type: body.note_type ?? "comment",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string }).detail ?? `Failed to add note: ${res.status}`
    );
  }
  return res.json() as Promise<IntelNote>;
}

/**
 * Get all notes for an analysis. Optionally filter by section.
 */
export async function getNotes(
  jobId: string,
  section?: string | null
): Promise<IntelNote[]> {
  const url = new URL(`${API_BASE}/notes/${encodeURIComponent(jobId)}`);
  if (section != null && section !== "") url.searchParams.set("section", section);
  const res = await fetch(url.toString(), { headers: apiHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch notes: ${res.status}`);
  return res.json() as Promise<IntelNote[]>;
}

/**
 * Delete a note.
 */
export async function deleteNote(jobId: string, noteId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/notes/${encodeURIComponent(jobId)}/${encodeURIComponent(noteId)}`,
    { method: "DELETE", headers: apiHeaders() }
  );
  if (!res.ok) {
    if (res.status === 404) throw new Error("Note not found");
    throw new Error(`Failed to delete note: ${res.status}`);
  }
}

/**
 * Generate a sales battlecard for a given analysis job and competitor.
 */
export async function generateBattlecard(
  jobId: string,
  competitorName: string
): Promise<Battlecard> {
  const res = await fetch(`${API_BASE}/generate-battlecard`, {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ job_id: jobId, competitor_name: competitorName }),
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("Analysis or competitor not found");
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string }).detail ?? `Failed to generate battlecard: ${res.status}`
    );
  }
  return res.json() as Promise<Battlecard>;
}

/** Framework types supported by POST /generate-framework */
export const FRAMEWORK_TYPES = [
  "positioning_matrix",
  "pricing_power",
  "feature_gap",
  "porters_five",
  "value_chain",
] as const;

export type FrameworkType = (typeof FRAMEWORK_TYPES)[number];

/**
 * Generate an industry-specific competitive framework from analysis data.
 */
export async function generateFramework(
  jobId: string,
  frameworkType: FrameworkType
): Promise<CompetitiveFramework> {
  const res = await fetch(`${API_BASE}/generate-framework`, {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ job_id: jobId, framework_type: frameworkType }),
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("Analysis not found");
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string }).detail ?? `Failed to generate framework: ${res.status}`
    );
  }
  return res.json() as Promise<CompetitiveFramework>;
}

/**
 * Export a tab's content as markdown, HTML, or PDF (HTML for print).
 * For tab "compare" or "battlecard", pass competitorName.
 */
export async function exportAnalysis(
  jobId: string,
  format: "pdf" | "markdown" | "html",
  tab: string,
  competitorName?: string | null
): Promise<Blob> {
  const params = new URLSearchParams({ format, tab });
  if (competitorName != null && competitorName !== "")
    params.set("competitor_name", competitorName);
  const res = await fetch(
    `${API_BASE}/export/${encodeURIComponent(jobId)}?${params.toString()}`,
    { method: "POST", headers: apiHeaders() }
  );
  if (!res.ok) {
    if (res.status === 404) throw new Error("Analysis not found");
    throw new Error(`Export failed: ${res.status}`);
  }
  const text = await res.text();
  const type = format === "markdown" ? "text/markdown" : "text/html";
  return new Blob([text], { type });
}
