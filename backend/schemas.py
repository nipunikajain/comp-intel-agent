"""
Pydantic V2 schemas for the Competitive Intelligence Platform.
Strict validation for competitor data and API payloads.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, ConfigDict


# --- Competitor intelligence (extracted by Researcher agent) ---


class PricingTier(BaseModel):
    """A single pricing tier (e.g. Starter, Pro, Enterprise)."""

    model_config = ConfigDict(strict=True)

    name: str = Field(..., description="Tier name")
    price: str | None = Field(None, description="Price string (e.g. $X/month)")
    features: list[str] = Field(default_factory=list, description="Features included in this tier")


class NewsItem(BaseModel):
    """A single recent news item about the competitor."""

    model_config = ConfigDict(strict=True)

    title: str = Field(..., description="Headline or title")
    summary: str | None = Field(None, description="Short summary")
    url: str | None = Field(None, description="Source URL")
    date: str | None = Field(None, description="Publication or discovery date")


class SWOTItem(BaseModel):
    """One dimension of a SWOT analysis."""

    model_config = ConfigDict(strict=True)

    strength: list[str] = Field(default_factory=list, description="Strengths")
    weakness: list[str] = Field(default_factory=list, description="Weaknesses")
    opportunity: list[str] = Field(default_factory=list, description="Opportunities")
    threat: list[str] = Field(default_factory=list, description="Threats")


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


class ComparisonSummary(BaseModel):
    """LLM-generated comparison metrics and narrative from real scraped data."""

    model_config = ConfigDict(strict=True)

    summary_text: str = Field(
        ...,
        description="Narrative comparison e.g. 'Sage is cheaper than QuickBooks but lacks X feature'",
    )
    win_rate: str = Field(..., description="Estimated win rate vs competitors (e.g. '65%')")
    market_share_estimate: str = Field(
        ..., description="Estimated market share (e.g. '8%')"
    )
    pricing_advantage: str = Field(
        ..., description="Pricing advantage summary (e.g. '15% lower on entry tier')"
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


class InitAnalysisResponse(BaseModel):
    """Response after starting market discovery."""

    model_config = ConfigDict(strict=True)

    job_id: str = Field(..., description="ID to poll GET /analysis/{job_id}")


class AnalysisResponse(BaseModel):
    """Full response for GET /analysis/{job_id}."""

    model_config = ConfigDict(strict=True)

    job_id: str = Field(..., description="Analysis job ID")
    status: str = Field(..., description="processing | ready | failed")
    base_url: str | None = Field(None, description="Base URL that was analyzed")
    report: MarketReport | None = Field(None, description="Report when status=ready")
    error: str | None = Field(None, description="Error message when status=failed")
