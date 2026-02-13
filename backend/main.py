"""
FastAPI application for the Competitive Intelligence Platform.
Autonomous workflow: POST /init-analysis (base_url) → GET /analysis/{job_id}.
No hardcoded pricing or competitor lists; everything is discovered from the base URL.
"""

from __future__ import annotations

import json
import os
import re
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from market_discovery_agent import market_discovery_graph
from change_detector import detect_changes
from schemas import (
    AddNoteRequest,
    AnalysisResponse,
    AskAIRequest,
    AskAIResponse,
    Battlecard,
    BattlecardRequest,
    ChangeEvent,
    ChangesResponse,
    CompetitiveFramework,
    Digest,
    DigestSection,
    GenerateFrameworkRequest,
    InitAnalysisRequest,
    InitAnalysisResponse,
    IntelNote,
    MarketReport,
    MonitoredCompany,
    MonitorRequest,
    MonitorResponse,
    ObjectionHandler,
    ProgressStep,
)

_backend_dir = Path(__file__).resolve().parent
load_dotenv(_backend_dir / ".env")
load_dotenv(_backend_dir.parent / "Comp_intel" / ".env")

# Port for uvicorn (Railway sets PORT; use when running via python -m uvicorn or for reference)
port = int(os.environ.get("PORT", "8000"))

# --- In-memory store for analysis jobs (replace with Supabase/DB later) ---

PROGRESS_STEP_NAMES = [
    ("analyze_base", "Analyzing base company"),
    ("discover_competitors", "Discovering competitors"),
    ("analyze_competitors", "Analyzing competitors"),
    ("synthesize", "Generating insights"),
]


def _progress_template() -> list[dict]:
    return [
        {"step": name, "status": "pending", "timestamp": ""}
        for _, name in PROGRESS_STEP_NAMES
    ]


ANALYSIS_JOBS: dict[str, dict] = {}  # job_id -> { status, base_url?, progress?, report?, error? }

# --- Analysis history by base_url (for "what changed over time" views) ---
ANALYSIS_HISTORY: dict[str, list[dict]] = {}  # base_url_normalized -> list of { timestamp, report }

# --- Monitoring: track competitors over time ---
MONITORED_COMPANIES: dict[str, MonitoredCompany] = {}
CHANGE_EVENTS: dict[str, list[ChangeEvent]] = {}  # monitor_id -> list of changes
MONITOR_ANALYSIS_HISTORY: dict[str, list[dict]] = {}  # monitor_id -> list of { timestamp, report }
DIGESTS: dict[str, list[dict]] = {}  # monitor_id -> list of digest dicts (newest last)

# --- Intel notes (user annotations per analysis job) ---
INTEL_NOTES: dict[str, list[IntelNote]] = {}  # job_id -> list of notes


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


API_ACCESS_KEY = (os.getenv("API_ACCESS_KEY") or "").strip()


async def verify_access(request: Request) -> None:
    """Require x-access-code header when API_ACCESS_KEY is set. /health, /docs, /openapi.json and / are allowed without key."""
    path = request.url.path

    if path in ["/", "/health", "/openapi.json"] or path.startswith("/docs"):
        return

    code = (request.headers.get("x-access-code") or "").strip()

    if not API_ACCESS_KEY or code != API_ACCESS_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access code",
        )


app = FastAPI(
    title="Competitive Intelligence API",
    description="Autonomous market discovery from a single base company URL",
    version="0.1.0",
    lifespan=lifespan,
    dependencies=[Depends(verify_access)],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


_cors_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
_frontend_url = (os.getenv("FRONTEND_URL") or "").strip()
if _frontend_url:
    _cors_origins.append(_frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "message": "Competitive Intelligence API",
        "docs": "/docs",
        "redoc": "/redoc",
    }


def _on_progress(job_id: str, step_name: str, status: str) -> None:
    row = ANALYSIS_JOBS.get(job_id)
    if not row or "progress" not in row:
        return
    progress = row["progress"]
    now = datetime.now(timezone.utc).isoformat()
    for i, (_, name) in enumerate(PROGRESS_STEP_NAMES):
        if name == step_name:
            progress[i]["status"] = status
            progress[i]["timestamp"] = now
            break
    row["progress"] = list(progress)


def run_market_discovery_background(
    base_url: str,
    job_id: str,
    scope: str = "global",
    region: str | None = None,
) -> None:
    """
    Run MarketDiscoveryAgent: Analyze Base → Discover Competitors → Analyze Competitors → Synthesize.
    Updates ANALYSIS_JOBS[job_id] with status, progress, and report or error.
    """
    progress = _progress_template()
    progress[0]["status"] = "in_progress"
    progress[0]["timestamp"] = datetime.now(timezone.utc).isoformat()

    ANALYSIS_JOBS[job_id] = {
        "status": "processing",
        "base_url": base_url,
        "scope": scope,
        "region": region,
        "progress": progress,
    }
    def progress_callback(step_name: str, status: str) -> None:
        _on_progress(job_id, step_name, status)

    initial_state = {
        "base_url": base_url,
        "scope": scope,
        "region": region,
        "progress_callback": progress_callback,
    }
    try:
        result = market_discovery_graph.invoke(initial_state)
        report = result.get("market_report")
        err = result.get("error")
        if report is not None:
            ANALYSIS_JOBS[job_id]["status"] = "ready"
            ANALYSIS_JOBS[job_id]["report"] = report
            for p in progress:
                if p["status"] == "in_progress":
                    p["status"] = "done"
                    p["timestamp"] = datetime.now(timezone.utc).isoformat()
            ANALYSIS_JOBS[job_id]["progress"] = progress
            # Store in analysis history by normalized base_url
            if isinstance(report, MarketReport):
                report_dump = report.model_dump()
            else:
                report_dump = report
            key = _normalize_base_url(base_url)
            ANALYSIS_HISTORY.setdefault(key, []).append({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "report": report_dump,
            })
        else:
            ANALYSIS_JOBS[job_id]["status"] = "failed"
            ANALYSIS_JOBS[job_id]["error"] = err or "No report generated"
    except Exception as e:
        ANALYSIS_JOBS[job_id]["status"] = "failed"
        ANALYSIS_JOBS[job_id]["error"] = str(e)


def _normalize_base_url(url: str) -> str:
    """Normalize base URL for history key: lowercase, stripped, no trailing slash."""
    u = (url or "").strip().lower()
    return u.rstrip("/") or u


def _company_name_from_url(url: str) -> str:
    """Derive a display name from base URL (e.g. https://www.sage.com -> Sage)."""
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url if url.startswith("http") else f"https://{url}")
        host = (parsed.netloc or "").lower().replace("www.", "")
        name = host.split(".")[0] if host else "Company"
        return name.capitalize() if name else "Company"
    except Exception:
        return "Company"


