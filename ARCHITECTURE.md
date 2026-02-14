# Competitive Intelligence Platform — Architecture

This document describes the application and its technical architecture.

---

## 1. App description

The **Competitive Intelligence Platform** is an AI-powered SaaS that automates market and competitor research from a single company URL. Users enter their company’s website (e.g. `https://www.sage.com`); the system then:

- **Analyzes the base company** — Scrapes the site (and pricing/news pages), extracts pricing tiers, feature lists, and company profile using LLMs.
- **Discovers competitors** — Uses search (Tavily) and LLM reasoning to find “top competitors of [company]” and their URLs.
- **Analyzes each competitor** — Runs the same scrape-and-extract pipeline on each competitor in parallel.
- **Synthesizes a market report** — An LLM compares base vs competitors and produces win rate, market share estimate, pricing advantage, SWOT-style insights, and recommendations.

Users get a **dashboard** with:

- **Executive** — Key metrics (win rate, market share, price advantage, feature parity), threats, opportunities, action plans.
- **Market** — Market overview, segment leaders.
- **Pricing** — Pricing comparison, recent news, opportunities.
- **Compare** — Side-by-side feature comparison and battlecards per competitor.
- **Alerts** — Change detection over time (pricing/news/SWOT changes).
- **Frameworks** — Generated frameworks (positioning matrix, pricing power, Porter’s Five Forces, etc.).
- **AI Insights** — Follow-up Q&A over the report with optional deal context.

Additional capabilities:

- **Monitoring** — Track companies over time; refresh and detect changes.
- **Digests** — Generate periodic competitive intelligence digests.
- **Notes** — Add intel notes to analyses; export as PDF/Markdown or copy as formatted text (single tab or all tabs).
- **Access control** — Optional API access code (env `API_ACCESS_KEY`); frontend gate validates via `POST /analyze` and stores the code for subsequent requests.

The app is built for consultants and strategy teams who need fast, evidence-based competitive intelligence without manual data gathering.

---

## 2. High-level architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Next.js)                                  │
│  • App Router: /, /dashboard, /analysis/[jobId]                               │
│  • AuthGuard → PasswordGate (access code) → app shell                         │
│  • Dashboard: tabs (Executive, Market, Pricing, Compare, Alerts, etc.)       │
│  • API client (lib/api.ts): x-access-code header, NEXT_PUBLIC_API_URL         │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ HTTPS (CORS: FRONTEND_URL)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (FastAPI)                                   │
│  • Auth: verify_access dependency (x-access-code vs API_ACCESS_KEY)          │
│  • Public: /health, /, /docs, /openapi.json                                  │
│  • Core: POST /init-analysis → background job → GET /analysis/{job_id}        │
│  • Export, monitoring, digests, notes, ask-ai, battlecards, frameworks        │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
          ┌────────────────────────────┼────────────────────────────┐
          ▼                             ▼                            ▼
