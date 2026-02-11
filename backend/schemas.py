"""
Pydantic V2 schemas for the Competitive Intelligence Platform.
Strict validation for competitor data and API payloads.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from pydantic import BaseModel, Field, ConfigDict


# --- Source attribution for extracted data ---


class SourceAttribution(BaseModel):
    """Attribution for a single data source (scraped URL or LLM estimate)."""

    model_config = ConfigDict(strict=True)

    source_url: str = Field(..., description="URL the data was scraped from")
    source_type: str = Field(
        ...,
        description="pricing_page | news_page | homepage | llm_estimate",
    )
    scraped_at: str = Field(..., description="ISO timestamp of when data was collected")
    confidence: str = Field(
        default="high",
        description="high | medium | low",
    )


# --- Competitor intelligence (extracted by Researcher agent) ---


class PricingTier(BaseModel):
    """A single pricing tier (e.g. Starter, Pro, Enterprise)."""

    model_config = ConfigDict(strict=True)

    name: str = Field(..., description="Tier name")
    price: str | None = Field(None, description="Price string (e.g. $X/month)")
    features: list[str] = Field(default_factory=list, description="Features included in this tier")
    source: SourceAttribution | None = Field(None, description="URL and page type this tier was scraped from")


class NewsItem(BaseModel):
    """A single recent news item about the competitor."""

    model_config = ConfigDict(strict=True)

    title: str = Field(..., description="Headline or title")
    summary: str | None = Field(None, description="Short summary")
    url: str | None = Field(None, description="Source URL")
    date: str | None = Field(None, description="Publication or discovery date")
    source_type: str | None = Field(None, description="scraped | discovered")


class SWOTItem(BaseModel):
    """One dimension of a SWOT analysis."""

    model_config = ConfigDict(strict=True)

    strength: list[str] = Field(default_factory=list, description="Strengths")
    weakness: list[str] = Field(default_factory=list, description="Weaknesses")
    opportunity: list[str] = Field(default_factory=list, description="Opportunities")
    threat: list[str] = Field(default_factory=list, description="Threats")
    source: SourceAttribution | None = Field(None, description="URL and page type this SWOT was derived from")


class Competitor(BaseModel):
    """
    Structured competitor profile extracted by the Researcher agent.
    Powers the dashboard and battlecards.
    """

    model_config = ConfigDict(strict=True)

    pricing_tiers: list[PricingTier] = Field(
        default_factory=list,
        description="Pricing tiers (e.g. from /pricing page)",
    )
    recent_news: list[NewsItem] = Field(
        default_factory=list,
        description="Recent news or announcements",
    )
    feature_list: list[str] = Field(
        default_factory=list,
        description="List of product/feature names or capabilities",
    )
    swot_analysis: SWOTItem | None = Field(
        None,
        description="SWOT analysis derived from scraped content",
    )
    sources: list[SourceAttribution] = Field(
        default_factory=list,
        description="Source attributions for this competitor's extracted data",
    )


# --- API request/response schemas ---


class TrackCompetitorRequest(BaseModel):
    """Request body for POST /track-competitor."""

    model_config = ConfigDict(strict=True, populate_by_name=True)

    company_url: str = Field(
        ...,
        alias="companyUrl",
        description="Base URL of the competitor (e.g. https://quickbooks.intuit.com)",
    )


class TrackCompetitorResponse(BaseModel):
    """Response after enqueueing a track-competitor job."""

    model_config = ConfigDict(strict=True)

    job_id: str = Field(..., description="ID of the background job")
    competitor_id: str = Field(..., description="ID to use for GET /competitors/{id}")
    status: str = Field(default="queued", description="Job status")


class CompetitorListItem(BaseModel):
    """Summary item for GET /competitors list."""

    model_config = ConfigDict(strict=True)

    id: str = Field(..., description="Competitor record ID")
    company_url: str | None = Field(None, description="Source URL")
    status: str = Field(default="ready", description="ready | processing | failed")


class CompetitorListResponse(BaseModel):
    """Response for GET /competitors (list all)."""

    model_config = ConfigDict(strict=True)

    competitors: list[CompetitorListItem] = Field(default_factory=list)


class CompetitorResponse(BaseModel):
    """Response for GET /competitors/{id}."""

    model_config = ConfigDict(strict=True)

    id: str = Field(..., description="Competitor record ID")
    company_url: str | None = Field(None, description="Source URL")
    data: Competitor = Field(..., description="Structured competitor data")
    status: str = Field(default="ready", description="Record status (e.g. ready, processing, failed)")
    error: str | None = Field(None, description="Error message when status is failed")


class GenerateBattlecardRequest(BaseModel):
    """Request body for POST /generate-battlecard."""

    model_config = ConfigDict(strict=True)

    company_a_id: str = Field(..., description="Competitor ID for Company A")
    company_b_id: str = Field(..., description="Competitor ID for Company B")


class BattlecardResponse(BaseModel):
    """Generated battlecard comparing two competitors."""

    model_config = ConfigDict(strict=True)

    company_a_id: str = Field(..., description="Company A competitor ID")
    company_b_id: str = Field(..., description="Company B competitor ID")
    content: str = Field(..., description="LLM-generated comparison (markdown or text)")


# --- Autonomous market discovery (single base URL → full report) ---


class BaseProfile(BaseModel):
    """Base company profile from scraping the company's own site (e.g. Sage)."""

    model_config = ConfigDict(strict=True)

    company_name: str = Field(..., description="Display name of the base company")
    company_url: str = Field(..., description="Base URL that was analyzed")
    pricing_tiers: list[PricingTier] = Field(default_factory=list)
    feature_list: list[str] = Field(default_factory=list)