def run_market_discovery_for_monitor(
    monitor_id: str,
    base_url: str,
    scope: str = "global",
    region: str | None = None,
) -> None:
    """
    Run market discovery for a monitored company. On success, appends report to
    MONITOR_ANALYSIS_HISTORY[monitor_id] and updates last_checked. If there was a previous
    report, runs change detection and appends to CHANGE_EVENTS[monitor_id].
    """
    initial_state = {
        "base_url": base_url,
        "scope": (scope or "global").strip().lower(),
        "region": (region or "").strip() or None,
        "progress_callback": None,
    }
    try:
        result = market_discovery_graph.invoke(initial_state)
        report = result.get("market_report")
        if report is None:
            return
        if not isinstance(report, MarketReport):
            report = MarketReport.model_validate(report)
        now = datetime.now(timezone.utc).isoformat()
        MONITOR_ANALYSIS_HISTORY.setdefault(monitor_id, [])
        history = MONITOR_ANALYSIS_HISTORY[monitor_id]
        if history:
            old_report = history[-1].get("report")
            if old_report and isinstance(old_report, dict):
                old_report = MarketReport.model_validate(old_report)
            elif old_report is None:
                old_report = None
            if old_report is not None:
                new_events = detect_changes(old_report, report, monitor_id)
                CHANGE_EVENTS.setdefault(monitor_id, []).extend(new_events)
        history.append({"timestamp": now, "report": report.model_dump()})
        # Also append to base_url-keyed history for consistency
        key = _normalize_base_url(base_url)
        ANALYSIS_HISTORY.setdefault(key, []).append({"timestamp": now, "report": report.model_dump()})
        if monitor_id in MONITORED_COMPANIES:
            company = MONITORED_COMPANIES[monitor_id]
            MONITORED_COMPANIES[monitor_id] = company.model_copy(update={"last_checked": now})
    except Exception:
        pass


# --- Endpoints ---


@app.post("/init-analysis", response_model=InitAnalysisResponse)
async def init_analysis(
    body: InitAnalysisRequest,
    background_tasks: BackgroundTasks,
) -> InitAnalysisResponse:
    """
    Start autonomous market discovery from a single base company URL.
    Returns job_id to poll GET /analysis/{job_id}.
    """
    base_url = (body.base_url or "").strip()
    if not base_url:
        raise HTTPException(status_code=400, detail="base_url is required")
    if not base_url.startswith("http://") and not base_url.startswith("https://"):
        base_url = "https://" + base_url

    scope = (body.scope or "global").strip().lower()
    region = (body.region or "").strip() or None

    job_id = str(uuid.uuid4())
    background_tasks.add_task(
        run_market_discovery_background,
        base_url,
        job_id,
        scope,
        region,
    )
    return InitAnalysisResponse(job_id=job_id)


@app.get("/analysis/{job_id}", response_model=AnalysisResponse)
async def get_analysis(job_id: str) -> AnalysisResponse:
    """
    Return analysis status and full report when ready.
    report contains base_company_data, competitors, comparisons (all from discovered data).
    """
    if job_id not in ANALYSIS_JOBS:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    row = ANALYSIS_JOBS[job_id]
    status = row.get("status", "processing")
    report: MarketReport | None = row.get("report")
    progress_raw = row.get("progress", _progress_template())
    progress = [ProgressStep(**p) if isinstance(p, dict) else p for p in progress_raw]
    scope = row.get("scope", "global")
    region = row.get("region")
    return AnalysisResponse(
        job_id=job_id,
        status=status,
        base_url=row.get("base_url"),
        report=report,
        error=row.get("error"),
        competition_scope=scope,
        region=region,
        geographic_scope=scope,
        geographic_location=region,
        progress=progress,
    )


@app.get("/history/{job_id}")
async def get_history(job_id: str) -> dict:
    """
    Return all past analyses for the same base_url as this job.
    Enables "how the competitive landscape has changed over time" views.
    """
    if job_id not in ANALYSIS_JOBS:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    base_url = (ANALYSIS_JOBS[job_id].get("base_url") or "").strip()
    if not base_url:
        return {"base_url": base_url, "analyses": []}
    key = _normalize_base_url(base_url)
    analyses = ANALYSIS_HISTORY.get(key, [])
    return {
        "base_url": base_url,
        "analyses": [{"timestamp": a["timestamp"], "report": a["report"]} for a in analyses],
    }


@app.get("/history/{job_id}/diff")
async def get_history_diff(job_id: str) -> dict:
    """
    Compare the latest two analyses for this job's base_url using change detection.
    Returns changes between the previous and current report.
    """
    if job_id not in ANALYSIS_JOBS:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    base_url = (ANALYSIS_JOBS[job_id].get("base_url") or "").strip()
    if not base_url:
        raise HTTPException(status_code=400, detail="No base_url for this job")
    key = _normalize_base_url(base_url)
    analyses = ANALYSIS_HISTORY.get(key, [])
    if len(analyses) < 2:
        return {
            "changes": [],
            "previous_timestamp": None,
            "current_timestamp": analyses[-1]["timestamp"] if analyses else None,
        }
    prev = analyses[-2]
    curr = analyses[-1]
    old_report = MarketReport.model_validate(prev["report"])
    new_report = MarketReport.model_validate(curr["report"])
    # Use normalized base_url as context id for change events (no monitor_id in job flow)
    changes = detect_changes(old_report, new_report, monitor_id=key)
    return {
        "changes": [e.model_dump() for e in changes],
        "previous_timestamp": prev["timestamp"],
        "current_timestamp": curr["timestamp"],
    }


def _tier_dict(t: object) -> dict:
    if isinstance(t, dict):
        return {"name": t.get("name", ""), "price": t.get("price")}
    return {"name": getattr(t, "name", ""), "price": getattr(t, "price", None)}


def _metric_display(m) -> str:
    """Display value for a metric: MetricWithReasoning.value or plain string."""
    if m is None:
        return ""
    if hasattr(m, "value"):
        return (m.value or "").strip()
    return str(m).strip()


