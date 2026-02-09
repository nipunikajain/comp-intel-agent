"""
FastAPI application for the Competitive Intelligence Platform.
Autonomous workflow: POST /init-analysis (base_url) → GET /analysis/{job_id}.
No hardcoded pricing or competitor lists; everything is discovered from the base URL.
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from market_discovery_agent import market_discovery_graph
from schemas import (
    AnalysisResponse,
    InitAnalysisRequest,
    InitAnalysisResponse,
    MarketReport,
)

_backend_dir = Path(__file__).resolve().parent
load_dotenv(_backend_dir / ".env")
load_dotenv(_backend_dir.parent / "Comp_intel" / ".env")

# --- In-memory store for analysis jobs (replace with Supabase/DB later) ---

ANALYSIS_JOBS: dict[str, dict] = {}  # job_id -> { status, base_url?, report?: MarketReport, error? }


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="Competitive Intelligence API",
    description="Autonomous market discovery from a single base company URL",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "message": "Competitive Intelligence API",
        "docs": "/docs",
        "redoc": "/redoc",
    }


def run_market_discovery_background(base_url: str, job_id: str) -> None:
    """
    Run MarketDiscoveryAgent: Analyze Base → Discover Competitors → Analyze Competitors → Synthesize.
    Updates ANALYSIS_JOBS[job_id] with status and report or error.
    """
    ANALYSIS_JOBS[job_id] = {
        "status": "processing",
        "base_url": base_url,
    }
    try:
        result = market_discovery_graph.invoke({"base_url": base_url})
        report = result.get("market_report")
        err = result.get("error")
        if report is not None:
            ANALYSIS_JOBS[job_id]["status"] = "ready"
            ANALYSIS_JOBS[job_id]["report"] = report
        else:
            ANALYSIS_JOBS[job_id]["status"] = "failed"
            ANALYSIS_JOBS[job_id]["error"] = err or "No report generated"
    except Exception as e:
        ANALYSIS_JOBS[job_id]["status"] = "failed"
        ANALYSIS_JOBS[job_id]["error"] = str(e)


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

    job_id = str(uuid.uuid4())
    background_tasks.add_task(run_market_discovery_background, base_url, job_id)
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
    return AnalysisResponse(
        job_id=job_id,
        status=status,
        base_url=row.get("base_url"),
        report=report,
        error=row.get("error"),
    )