class CompetitorProfile(BaseModel):
    """A discovered competitor with scraped data."""

    model_config = ConfigDict(strict=True)

    company_name: str = Field(..., description="Display name (from URL or page)")
    company_url: str = Field(..., description="URL that was analyzed")
    data: Competitor = Field(..., description="Extracted pricing, features, SWOT, news")


# --- Metric transparency: how each number was derived ---


class MetricWithReasoning(BaseModel):
    """A metric value plus explanation for transparency (how it was calculated)."""

    model_config = ConfigDict(strict=True)

    value: str = Field(..., description="The metric value e.g. '62%'")
    reasoning: str = Field(
        default="",
        description="1-2 sentence explanation of how this was derived",
    )
    confidence: str = Field(
        default="medium",
        description="high | medium | low",
    )
    inputs_used: list[str] = Field(
        default_factory=list,
        description="List of data points that fed into this metric",
    )


class MarketSegmentWithReasoning(BaseModel):
    """Market segment with optional reasoning for the estimate."""

    model_config = ConfigDict(strict=True)

    segment_name: str = Field(..., description="e.g. Small Business, Mid-Market")
    leader: str = Field(..., description="Competitor name leading this segment")
    share: str = Field(..., description="e.g. 35%")
    growth: str = Field(default="", description="e.g. +5%")
    reasoning: str = Field(
        default="",
        description="Why this leader/share was estimated",
    )


class RecommendationWithReasoning(BaseModel):
    """A single recommendation with explanation of why it was suggested."""

    model_config = ConfigDict(strict=True)

    text: str = Field(..., description="The recommendation text")
    reasoning: str = Field(
        default="",
        description="Why this recommendation was suggested",
    )


class ComparisonSummary(BaseModel):
    """LLM-generated comparison metrics and narrative from real scraped data."""

    model_config = ConfigDict(strict=True)

    summary_text: str = Field(
        ...,
        description="Narrative comparison e.g. 'Sage is cheaper than QuickBooks but lacks X feature'",
    )
    win_rate: MetricWithReasoning = Field(
        ...,
        description="Estimated win rate vs competitors with reasoning",
    )
    market_share_estimate: MetricWithReasoning = Field(
        ...,
        description="Estimated market share with reasoning",
    )
    pricing_advantage: MetricWithReasoning = Field(
        ...,
        description="Pricing advantage summary with reasoning",
    )
    total_market_size: MetricWithReasoning | None = Field(
        None,
        description="Estimated total addressable market with reasoning. Industry estimate.",
    )
    total_active_users: MetricWithReasoning | None = Field(
        None,
        description="Estimated total users across competitors with reasoning. Industry estimate.",
    )
    market_segments: list[MarketSegmentWithReasoning] | None = Field(
        None,
        description="Segment breakdown with reasoning per segment",
    )
    strategic_recommendations: dict | None = Field(
        None,
        description="Keys: immediate_actions, product_priorities, market_focus (each list of RecommendationWithReasoning or plain strings)",
    )
    data_sources: list[SourceAttribution] = Field(
        default_factory=list,
        description="Source attributions for this summary (e.g. llm_estimate)",
    )
    sources_used: list[str] = Field(
        default_factory=list,
        description="All URLs that fed into this synthesis (base + competitors)",
    )
    confidence_note: str | None = Field(
        None,
        description="e.g. 'Based on scraped pricing pages and LLM analysis'",
    )