def _report_context(report: MarketReport) -> str:
    """Build a readable context string from the market report for the LLM."""
    base = report.base_company_data
    base_tiers = base.pricing_tiers or []
    parts = [
        "## Base company",
        f"Name: {base.company_name}",
        f"URL: {base.company_url}",
        f"Pricing tiers: {json.dumps([_tier_dict(t) for t in base_tiers])}",
        f"Features: {', '.join(base.feature_list or [])}",
    ]
    for i, cp in enumerate(report.competitors or [], 1):
        data = cp.data
        comp_tiers = data.pricing_tiers or []
        parts.append(f"\n## Competitor {i}: {cp.company_name}")
        parts.append(f"URL: {cp.company_url}")
        parts.append(f"Pricing: {json.dumps([_tier_dict(t) for t in comp_tiers])}")
        parts.append(f"Features: {', '.join(data.feature_list or [])}")
        if data.swot_analysis:
            swot = data.swot_analysis
            strength = swot.get("strength", []) if isinstance(swot, dict) else getattr(swot, "strength", [])
            weakness = swot.get("weakness", []) if isinstance(swot, dict) else getattr(swot, "weakness", [])
            opportunity = swot.get("opportunity", []) if isinstance(swot, dict) else getattr(swot, "opportunity", [])
            threat = swot.get("threat", []) if isinstance(swot, dict) else getattr(swot, "threat", [])
            parts.append(f"SWOT strengths: {strength}")
            parts.append(f"SWOT weaknesses: {weakness}")
            parts.append(f"SWOT opportunities: {opportunity}")
            parts.append(f"SWOT threats: {threat}")
        for n in data.recent_news or []:
            title = n.get("title", "") if isinstance(n, dict) else getattr(n, "title", "")
            summary = n.get("summary", "") if isinstance(n, dict) else getattr(n, "summary", "")
            parts.append(f"News: {title} - {summary or ''}")
    comp = report.comparisons
    parts.append("\n## Comparisons (AI synthesis)")
    parts.append(f"Summary: {comp.summary_text}")
    parts.append(f"Win rate: {_metric_display(comp.win_rate)}")
    parts.append(f"Market share estimate: {_metric_display(comp.market_share_estimate)}")
    parts.append(f"Pricing advantage: {_metric_display(comp.pricing_advantage)}")
    return "\n".join(parts)


def _battlecard_context(report: MarketReport, competitor_name: str) -> str:
    """Build context string for battlecard: base company + the chosen competitor + comparisons."""
    base = report.base_company_data
    base_tiers = base.pricing_tiers or []
    parts = [
        "## Base company (us)",
        f"Name: {base.company_name}",
        f"URL: {base.company_url}",
        f"Pricing tiers: {json.dumps([_tier_dict(t) for t in base_tiers])}",
        f"Features: {', '.join(base.feature_list or [])}",
    ]
    comp_match = None
    for cp in report.competitors or []:
        if (cp.company_name or "").strip().lower() == (competitor_name or "").strip().lower():
            comp_match = cp
            break
    if not comp_match:
        for cp in report.competitors or []:
            if competitor_name and competitor_name.strip().lower() in (cp.company_name or "").lower():
                comp_match = cp
                break
    if comp_match:
        data = comp_match.data
        comp_tiers = data.pricing_tiers or []
        parts.append(f"\n## Competitor (them): {comp_match.company_name}")
        parts.append(f"URL: {comp_match.company_url}")
        parts.append(f"Pricing: {json.dumps([_tier_dict(t) for t in comp_tiers])}")
        parts.append(f"Features: {', '.join(data.feature_list or [])}")
        if data.swot_analysis:
            swot = data.swot_analysis
            for key in ("strength", "weakness", "opportunity", "threat"):
                val = swot.get(key, []) if isinstance(swot, dict) else getattr(swot, key, [])
                parts.append(f"SWOT {key}: {val}")
        for n in data.recent_news or []:
            title = n.get("title", "") if isinstance(n, dict) else getattr(n, "title", "")
            summary = n.get("summary", "") if isinstance(n, dict) else getattr(n, "summary", "")
            parts.append(f"News: {title} - {summary or ''}")
    comp = report.comparisons
    parts.append("\n## Market comparison (AI synthesis)")
    parts.append(f"Summary: {comp.summary_text}")
    parts.append(f"Win rate: {_metric_display(comp.win_rate)}")
    parts.append(f"Market share: {_metric_display(comp.market_share_estimate)}")
    parts.append(f"Pricing advantage: {_metric_display(comp.pricing_advantage)}")
    return "\n".join(parts)


def _extract_urls(text: str) -> list[str]:
    """Extract http(s) URLs from text, deduplicated and in order of appearance."""
    pattern = re.compile(r"https?://[^\s\)\]\"']+")
    seen: set[str] = set()
    out: list[str] = []
    for m in pattern.finditer(text):
        u = m.group(0).rstrip(".,;:)")
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


VALID_FRAMEWORK_TYPES = frozenset(
    {"positioning_matrix", "pricing_power", "feature_gap", "porters_five", "value_chain"}
)


