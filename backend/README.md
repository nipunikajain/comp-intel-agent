# Competitive Intelligence Platform — Backend

FastAPI + LangGraph backend for **autonomous** market discovery from a single base company URL. No hardcoded pricing or competitor lists; the system discovers everything from your URL.

## Tech stack

- **Framework:** FastAPI  
- **Orchestration:** LangGraph (Researcher agent + MarketDiscoveryAgent)  
- **Validation:** Pydantic V2 (MarketReport, BaseProfile, ComparisonSummary, etc.)  
- **Tools:** Tavily (search), Firecrawl (scraping), OpenAI `gpt-4o-mini` via `langchain_openai` for extraction and synthesis  

## Setup

```bash
cd backend
pip install -e .
# or: uv pip install -e .
```

**Where to put `.env`:** The app loads env vars from (in order):

1. **`backend/.env`** — put your `.env` here (same folder as `main.py`). Recommended.
2. **`Comp_intel/.env`** — if you keep keys in the Comp_intel folder, the app will load that too.

Create a `.env` with:

- `OPENAI_API_KEY` — required for extraction and synthesis (uses `gpt-4o-mini` by default; set `OPENAI_EXTRACT_MODEL` to override)
- `TAVILY_API_KEY` — to discover competitor URLs and find pricing pages
- `FIRECRAWL_API_KEY` (or Firecrawl token) — to scrape base and competitor sites

## Run

```bash
uvicorn main:app --reload
```

API docs: http://127.0.0.1:8000/docs

## API

- **`POST /init-analysis`** — Body: `{ "base_url": "https://www.sage.com" }`. Returns `{ "job_id": "..." }`. Triggers the full MarketDiscoveryAgent workflow.
- **`GET /analysis/{job_id}`** — Returns status (`processing` | `ready` | `failed`) and, when ready, the full **MarketReport**:
  - `base_company_data` — Base company profile (name, URL, pricing_tiers, feature_list) scraped from your URL
  - `competitors` — List of discovered competitors (each with company_name, company_url, scraped pricing/features/SWOT)
  - `comparisons` — LLM-generated summary: `summary_text`, `win_rate`, `market_share_estimate`, `pricing_advantage` (all from real scraped data, no hardcoded numbers)

## Architecture

1. **Schemas** (`schemas.py`): `BaseProfile`, `CompetitorProfile`, `ComparisonSummary`, `MarketReport`, plus `InitAnalysisRequest`, `InitAnalysisResponse`, `AnalysisResponse`.
2. **Researcher agent** (`agent.py`): **Search (Tavily) → Scrape (Firecrawl) → Extract (OpenAI)**. Used for both the base company and each discovered competitor.
3. **MarketDiscoveryAgent** (`market_discovery_agent.py`):  
   - **Step A:** Analyze base company — run Researcher on `base_url` → `BaseProfile`.  
   - **Step B:** Discover competitors — Tavily search “Top competitors of [Base Name] pricing” → top 3 URLs.  
   - **Step C:** Analyze competitors — run Researcher on each URL in parallel → list of `CompetitorProfile`.  
   - **Step D:** Synthesize — LLM compares Base vs Competitors → `ComparisonSummary` (win rate, market share estimate, pricing advantage).
4. **API** (`main.py`): In-memory `ANALYSIS_JOBS` keyed by `job_id`. Replace with Supabase/DB when persisting.