class MarketReport(BaseModel):
    """Full market intelligence report from base URL discovery."""

    model_config = ConfigDict(strict=True)

    base_company_data: BaseProfile = Field(..., description="Base company scraped profile")
    competitors: list[CompetitorProfile] = Field(
        default_factory=list,
        description="Discovered competitors with scraped pricing/features",
    )
    comparisons: ComparisonSummary = Field(
        ..., description="LLM-generated win rate, market share, pricing advantage"
    )


class InitAnalysisRequest(BaseModel):
    """Request body for POST /init-analysis."""

    model_config = ConfigDict(strict=True)

    base_url: str = Field(
        ...,
        description="Base company URL to start discovery (e.g. https://www.sage.com)",
    )
    scope: str = Field(
        default="global",
        description="global | country | regional | provincial",
    )
    region: str | None = Field(
        None,
        description="e.g. 'Canada', 'British Columbia', 'North America', 'Europe'",
    )


class InitAnalysisResponse(BaseModel):
    """Response after starting market discovery."""

    model_config = ConfigDict(strict=True)

    job_id: str = Field(..., description="ID to poll GET /analysis/{job_id}")


class ProgressStep(BaseModel):
    """One step in analysis progress."""

    model_config = ConfigDict(strict=True)

    step: str = Field(..., description="Step name e.g. 'Analyzing base company'")
    status: str = Field(..., description="done | in_progress | pending")
    timestamp: str = Field(default="", description="ISO timestamp when step completed or started")


class AnalysisResponse(BaseModel):
    """Full response for GET /analysis/{job_id}."""

    model_config = ConfigDict(strict=True)

    job_id: str = Field(..., description="Analysis job ID")
    status: str = Field(..., description="processing | ready | failed")
    base_url: str | None = Field(None, description="Base URL that was analyzed")
    report: MarketReport | None = Field(None, description="Report when status=ready")
    error: str | None = Field(None, description="Error message when status=failed")
    competition_scope: str | None = Field(None, description="global | country | regional | local")
    region: str | None = Field(None, description="e.g. Canada, British Columbia, Vancouver")
    geographic_scope: str | None = Field(None, description="global | continent | country | region")
    geographic_location: str | None = Field(None, description="e.g. Canada, British Columbia, North America")
    progress: list[ProgressStep] = Field(
        default_factory=list,
        description="Progress steps: done, in_progress, pending",
    )


class DealContext(BaseModel):
    """Optional deal context for deal-specific Ask AI guidance."""

    model_config = ConfigDict(strict=True)

    prospect_company: str | None = Field(None, description="Prospect company name or type e.g. Acme Corp, Mid-market SaaS")
    prospect_size: str | None = Field(None, description="e.g. Startup, SMB, Mid-Market, Enterprise")
    use_case: str | None = Field(None, description="e.g. Replace legacy ERP, scale billing")
    buyer_role: str | None = Field(None, description="e.g. CFO, CTO, CEO/Founder")
    pain_point: str | None = Field(None, description="e.g. Cost control, migration risk")


class AskAIRequest(BaseModel):
    """Request body for POST /ask-ai."""

    model_config = ConfigDict(strict=True)

    job_id: str = Field(..., description="The analysis job_id to ask about")
    question: str = Field(..., description="User's question about the analysis")
    deal_context: DealContext | None = Field(None, description="Deal context for tailored guidance")


class AskAIResponse(BaseModel):
    """Response from POST /ask-ai."""

    model_config = ConfigDict(strict=True)

    answer: str = Field(..., description="AI-generated answer")
    sources_referenced: list[str] = Field(
        default_factory=list,
        description="URLs referenced in the answer",
    )