def _generate_framework(report: MarketReport, framework_type: str) -> CompetitiveFramework:
    """Generate an industry-specific competitive framework from report data. Returns CompetitiveFramework."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not set")
    context = _report_context(report)
    base_name = report.base_company_data.company_name if report.base_company_data else "Base company"
    now = datetime.now(timezone.utc).isoformat()

    if framework_type == "positioning_matrix":
        system = (
            "You are a strategy consultant. From the competitive analysis data, produce a 2x2 positioning matrix. "
            "Choose axes that best differentiate the players (e.g. Price vs Feature Richness, Ease of Use vs Power). "
            "Return ONLY valid JSON (no markdown) with this exact structure: "
            '{"title": "string", "description": "string", "axes": {"x": "axis label", "y": "axis label"}, '
            '"companies": [{"name": "company name", "x_score": 1-10, "y_score": 1-10, "bubble_size": "small|medium|large"}]}'
        )
        user = f"Analysis data:\n\n{context}\n\nInclude the base company ({base_name}) and all competitors. Return only the JSON object."
    elif framework_type == "pricing_power":
        system = (
            "You are a pricing strategist. Analyze each company's pricing power (1-100) based on features, market position, switching costs. "
            "Return ONLY valid JSON (no markdown) with this exact structure: "
            '{"title": "string", "description": "string", "companies": [{"name": "string", "score": 1-100, "factors": ["str", "str"]}], "insights": "string"}'
        )
        user = f"Analysis data:\n\n{context}\n\nInclude base company and all competitors. Return only the JSON object."
    elif framework_type == "feature_gap":
        system = (
            "You are a product strategist. Build a systematic feature comparison across all companies. "
            "Group features into categories (e.g. Core Accounting, Reporting, Integrations). For each feature, indicate which companies have it (true/false). "
            "Return ONLY valid JSON (no markdown) with this exact structure: "
            '{"title": "string", "description": "string", "categories": [{"name": "category name", "features": [{"name": "feature name", "companies": {"Company A": true, "Company B": false}}]}]}'
        )
        user = f"Analysis data:\n\n{context}\n\nUse exact company names from the data. Return only the JSON object."
    elif framework_type == "porters_five":
        system = (
            "You are a strategy consultant. Produce a Porter's Five Forces analysis for this industry/market. "
            "Return ONLY valid JSON (no markdown) with this exact structure: "
            '{"title": "string", "description": "string", "forces": [{"name": "force name (e.g. Threat of New Entrants)", "intensity": "high|medium|low", "factors": ["str", "str"]}]} '
            "Exactly 5 forces: Threat of New Entrants, Bargaining Power of Suppliers, Bargaining Power of Buyers, Threat of Substitutes, Competitive Rivalry."
        )
        user = f"Analysis data:\n\n{context}\n\nReturn only the JSON object."
    elif framework_type == "value_chain":
        system = (
            "You are a strategy consultant. Map where each competitor focuses across the value chain (e.g. R&D, Marketing, Sales, Support, Operations). "
            "Return ONLY valid JSON (no markdown) with this exact structure: "
            '{"title": "string", "description": "string", "stages": [{"name": "stage name", "companies": [{"name": "company", "strength": "strong|medium|weak"}]}]}'
        )
        user = f"Analysis data:\n\n{context}\n\nInclude base company and all competitors. Return only the JSON object."
    else:
        raise HTTPException(status_code=400, detail=f"Invalid framework_type: {framework_type}")

    llm = ChatOpenAI(model=os.getenv("OPENAI_EXTRACT_MODEL", "gpt-4o-mini"), temperature=0.1, api_key=api_key)
    response = llm.invoke([SystemMessage(content=system), HumanMessage(content=user)])
    text = (response.content or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        raw = json.loads(text)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Framework LLM returned invalid JSON: {e}") from e

    title = raw.get("title") or f"{framework_type.replace('_', ' ').title()} Analysis"
    description = raw.get("description") or "Generated from competitive analysis."
    data = {k: v for k, v in raw.items() if k not in ("title", "description")}
    if framework_type == "positioning_matrix" and "axes" in raw and "companies" in raw:
        data = {"axes": raw["axes"], "companies": raw["companies"]}
    elif framework_type == "pricing_power" and "companies" in raw:
        data = {"companies": raw["companies"], "insights": raw.get("insights", "")}
    elif framework_type == "feature_gap" and "categories" in raw:
        data = {"categories": raw["categories"]}
    elif framework_type == "porters_five" and "forces" in raw:
        data = {"forces": raw["forces"]}
    elif framework_type == "value_chain" and "stages" in raw:
        data = {"stages": raw["stages"]}

    return CompetitiveFramework(
        framework_type=framework_type,
        title=title,
        description=description,
        data=data,
        generated_at=now,
    )


@app.post("/ask-ai", response_model=AskAIResponse)
async def ask_ai(body: AskAIRequest) -> AskAIResponse:
    """
    Ask a follow-up question about a completed analysis. Uses the stored report as context.
    """
    if body.job_id not in ANALYSIS_JOBS:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    row = ANALYSIS_JOBS[body.job_id]
    if row.get("status") != "ready":
        raise HTTPException(
            status_code=404,
            detail="Analysis not ready; only completed analyses can be queried",
        )
    report = row.get("report")
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    if not isinstance(report, MarketReport):
        report = MarketReport.model_validate(report)

    report_context = _report_context(report)
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not set")

    ctx = body.deal_context
    has_deal_context = (
        ctx is not None
        and (
            (ctx.prospect_company or "").strip()
            or (ctx.prospect_size or "").strip()
            or (ctx.use_case or "").strip()
            or (ctx.buyer_role or "").strip()
            or (ctx.pain_point or "").strip()
        )
    )
    if has_deal_context:
        company = (ctx.prospect_company or "").strip() or "this prospect"
        size = (ctx.prospect_size or "").strip() or "unspecified size"
        use_case = (ctx.use_case or "").strip() or "general use case"
        role = (ctx.buyer_role or "").strip() or "the buyer"
        pain = (ctx.pain_point or "").strip() or "general fit"
        system_prompt = (
            "You are a competitive intelligence analyst helping a sales rep in a specific deal.\n\n"
            "DEAL CONTEXT:\n"
            f"- Prospect: {company} ({size} employees)\n"
            f"- Use case: {use_case}\n"
            f"- Buyer role: {role}\n"
            f"- Their pain point: {pain}\n\n"
            "Based on this deal context AND the competitive analysis below, give deal-specific, actionable guidance. "
            "Reference specific features, pricing, or positioning that matter to this buyer role. "
            "Be tactical — this rep needs to win this deal. "
            "Base your answer on the following analysis data; if the data doesn't contain enough, say so and still give actionable guidance."
        )
    else:
        system_prompt = (
            "You are a competitive intelligence analyst. Answer the user's question based ONLY on the following analysis data. "
            "If the data doesn't contain enough information to answer, say so. "
            "Always reference which competitor or data point you're drawing from. Be specific and actionable."
        )
    user_content = f"Analysis data:\n\n{report_context}\n\n---\n\nUser question: {body.question}"

    model_name = os.getenv("OPENAI_EXTRACT_MODEL", "gpt-4o-mini")
    llm = ChatOpenAI(model=model_name, temperature=0.1, api_key=api_key)
    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_content),
    ])
    answer = (response.content or "").strip() if hasattr(response, "content") else ""

    sources_referenced = _extract_urls(answer)
    return AskAIResponse(answer=answer, sources_referenced=sources_referenced)


BATTLECARD_JSON_INSTRUCTIONS = """
Respond with a single JSON object (no markdown, no code fence) with exactly these keys:
- base_company (string): our company name
- competitor (string): the competitor name
- generated_at (string): current ISO timestamp
- executive_summary (string): 2-3 sentence positioning statement
- why_we_win (array of strings): 3-5 reasons we win
- why_we_lose (array of strings): 3-5 reasons we might lose
- objection_handlers (array of objects): each with objection, response, proof_point (optional)
- pricing_comparison (string): brief pricing positioning
- feature_advantages (array of strings): features where we have an edge
- feature_gaps (array of strings): features where competitor has an edge
- killer_questions (array of strings): questions to expose competitor weaknesses
- landmines (array of strings): points to plant early that disadvantage the competitor
"""


@app.post("/generate-battlecard", response_model=Battlecard)
async def generate_battlecard(body: BattlecardRequest) -> Battlecard:
    """
    Generate a sales battlecard for the given job and competitor.
    Uses the stored MarketReport and LLM to produce a structured battlecard.
    """
    if body.job_id not in ANALYSIS_JOBS:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    row = ANALYSIS_JOBS[body.job_id]
    if row.get("status") != "ready":
        raise HTTPException(
            status_code=400,
            detail="Analysis not ready; only completed analyses can generate battlecards",
        )
    report = row.get("report")
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    if not isinstance(report, MarketReport):
        report = MarketReport.model_validate(report)

    competitor_names = [c.company_name for c in (report.competitors or []) if c.company_name]
    if not any(
        (body.competitor_name or "").strip().lower() == (n or "").lower()
        or ((body.competitor_name or "").strip().lower() in (n or "").lower())
        for n in competitor_names
    ):
        raise HTTPException(
            status_code=404,
            detail=f"Competitor '{body.competitor_name}' not found in this analysis",
        )

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not set")

    context = _battlecard_context(report, body.competitor_name)
    base_name = report.base_company_data.company_name or "Us"
    comp_name = (body.competitor_name or "").strip() or "Competitor"
    now = datetime.now(timezone.utc).isoformat()

    system_prompt = (
        "You are an elite sales enablement strategist. Generate a comprehensive battlecard that a sales rep can use to win deals against this competitor. "
        "Be specific, actionable, and direct. Every point should be something a rep can actually say in a call. "
        "Use only the provided competitive data. Output valid JSON only."
    )
    user_content = (
        f"Competitive data:\n\n{context}\n\n---\n\n"
        f"Generate a battlecard: {base_name} vs {comp_name}. "
        f"Set generated_at to: {now}\n{BATTLECARD_JSON_INSTRUCTIONS}"
    )

    model_name = os.getenv("OPENAI_EXTRACT_MODEL", "gpt-4o-mini")
    llm = ChatOpenAI(model=model_name, temperature=0.2, api_key=api_key)
    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_content),
    ])
    raw = (response.content or "").strip() if hasattr(response, "content") else ""
    # Strip markdown code block if present
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1] if "\n" in raw else raw[3:]
    if raw.endswith("```"):
        raw = raw.rsplit("```", 1)[0].strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"LLM did not return valid JSON: {e}") from e
    data.setdefault("base_company", base_name)
    data.setdefault("competitor", comp_name)
    data.setdefault("generated_at", now)
    for list_key in ("why_we_win", "why_we_lose", "feature_advantages", "feature_gaps", "killer_questions", "landmines"):
        if list_key not in data or not isinstance(data[list_key], list):
            data[list_key] = []
    if "objection_handlers" not in data or not isinstance(data["objection_handlers"], list):
        data["objection_handlers"] = []
    for i, oh in enumerate(data["objection_handlers"]):
        if isinstance(oh, dict):
            data["objection_handlers"][i] = {
                "objection": oh.get("objection", ""),
                "response": oh.get("response", ""),
                "proof_point": oh.get("proof_point"),
            }
    try:
        return Battlecard.model_validate(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Battlecard validation failed: {e}") from e


@app.post("/generate-framework", response_model=CompetitiveFramework)
async def generate_framework(body: GenerateFrameworkRequest) -> CompetitiveFramework:
    """
    Generate an industry-specific competitive framework from the analysis data.
    framework_type: positioning_matrix | pricing_power | feature_gap | porters_five | value_chain
    """
    if body.framework_type not in VALID_FRAMEWORK_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"framework_type must be one of: {sorted(VALID_FRAMEWORK_TYPES)}",
        )
    if body.job_id not in ANALYSIS_JOBS:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    row = ANALYSIS_JOBS[body.job_id]
    if row.get("status") != "ready":
        raise HTTPException(
            status_code=400,
            detail="Analysis not ready; only completed analyses can generate frameworks",
        )
    report = row.get("report")
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    if not isinstance(report, MarketReport):
        report = MarketReport.model_validate(report)
    return _generate_framework(report, body.framework_type)


# --- Export (markdown / HTML / PDF) ---


def _export_header_footer(company_name: str, generated_date: str, source_urls: list[str]) -> tuple[str, str]:
    """Return (header_md, footer_md) for exports."""
    header = f"# {company_name} Competitive Intelligence Report\n\n*Generated on {generated_date}*\n\n---\n\n"
    urls = ", ".join(source_urls[:10]) if source_urls else "Scraped and AI-analyzed"
    footer = f"\n\n---\n\n**Data sources:** {urls}\n\n*AI-estimated metrics are labeled as such.*"
    return header, footer


def _export_executive_md(report: MarketReport) -> str:
    """Executive tab: KPI summary, threats, opportunities, recommendations."""
    base = report.base_company_data
    comp = report.comparisons
    md = ["## Executive Summary\n", comp.summary_text or "No summary.", "\n## Key Metrics\n"]
    md.append(f"- **Competitive Win Rate:** {_metric_display(comp.win_rate)}\n")
    md.append(f"- **Market Share (est.):** {_metric_display(comp.market_share_estimate)}\n")
    md.append(f"- **Pricing Advantage:** {_metric_display(comp.pricing_advantage)}\n")
    md.append("\n## Top Competitive Threats\n")
    threats = []
    for c in report.competitors or []:
        swot = getattr(c.data, "swot_analysis", None)
        threat_list = getattr(swot, "threat", []) if swot else []
        for t in (threat_list or [])[:2]:
            threats.append(f"- **{c.company_name}:** {t}")
    md.extend(threats if threats else ["- No threat data available.\n"])
    md.append("\n## Strategic Opportunities\n")
    opps = []
    for c in report.competitors or []:
        swot = getattr(c.data, "swot_analysis", None)
        opp_list = getattr(swot, "opportunity", []) if swot else []
        for o in (opp_list or [])[:2]:
            opps.append(f"- **{c.company_name}:** {o}")
    md.extend(opps if opps else ["- No opportunity data available.\n"])
    recs = comp.strategic_recommendations or {}
    if recs:
        md.append("\n## Recommendations\n")
        for key in ("immediate_actions", "product_priorities", "market_focus"):
            vals = recs.get(key) if isinstance(recs, dict) else []
            if vals:
                md.append(f"\n**{key.replace('_', ' ').title()}:**\n")
                for v in vals[:5]:
                    text = getattr(v, "text", v) if not isinstance(v, str) else v
                    md.append(f"- {text}\n")
    return "".join(md)


def _export_market_md(report: MarketReport) -> str:
    """Market tab: market share, segment leaders."""
    comp = report.comparisons
    md = ["## Market Overview\n"]
    md.append(f"- **Market Share (est.):** {_metric_display(comp.market_share_estimate)}\n")
    if comp.total_market_size:
        md.append(f"- **Total Market Size:** {_metric_display(comp.total_market_size)}\n")
    if comp.total_active_users:
        md.append(f"- **Total Active Users:** {_metric_display(comp.total_active_users)}\n")
    segments = comp.market_segments or []
    if segments:
        md.append("\n## Segment Leaders\n")
        for s in segments[:10]:
            if isinstance(s, dict):
                name = s.get("segment_name", "Segment")
                leader = s.get("leader", "—")
                share = s.get("share", "")
            else:
                name = getattr(s, "segment_name", "Segment")
                leader = getattr(s, "leader", "—")
                share = getattr(s, "share", "")
            md.append(f"- **{name}:** {leader} ({share})\n")
    return "".join(md)


def _export_pricing_md(report: MarketReport) -> str:
    """Pricing tab: pricing comparison, recent news, opportunities."""
    base = report.base_company_data
    md = ["## Pricing Comparison\n"]
    for t in (base.pricing_tiers or [])[:6]:
        md.append(f"- **{t.name}:** {t.price or '—'}\n")
    md.append("\n## Competitor Pricing\n")
    for c in report.competitors or []:
        md.append(f"\n### {c.company_name}\n")
        for t in (c.data.pricing_tiers or [])[:4]:
            md.append(f"- {t.name}: {t.price or '—'}\n")
    md.append("\n## Recent News (Pricing / Product)\n")
    news = []
    for c in report.competitors or []:
        for n in (c.data.recent_news or [])[:3]:
            title = n.title if hasattr(n, "title") else n.get("title", "")
            news.append(f"- **{c.company_name}:** {title}\n")
    md.extend(news[:10] if news else ["- No recent news.\n"])
    md.append(f"\n**Pricing advantage (summary):** {report.comparisons.pricing_advantage}\n")
    return "".join(md)


def _export_compare_md(report: MarketReport, competitor_name: str) -> str:
    """Compare tab: feature comparison table for one competitor."""
    base = report.base_company_data
    comp_profile = None
    for c in report.competitors or []:
        if (c.company_name or "").strip().lower() == (competitor_name or "").strip().lower():
            comp_profile = c
            break
    if not comp_profile:
        comp_profile = (report.competitors or [None])[0]
    base_name = base.company_name or "Us"
    comp_name = comp_profile.company_name if comp_profile else "Competitor"
    base_feats = set((f or "").lower() for f in (base.feature_list or []))
    comp_feats = set((f or "").lower() for f in (comp_profile.data.feature_list or [])) if comp_profile else set()
    all_feats = sorted(base_feats | comp_feats)
    md = [f"## Feature Comparison: {base_name} vs {comp_name}\n\n"]
    md.append("| Feature | " + base_name + " | " + comp_name + " |\n")
    md.append("|---------|" + "---|" * 2 + "\n")
    for f in all_feats:
        b = "✓" if f in base_feats else "—"
        c = "✓" if f in comp_feats else "—"
        md.append(f"| {f} | {b} | {c} |\n")
    return "".join(md)


def _export_battlecard_md(battlecard: Battlecard) -> str:
    """Battlecard as markdown."""
    md = [f"# {battlecard.base_company} vs {battlecard.competitor} — Sales Battlecard\n\n"]
    md.append(f"*Generated {battlecard.generated_at}*\n\n---\n\n")
    md.append("## Executive Summary\n\n")
    md.append(battlecard.executive_summary + "\n\n")
    md.append("## Why We Win\n\n")
    for s in battlecard.why_we_win:
        md.append(f"- {s}\n")
    md.append("\n## Why We Lose\n\n")
    for s in battlecard.why_we_lose:
        md.append(f"- {s}\n")
    md.append("\n## Objection Handling\n\n")
    for oh in battlecard.objection_handlers:
        md.append(f"**When they say:** {oh.objection}\n\n")
        md.append(f"**You say:** {oh.response}\n")
        if oh.proof_point:
            md.append(f"*Proof:* {oh.proof_point}\n")
        md.append("\n")
    md.append("## Pricing Position\n\n")
    md.append(battlecard.pricing_comparison + "\n\n")
    md.append("## Killer Questions\n\n")
    for i, q in enumerate(battlecard.killer_questions, 1):
        md.append(f"{i}. {q}\n")
    md.append("\n## Landmines to Plant\n\n")
    for i, s in enumerate(battlecard.landmines, 1):
        md.append(f"{i}. {s}\n")
    return "".join(md)


def _markdown_to_html(md: str, title: str, company_name: str, generated_date: str, source_urls: list[str]) -> str:
    """Wrap markdown body in a minimal standalone HTML page with inline CSS (printable)."""
    import html
    import re
    # Convert markdown to HTML (simple subset), then escape
    s = md
    s = re.sub(r"^### (.+)$", r"\n<h3>\1</h3>\n", s, flags=re.MULTILINE)
    s = re.sub(r"^## (.+)$", r"\n<h2>\1</h2>\n", s, flags=re.MULTILINE)
    s = re.sub(r"^[\*\-] (.+)$", r"<li>\1</li>", s, flags=re.MULTILINE)
    s = re.sub(r"^\d+\. (.+)$", r"<li>\1</li>", s, flags=re.MULTILINE)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"\n\n+", "</p><p>", s)
    s = re.sub(r"\n", "<br>\n", s)
    s = "<p>" + s + "</p>"
    s = re.sub(r"<p>\s*<h", "<h", s)
    s = re.sub(r"</h2>\s*</p>", "</h2>", s)
    s = re.sub(r"<p>\s*<li>", "<ul><li>", s)
    s = re.sub(r"</li>\s*<br>", "</li>", s)
    body_escaped = html.escape(s)
    # Restore tags we added (they got escaped)
    for tag in ("<h2>", "</h2>", "<h3>", "</h3>", "<li>", "</li>", "<p>", "</p>", "<br>", "<strong>", "</strong>", "<ul>"):
        body_escaped = body_escaped.replace(html.escape(tag), tag)
    urls_str = ", ".join(html.escape(u) for u in source_urls[:10]) if source_urls else "Scraped and AI-analyzed"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{html.escape(title)}</title>
<style>
body {{ font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; color: #111; line-height: 1.5; }}
h1 {{ font-size: 1.5rem; margin-bottom: 0.25rem; }}
h2 {{ font-size: 1.2rem; margin-top: 1.5rem; }}
h3 {{ font-size: 1rem; margin-top: 1rem; }}
.subtitle {{ color: #555; font-size: 0.9rem; margin-bottom: 1.5rem; }}
ul {{ padding-left: 1.5rem; }}
li {{ margin: 0.25rem 0; }}
table {{ border-collapse: collapse; width: 100%; margin: 1rem 0; }}
th, td {{ border: 1px solid #ddd; padding: 0.5rem; text-align: left; }}
footer {{ margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #ddd; font-size: 0.8rem; color: #666; }}
@media print {{ body {{ margin: 1rem; }} }}
</style>
</head>
<body>
<h1>{html.escape(company_name)} Competitive Intelligence Report</h1>
<p class="subtitle">Generated on {html.escape(generated_date)}</p>
<hr>
<div>{s}</div>
<footer>
<p><strong>Data sources:</strong> {urls_str}</p>
<p><em>AI-estimated metrics are labeled as such.</em></p>
</footer>
</body>
</html>"""