┌──────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│  LangGraph       │    │  External services    │    │  In-memory stores   │
│  • Researcher    │    │  • Tavily (search)    │    │  • ANALYSIS_JOBS     │
│  • MarketDiscovery│   │  • Firecrawl (scrape)│    │  • MONITORED_*       │
│  • OpenAI        │    │  • OpenAI (extract)   │    │  • INTEL_NOTES, etc. │
└──────────────────┘    └──────────────────────┘    └─────────────────────┘
```

- **Frontend:** Next.js (React), Tailwind, app router. All UI is behind an optional access-code gate; API calls use `NEXT_PUBLIC_API_URL` and send `x-access-code`.
- **Backend:** FastAPI. Protected routes require `x-access-code` matching `API_ACCESS_KEY`. CORS uses `FRONTEND_URL` (and temporarily `*`). Business logic lives in `main.py`, agents in `agent.py` and `market_discovery_agent.py`, schemas in `schemas.py`.
- **Data:** Currently in-memory (e.g. `ANALYSIS_JOBS`, `MONITORED_COMPANIES`). Designed to be replaced by Supabase or another DB for jobs, monitors, notes, and history.

---

## 3. Backend architecture

### 3.1 Entrypoint and middleware

- **File:** `backend/main.py`
- **App:** `FastAPI(..., dependencies=[Depends(verify_access)])` — every route runs `verify_access` unless the path is allowlisted.
- **Allowlisted paths:** `/`, `/health`, `/openapi.json`, and paths starting with `/docs` (no access code required).
- **CORS:** `CORSMiddleware` with `FRONTEND_URL` (and `*` temporarily). Credentials allowed.

### 3.2 Core workflow: analysis

1. **POST /init-analysis**  
   Body: `{ "base_url": "https://...", "scope?", "region?" }`. Creates a `job_id`, stores a row in `ANALYSIS_JOBS` with status `processing`, and starts `run_market_discovery_background(job_id, base_url, ...)` in a background thread.

2. **Background pipeline**  
   `market_discovery_graph` (LangGraph):
   - **Analyze base** — Researcher agent on `base_url` → `BaseProfile`.
   - **Discover competitors** — LLM + Tavily to get competitor names/URLs; optional geographic scope.
   - **Analyze competitors** — Researcher on each URL in parallel → list of `CompetitorProfile`.
   - **Synthesize** — LLM builds `ComparisonSummary` (win rate, market share, pricing advantage, etc.) and assembles `MarketReport`.

3. **GET /analysis/{job_id}**  
   Returns status (`processing` | `ready` | `failed`), progress steps, and when ready the full `MarketReport` (base company, competitors, comparisons).

### 3.3 Agents (LangGraph)

| Module | Graph | Purpose |
|--------|--------|--------|
| `agent.py` | `researcher_graph` | For one URL: **Search** (Tavily: pricing + news pages) → **Scrape** (Firecrawl) → **Extract** (OpenAI) → structured `Competitor` (pricing, features, SWOT, news). |
| `market_discovery_agent.py` | `market_discovery_graph` | **Analyze base** (Researcher) → **Discover competitors** (LLM + Tavily) → **Analyze competitors** (Researcher × N) → **Synthesize** (LLM → `MarketReport`). |

State is passed as TypedDicts (`ResearcherState`, `MarketDiscoveryState`). Progress is reported via an optional callback that updates `ANALYSIS_JOBS[job_id].progress`.

### 3.4 Schemas and data

- **File:** `backend/schemas.py`
- **Core types:** `BaseProfile`, `CompetitorProfile`, `ComparisonSummary`, `MarketReport`, `InitAnalysisRequest`, `InitAnalysisResponse`, `AnalysisResponse`, `ProgressStep`.
- **Supporting:** `Battlecard`, `CompetitiveFramework`, `IntelNote`, `MonitoredCompany`, `ChangeEvent`, `Digest`, etc.
- **Stores (in-memory):** `ANALYSIS_JOBS`, `ANALYSIS_HISTORY`, `MONITORED_COMPANIES`, `CHANGE_EVENTS`, `MONITOR_ANALYSIS_HISTORY`, `DIGESTS`, `INTEL_NOTES`.

### 3.5 Main API surface

| Area | Endpoints |
|------|-----------|
| Health & auth | `GET /health`, `POST /analyze` (gate validation), `GET /` |
| Analysis | `POST /init-analysis`, `GET /analysis/{job_id}` |
| History | `GET /history/{job_id}`, `GET /history/{job_id}/diff` |
| Q&A | `POST /ask-ai` |
| Artifacts | `POST /generate-battlecard`, `POST /generate-framework`, `POST /export/{job_id}` (tab: executive | market | pricing | compare | battlecard | all) |
| Monitoring | `POST /monitor`, `GET /monitors`, `GET /monitor/{id}/changes`, `GET /monitor/{id}/report`, `POST /monitor/{id}/refresh` |
| Digests | `POST /generate-digest/{monitor_id}`, `GET /digest/{monitor_id}/latest` |
| Notes | `POST /notes/{job_id}`, `GET /notes/{job_id}`, `DELETE /notes/{job_id}/{note_id}` |

### 3.6 Change detection and digests

- **change_detector.py** — `detect_changes(old_report, new_report)` compares pricing tiers, news, SWOT; returns a list of `ChangeEvent`.
- Monitors run re-analysis on refresh; changes are stored in `CHANGE_EVENTS` and exposed via `/monitor/{id}/changes`.
- Digests are generated from monitor context and stored in `DIGESTS`; latest via `/digest/{id}/latest`.

---

## 4. Frontend architecture

### 4.1 Routes and layout

- **Layout:** `app/layout.tsx` — `AuthGuard` wraps all pages (session check; if not authenticated, shows `PasswordGate`).
- **Routes:**
  - **`/`** — Home: URL input, scope/region, “Run analysis” and “Start monitoring”. Calls `initAnalysis` (or monitoring), then redirects to `/analysis/[jobId]` or dashboard.
  - **`/analysis/[jobId]`** — Analysis view: polling `pollAnalysis(jobId)`, progress steps, then `Dashboard` with full report (tabs).
  - **`/dashboard`** — Standalone dashboard page (sample/mock data and optional live report from URL params).

### 4.2 Access control

- **AuthGuard** — Reads `sessionStorage` for `ci_authenticated`; if missing, renders `PasswordGate`.
- **PasswordGate** — User enters access code; `POST ${NEXT_PUBLIC_API_URL}/analyze` with header `x-access-code`. On 200, sets session and `setStoredAccessCode(code)`; subsequent API calls use that code via `apiHeaders()` in `lib/api.ts`.

### 4.3 API client

- **File:** `frontend/lib/api.ts`
- **Base URL:** `process.env.NEXT_PUBLIC_API_URL` (e.g. `https://comp-intel-agent-production.up.railway.app`).
- **Headers:** `x-access-code` from `sessionStorage` (after gate) or `NEXT_PUBLIC_API_ACCESS_KEY`.
- **Functions:** `initAnalysis`, `pollAnalysis` / `getAnalysis`, `askAI`, `startMonitoring`, `getMonitors`, `getChanges`, `refreshMonitor`, `getMonitorReport`, `generateDigest`, `getLatestDigest`, `getHistory`, `getHistoryDiff`, `addNote`, `getNotes`, `deleteNote`, `generateBattlecard`, `generateFramework`, `exportAnalysis` (format + tab, including `tab=all` for master export).