# --- Battlecard generation ---


class ObjectionHandler(BaseModel):
    """One objection and recommended response for the battlecard."""

    model_config = ConfigDict(strict=True)

    objection: str = Field(..., description="What the prospect might say")
    response: str = Field(..., description="Recommended response")
    proof_point: str | None = Field(None, description="Supporting evidence")


class Battlecard(BaseModel):
    """Generated sales battlecard: base company vs one competitor."""

    model_config = ConfigDict(strict=True)

    base_company: str = Field(..., description="Our company name")
    competitor: str = Field(..., description="Competitor name")
    generated_at: str = Field(..., description="ISO timestamp when generated")
    executive_summary: str = Field(
        ...,
        description="2-3 sentence positioning statement",
    )
    why_we_win: list[str] = Field(
        ...,
        description="Top 3-5 reasons we win against this competitor",
    )
    why_we_lose: list[str] = Field(
        ...,
        description="Top 3-5 reasons we might lose",
    )
    objection_handlers: list[ObjectionHandler] = Field(
        ...,
        description="Common objections and responses",
    )
    pricing_comparison: str = Field(
        ...,
        description="Brief pricing positioning statement",
    )
    feature_advantages: list[str] = Field(
        ...,
        description="Features where we have an edge",
    )
    feature_gaps: list[str] = Field(
        ...,
        description="Features where competitor has an edge",
    )
    killer_questions: list[str] = Field(
        ...,
        description="Questions the rep should ask to expose competitor weaknesses",
    )
    landmines: list[str] = Field(
        ...,
        description="Points to plant early that disadvantage the competitor",
    )


class BattlecardRequest(BaseModel):
    """Request body for POST /generate-battlecard."""

    model_config = ConfigDict(strict=True)

    job_id: str = Field(..., description="Analysis job_id")
    competitor_name: str = Field(..., description="Competitor to generate battlecard against")


# --- Competitive frameworks (industry-aware, beyond SWOT) ---


class CompetitiveFramework(BaseModel):
    """Industry-specific competitive framework generated from analysis data."""

    model_config = ConfigDict(strict=True)

    framework_type: str = Field(
        ...,
        description="positioning_matrix | pricing_power | feature_gap | porters_five | value_chain",
    )
    title: str = Field(..., description="Human-readable title for the framework")
    description: str = Field(..., description="Short description of what the framework shows")
    data: dict = Field(..., description="Framework-specific structured data")
    generated_at: str = Field(..., description="ISO timestamp when generated")


class GenerateFrameworkRequest(BaseModel):
    """Request body for POST /generate-framework."""

    model_config = ConfigDict(strict=True)

    job_id: str = Field(..., description="Analysis job_id")
    framework_type: str = Field(
        ...,
        description="positioning_matrix | pricing_power | feature_gap | porters_five | value_chain",
    )


# --- Intel notes (user annotations on analysis) ---


class IntelNote(BaseModel):
    """User note or annotation on competitive intelligence (per job, per section)."""

    model_config = ConfigDict(strict=True)

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Unique note ID")
    job_id: str = Field(..., description="Analysis job this note belongs to")
    author: str = Field(default="Anonymous", description="Author display name")
    section: str = Field(
        ...,
        description="executive | market | pricing | compare | competitor:{name}",
    )
    content: str = Field(..., description="Note content")
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="ISO timestamp when note was created",
    )
    note_type: str = Field(
        default="comment",
        description="comment | insight | action_item | question",
    )


class AddNoteRequest(BaseModel):
    """Request body for POST /notes/{job_id}."""

    model_config = ConfigDict(strict=True)

    section: str = Field(
        ...,
        description="executive | market | pricing | compare | competitor:{name}",
    )
    content: str = Field(..., description="Note content")
    author: str | None = Field(None, description="Author display name; default Anonymous")
    note_type: str = Field(
        default="comment",
        description="comment | insight | action_item | question",
    )


# --- Monitoring: track competitors over time and detect changes ---


def _default_uuid() -> str:
    return str(uuid.uuid4())