@app.post("/export/{job_id}")
async def export_analysis(
    job_id: str,
    format: str = "pdf",
    tab: str = "executive",
    competitor_name: str | None = None,
):
    """
    Export a specific tab's content in various formats.
    Formats: pdf, markdown, html (pdf returns HTML for frontend to print)
    Tabs: executive, market, pricing, compare, battlecard
    For compare and battlecard, pass competitor_name.
    """
    if job_id not in ANALYSIS_JOBS:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    row = ANALYSIS_JOBS[job_id]
    if row.get("status") != "ready":
        raise HTTPException(status_code=400, detail="Analysis not ready")
    report = row.get("report")
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    if not isinstance(report, MarketReport):
        report = MarketReport.model_validate(report)

    company_name = report.base_company_data.company_name or "Company"
    generated_date = datetime.now(timezone.utc).strftime("%B %d, %Y")
    source_urls = list(report.comparisons.sources_used or [])
    if not source_urls:
        for c in report.competitors or []:
            for s in c.data.sources or []:
                if getattr(s, "source_url", None):
                    source_urls.append(s.source_url)

    tab = (tab or "executive").strip().lower()
    fmt = (format or "pdf").strip().lower()
    if fmt not in ("pdf", "markdown", "html"):
        raise HTTPException(status_code=400, detail="format must be pdf, markdown, or html")
    if tab not in ("executive", "market", "pricing", "compare", "battlecard"):
        raise HTTPException(status_code=400, detail="tab must be executive, market, pricing, compare, or battlecard")

    comp_name = (competitor_name or "").strip() or None
    if tab in ("compare", "battlecard") and not comp_name and report.competitors:
        comp_name = report.competitors[0].company_name

    if tab == "battlecard" and comp_name:
        try:
            card = await generate_battlecard(BattlecardRequest(job_id=job_id, competitor_name=comp_name))
            body_md = _export_battlecard_md(card)
        except Exception:
            body_md = "*Battlecard could not be generated.*\n"
    elif tab == "compare" and comp_name:
        body_md = _export_compare_md(report, comp_name)
    elif tab == "executive":
        body_md = _export_executive_md(report)
    elif tab == "market":
        body_md = _export_market_md(report)
    elif tab == "pricing":
        body_md = _export_pricing_md(report)
    else:
        body_md = _export_executive_md(report)

    header_md, footer_md = _export_header_footer(company_name, generated_date, source_urls)
    full_md = header_md + body_md + footer_md

    if fmt == "markdown":
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse(
            content=full_md,
            media_type="text/markdown",
            headers={"Content-Disposition": 'attachment; filename="competitive-intel.md"'},
        )
    html_content = _markdown_to_html(
        full_md, f"{company_name} Report", company_name, generated_date, source_urls
    )
    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=html_content)