### 4.4 Dashboard and tabs

- **Dashboard** (`components/Dashboard.tsx`) — Tabbed UI: Executive, Market, Pricing, Compare, Alerts, Frameworks, AI Insights. Uses `report`, `jobId`, `monitorId`; header shows methodology, Live Data badge, Alerts (clickable to Alerts tab), Notes, History, Copy link, Export menu.
- **Tabs:** Each tab is a component under `components/tabs/`: `ExecutiveTab`, `MarketTab`, `PricingTab`, Compare (in Dashboard), `AlertsTab`, `FrameworksTab`, `AIInsightsTab`. Export menu supports “current tab” and “master export (all tabs)” (PDF, Markdown, copy).
- **Dashboard header** (e.g. `dashboard-header.tsx` on `/dashboard`) — Optional Alerts dropdown (alert count + list + “View full Alerts tab”) and geographic scope.

### 4.5 Types

- **File:** `frontend/lib/types.ts` — Mirrors backend DTOs: `MarketReport`, `AnalysisResponse`, `CompetitiveFramework`, `Digest`, `IntelNote`, etc., for type-safe API usage.

---

## 5. Data flow (typical run)

1. User opens app → AuthGuard shows PasswordGate → user enters code → `POST /analyze` with `x-access-code` → session + stored code.
2. User on `/` enters base URL, scope, region → **POST /init-analysis** → backend creates job, starts MarketDiscovery graph in background, returns `job_id`.
3. Frontend redirects to `/analysis/[jobId]`, polls **GET /analysis/{job_id}** until status is `ready` or `failed`.
4. On `ready`, Dashboard renders `MarketReport`: Executive (KPIs, threats, opportunities), Market, Pricing, Compare, Alerts (change events if monitor), Frameworks (generate on demand), AI Insights (ask-ai).
5. Export: user picks “current tab” or “all tabs” → **POST /export/{job_id}** with `format` and `tab` (or `all`) → PDF (HTML + print) or Markdown download or copy.

---

## 6. Deployment and environment

- **Backend:** Runs as a single FastAPI app (e.g. `uvicorn main:app`). Railway (or similar) sets `PORT`, `API_ACCESS_KEY`, `FRONTEND_URL`, `OPENAI_API_KEY`, `TAVILY_API_KEY`, `FIRECRAWL_API_KEY`. Health check: `GET /health`.
- **Frontend:** Next.js build; Vercel (or similar) sets `NEXT_PUBLIC_API_URL` to the backend URL and optionally `NEXT_PUBLIC_API_ACCESS_KEY`. Access code can also be entered only via the gate (stored in session).
- **CORS:** Backend allows `FRONTEND_URL` (and currently `*`). Frontend and backend must agree on `x-access-code` and `API_ACCESS_KEY` for protected routes.

---

## 7. Summary

| Layer | Technology | Responsibility |
|-------|------------|----------------|
| Frontend | Next.js, React, Tailwind | UI, access gate, dashboard, export, API client |
| Backend | FastAPI | Auth, analysis job lifecycle, export, monitoring, digests, notes, ask-ai, battlecards, frameworks |
| Agents | LangGraph, OpenAI, Tavily, Firecrawl | Researcher (search → scrape → extract), MarketDiscovery (base → discover → analyze competitors → synthesize) |
| Data | In-memory dicts | Jobs, history, monitors, changes, digests, notes (replace with DB for production) |

This architecture keeps the “single URL in → full market report out” flow in one backend service, with a clear split between API, agents, and schemas, and a frontend that can be deployed separately and configured via env vars.