def _default_iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class MonitoredCompany(BaseModel):
    """A company being monitored for competitive changes."""

    model_config = ConfigDict(strict=True)

    id: str = Field(default_factory=_default_uuid, description="Unique monitor ID")
    base_url: str = Field(..., description="Base company URL")
    company_name: str = Field(..., description="Display name")
    scope: str = Field(
        default="global",
        description="global | regional | country",
    )
    region: str | None = Field(None, description="Region when scope is not global")
    created_at: str = Field(
        default_factory=_default_iso_now,
        description="ISO timestamp when monitor was created",
    )
    last_checked: str | None = Field(None, description="ISO timestamp of last analysis")
    check_interval_hours: int = Field(
        default=24,
        description="Hours between automatic checks",
    )


class ChangeEvent(BaseModel):
    """A detected change in a competitor or the market."""

    model_config = ConfigDict(strict=True)

    id: str = Field(default_factory=_default_uuid, description="Unique event ID")
    monitored_company_id: str = Field(..., description="Monitor this change belongs to")
    competitor_name: str = Field(..., description="Competitor (or base company) where change was detected")
    change_type: str = Field(
        ...,
        description="pricing_change | new_feature | news | website_update | new_competitor | removed_feature | swot_change",
    )
    title: str = Field(..., description="Short title")
    description: str = Field(..., description="Detailed description")
    old_value: str | None = Field(None, description="Previous value when applicable")
    new_value: str | None = Field(None, description="New value when applicable")
    severity: str = Field(
        default="medium",
        description="critical | high | medium | low",
    )
    detected_at: str = Field(
        default_factory=_default_iso_now,
        description="ISO timestamp when change was detected",
    )
    source_url: str | None = Field(None, description="URL of the source page")


class MonitorRequest(BaseModel):
    """Request body for POST /monitor."""

    model_config = ConfigDict(strict=True)

    base_url: str = Field(..., description="Base company URL to monitor")
    company_name: str | None = Field(None, description="Display name; inferred from URL if omitted")
    scope: str = Field(default="global", description="global | regional | country")
    region: str | None = Field(None, description="Region when scope is not global")


class MonitorResponse(BaseModel):
    """Response from POST /monitor."""

    model_config = ConfigDict(strict=True)

    monitor_id: str = Field(..., description="ID to use for /monitor/{id}/changes and refresh")
    message: str = Field(..., description="Human-readable status message")


class ChangesResponse(BaseModel):
    """Response from GET /monitor/{monitor_id}/changes."""

    model_config = ConfigDict(strict=True)

    monitor_id: str = Field(..., description="Monitor ID")
    company_name: str = Field(..., description="Monitored company name")
    changes: list[ChangeEvent] = Field(
        default_factory=list,
        description="Detected changes, newest first",
    )
    last_checked: str | None = Field(None, description="ISO timestamp of last check")


# --- Digest (notification / weekly briefing) ---


class DigestPreferences(BaseModel):
    """Preferences for digest generation and delivery."""

    model_config = ConfigDict(strict=True)

    monitor_id: str = Field(..., description="Monitor this digest belongs to")
    frequency: str = Field(
        default="weekly",
        description="daily | weekly | monthly",
    )
    email: str | None = Field(None, description="For future email integration")
    include_sections: list[str] = Field(
        default_factory=lambda: ["pricing_changes", "new_features", "news", "recommendations"],
        description="Sections to include in the digest",
    )


class DigestSection(BaseModel):
    """One section of a digest (e.g. pricing changes, news)."""

    model_config = ConfigDict(strict=True)

    title: str = Field(..., description="Section heading")
    type: str = Field(
        ...,
        description="pricing_changes | new_features | news | recommendations",
    )
    items: list[dict] = Field(
        default_factory=list,
        description="Section items (each dict may have title, description, severity, etc.)",
    )


class Digest(BaseModel):
    """Competitive intelligence digest for a monitored company."""

    model_config = ConfigDict(strict=True)

    monitor_id: str = Field(..., description="Monitor ID")
    company_name: str = Field(..., description="Monitored company name")
    period: str = Field(..., description="e.g. Feb 3-10, 2026")
    executive_summary: str = Field(..., description="2-3 sentence summary of competitive activity")
    sections: list[DigestSection] = Field(
        default_factory=list,
        description="Digest sections (pricing, features, news, recommendations)",
    )
    generated_at: str = Field(..., description="ISO timestamp when digest was generated")