# --- Monitoring endpoints ---


@app.post("/monitor", response_model=MonitorResponse)
async def start_monitor(
    body: MonitorRequest,
    background_tasks: BackgroundTasks,
) -> MonitorResponse:
    """
    Create a monitored company and run an initial analysis.
    Returns monitor_id for use with /monitor/{id}/changes and /monitor/{id}/refresh.
    """
    base_url = (body.base_url or "").strip()
    if not base_url:
        raise HTTPException(status_code=400, detail="base_url is required")
    if not base_url.startswith("http://") and not base_url.startswith("https://"):
        base_url = "https://" + base_url
    company_name = (body.company_name or "").strip() or _company_name_from_url(base_url)
    scope = (body.scope or "global").strip().lower()
    region = (body.region or "").strip() or None
    monitor = MonitoredCompany(
        base_url=base_url,
        company_name=company_name,
        scope=scope,
        region=region,
    )
    monitor_id = monitor.id
    MONITORED_COMPANIES[monitor_id] = monitor
    CHANGE_EVENTS.setdefault(monitor_id, [])
    MONITOR_ANALYSIS_HISTORY.setdefault(monitor_id, [])
    background_tasks.add_task(
        run_market_discovery_for_monitor,
        monitor_id,
        base_url,
        scope,
        region,
    )
    return MonitorResponse(
        monitor_id=monitor_id,
        message=f"Monitoring started for {company_name}. Initial analysis running.",
    )


@app.get("/monitor/{monitor_id}/changes", response_model=ChangesResponse)
async def get_monitor_changes(monitor_id: str) -> ChangesResponse:
    """Return all detected changes for this monitored company, newest first."""
    if monitor_id not in MONITORED_COMPANIES:
        raise HTTPException(status_code=404, detail="Monitor not found")
    company = MONITORED_COMPANIES[monitor_id]
    events = sorted(
        CHANGE_EVENTS.get(monitor_id, []),
        key=lambda e: e.detected_at,
        reverse=True,
    )
    return ChangesResponse(
        monitor_id=monitor_id,
        company_name=company.company_name,
        changes=events,
        last_checked=company.last_checked,
    )


@app.get("/monitor/{monitor_id}/report")
async def get_monitor_report(monitor_id: str) -> dict:
    """Return the latest analysis report for this monitor, if any."""
    if monitor_id not in MONITORED_COMPANIES:
        raise HTTPException(status_code=404, detail="Monitor not found")
    history = MONITOR_ANALYSIS_HISTORY.get(monitor_id, [])
    if not history:
        raise HTTPException(status_code=404, detail="No report yet; analysis may still be running")
    latest = history[-1]
    report = latest.get("report")
    if report is None:
        raise HTTPException(status_code=404, detail="No report data")
    return {"monitor_id": monitor_id, "report": report}


@app.get("/monitors")
async def list_monitors() -> list[dict]:
    """Return all monitored companies with status, last_checked, change count, and has_digest."""
    return [
        {
            "id": c.id,
            "base_url": c.base_url,
            "company_name": c.company_name,
            "scope": c.scope,
            "region": c.region,
            "created_at": c.created_at,
            "last_checked": c.last_checked,
            "check_interval_hours": c.check_interval_hours,
            "change_count": len(CHANGE_EVENTS.get(c.id, [])),
            "has_digest": len(DIGESTS.get(c.id, [])) > 0,
        }
        for c in MONITORED_COMPANIES.values()
    ]


@app.post("/monitor/{monitor_id}/refresh")
async def refresh_monitor(
    monitor_id: str,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    """Manually trigger a re-analysis and change detection."""
    if monitor_id not in MONITORED_COMPANIES:
        raise HTTPException(status_code=404, detail="Monitor not found")
    company = MONITORED_COMPANIES[monitor_id]
    background_tasks.add_task(
        run_market_discovery_for_monitor,
        monitor_id,
        company.base_url,
        company.scope,
        company.region,
    )
    return {
        "monitor_id": monitor_id,
        "message": "Refresh started. Changes will appear in /monitor/{monitor_id}/changes when complete.",
    }


# --- Digest (competitive intelligence briefing) ---


def _digest_period_from_now() -> str:
    """Return a human-readable period for the digest (e.g. Feb 3-10, 2026)."""
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=7)
    return f"{start.strftime('%b')} {start.day}-{now.day}, {now.year}"


def _build_digest_context(
    company_name: str,
    last_checked: str | None,
    changes: list[ChangeEvent],
    latest_report_summary: str | None,
) -> str:
    """Build context string for the digest LLM."""
    parts = [
        f"Monitored company: {company_name}",
        f"Last analysis: {last_checked or 'Never'}",
        "",
        "## Latest report summary",
        latest_report_summary or "No report summary available.",
        "",
        "## Recent detected changes (use these to populate sections)",
    ]
    for ev in changes[:50]:
        parts.append(f"- [{ev.change_type}] {ev.title} (severity: {ev.severity})")
        parts.append(f"  {ev.description or ''}")
        if ev.old_value or ev.new_value:
            parts.append(f"  {ev.old_value or ''} -> {ev.new_value or ''}")
        parts.append(f"  Competitor: {ev.competitor_name}, detected: {ev.detected_at}")
    if not changes:
        parts.append("(No changes detected in this period.)")
    return "\n".join(parts)


def _generate_digest(monitor_id: str) -> Digest:
    """Generate a competitive intelligence digest for the monitor. Stores and returns the digest."""
    if monitor_id not in MONITORED_COMPANIES:
        raise HTTPException(status_code=404, detail="Monitor not found")
    company = MONITORED_COMPANIES[monitor_id]
    history = MONITOR_ANALYSIS_HISTORY.get(monitor_id, [])
    changes = list(CHANGE_EVENTS.get(monitor_id, []))
    latest_report_summary = None
    if history:
        latest = history[-1]
        report = latest.get("report")
        if report:
            comp = report.get("comparisons") if isinstance(report, dict) else getattr(report, "comparisons", None)
            if comp:
                summary = comp.get("summary_text") if isinstance(comp, dict) else getattr(comp, "summary_text", None)
                if summary:
                    latest_report_summary = summary

    context = _build_digest_context(
        company.company_name,
        company.last_checked,
        changes,
        latest_report_summary,
    )
    period = _digest_period_from_now()
    now_iso = datetime.now(timezone.utc).isoformat()

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not set")

    system_prompt = """You are a competitive intelligence analyst writing a weekly briefing digest.
Given the monitored company, latest report summary, and list of detected changes, produce a structured digest.
Return ONLY valid JSON (no markdown) with this exact structure:
{
  "executive_summary": "2-3 sentences summarizing the most important competitive developments and what they mean for the company.",
  "sections": [
    {
      "title": "Pricing changes",
      "type": "pricing_changes",
      "items": [{"title": "string", "description": "string", "severity": "critical|high|medium|low", "competitor": "string"}]
    },
    {
      "title": "New features & product updates",
      "type": "new_features",
      "items": [{"title": "string", "description": "string", "severity": "medium|low", "competitor": "string"}]
    },
    {
      "title": "News & announcements",
      "type": "news",
      "items": [{"title": "string", "description": "string", "severity": "low", "competitor": "string"}]
    },
    {
      "title": "Strategic recommendations",
      "type": "recommendations",
      "items": [{"title": "string", "description": "string"}]
    }
  ]
}
Populate each section from the changes and report; use "Strategic recommendations" to suggest 2-4 actionable next steps. If a section has no items, use an empty array. Keep executive_summary concise and executive-ready."""

    user_content = f"Context:\n\n{context}\n\nProduce the digest JSON. Period to reference: {period}"

    llm = ChatOpenAI(model=os.getenv("OPENAI_EXTRACT_MODEL", "gpt-4o-mini"), temperature=0.2, api_key=api_key)
    response = llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=user_content)])
    text = (response.content or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        raw = json.loads(text)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Digest LLM returned invalid JSON: {e}") from e

    executive_summary = raw.get("executive_summary") or "No summary generated."
    sections_raw = raw.get("sections") or []
    sections: list[DigestSection] = []
    for s in sections_raw:
        if isinstance(s, dict):
            sections.append(DigestSection(
                title=s.get("title") or "Section",
                type=s.get("type") or "news",
                items=[x for x in (s.get("items") or []) if isinstance(x, dict)],
            ))

    digest = Digest(
        monitor_id=monitor_id,
        company_name=company.company_name,
        period=period,
        executive_summary=executive_summary,
        sections=sections,
        generated_at=now_iso,
    )
    digest_dict = digest.model_dump()
    DIGESTS.setdefault(monitor_id, []).append(digest_dict)
    return digest


@app.post("/generate-digest/{monitor_id}", response_model=Digest)
async def generate_digest(monitor_id: str) -> Digest:
    """Generate a competitive intelligence digest for a monitored company."""
    return _generate_digest(monitor_id)


@app.get("/digest/{monitor_id}/latest", response_model=Digest)
async def get_latest_digest(monitor_id: str) -> Digest:
    """Return the most recently generated digest for this monitor."""
    if monitor_id not in MONITORED_COMPANIES:
        raise HTTPException(status_code=404, detail="Monitor not found")
    list_digests = DIGESTS.get(monitor_id, [])
    if not list_digests:
        raise HTTPException(status_code=404, detail="No digest generated yet for this monitor")
    latest = list_digests[-1]
    return Digest.model_validate(latest)


# --- Intel notes (annotations on analysis) ---


@app.post("/notes/{job_id}", response_model=IntelNote)
async def add_note(job_id: str, body: AddNoteRequest) -> IntelNote:
    """Add a note to an analysis."""
    note = IntelNote(
        job_id=job_id,
        section=body.section.strip(),
        content=body.content.strip(),
        author=(body.author or "").strip() or "Anonymous",
        note_type=(body.note_type or "comment").strip().lower()
        or "comment",
    )
    INTEL_NOTES.setdefault(job_id, []).append(note)
    return note


@app.get("/notes/{job_id}")
async def get_notes(job_id: str, section: str | None = None) -> list[dict]:
    """Get all notes for an analysis. Optional query param section filters by section."""
    notes = INTEL_NOTES.get(job_id, [])
    if section is not None and section.strip():
        section_val = section.strip()
        notes = [n for n in notes if n.section == section_val]
    return [n.model_dump() for n in notes]


@app.delete("/notes/{job_id}/{note_id}")
async def delete_note(job_id: str, note_id: str) -> dict:
    """Delete a specific note."""
    notes = INTEL_NOTES.get(job_id, [])
    for i, n in enumerate(notes):
        if n.id == note_id:
            notes.pop(i)
            return {"deleted": note_id}
    raise HTTPException(status_code=404, detail="Note not found")
