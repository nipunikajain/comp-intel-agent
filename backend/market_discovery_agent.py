"""
MarketDiscoveryAgent: autonomous workflow from a single base URL.
Flow: Analyze Base → Discover Competitors (Tavily) → Analyze Competitors (parallel) → Synthesize Report.
Uses gpt-4o-mini for extraction and synthesis. No hardcoded pricing or competitor lists.
"""

from __future__ import annotations

import json
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TypedDict

from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage

from schemas import (
    BaseProfile,
    Competitor,
    CompetitorProfile,
    ComparisonSummary,
    MarketReport,
)
from agent import researcher_graph, _domain_from_url


# --- State ---


class MarketDiscoveryState(TypedDict, total=False):
    base_url: str
    base_company_name: str
    base_profile: BaseProfile | None
    competitor_urls: list[str]
    competitor_profiles: list[CompetitorProfile]
    market_report: MarketReport | None
    error: str | None


def _domain_to_name(domain: str) -> str:
    """Turn domain like www.sage.com into display name 'Sage'."""
    if not domain:
        return "Company"
    # Remove www. and take first part of hostname
    name = domain.lower().replace("www.", "").split(".")[0]
    return name.capitalize()


# --- Step A: Analyze Base Company ---


def node_analyze_base(state: MarketDiscoveryState) -> MarketDiscoveryState:
    """
    Scrape base_url (and pricing page), extract pricing + features, store as BaseProfile.
    Reuses the existing researcher graph for consistency.
    """
    base_url = (state.get("base_url") or "").strip()
    if not base_url:
        return {**state, "error": "base_url is required", "base_profile": None}

    out: MarketDiscoveryState = {**state, "base_profile": None}
    try:
        result = researcher_graph.invoke({"company_url": base_url})
        competitor = result.get("competitor")
        err = result.get("error")
        if err:
            out["error"] = (out.get("error") or "") + f" Base: {err}. "
        if competitor is None:
            competitor = Competitor(
                pricing_tiers=[],
                recent_news=[],
                feature_list=[],
                swot_analysis=None,
            )
        domain = _domain_from_url(base_url)
        company_name = _domain_to_name(domain)
        out["base_company_name"] = company_name
        out["base_profile"] = BaseProfile(
            company_name=company_name,
            company_url=base_url,
            pricing_tiers=competitor.pricing_tiers,
            feature_list=competitor.feature_list or [],
        )
    except Exception as e:
        out["error"] = (out.get("error") or "") + f" Base analysis: {e!s}. "
    return out


# --- Step B: Discover Competitors (Tavily) ---


def node_discover_competitors(state: MarketDiscoveryState) -> MarketDiscoveryState:
    """
    Tavily search: "Top competitors of [Base Company Name] pricing".
    Extract top 3 competitor URLs (different domains).
    """
    base_name = state.get("base_company_name") or state.get("base_url") or "the company"
    base_url = state.get("base_url") or ""
    base_domain = _domain_from_url(base_url)
    out: MarketDiscoveryState = {**state, "competitor_urls": []}

    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        out["error"] = (out.get("error") or "") + " TAVILY_API_KEY not set. "
        return out

    try:
        from tavily import TavilyClient

        client = TavilyClient(api_key=api_key)
        query = f"Top competitors of {base_name} pricing"
        resp = client.search(query, max_results=10)
        results = resp.get("results", []) if isinstance(resp, dict) else []
        seen_domains: set[str] = set()
        urls: list[str] = []
        for r in results:
            if len(urls) >= 3:
                break
            u = r.get("url") if isinstance(r, dict) else None
            if not u or not isinstance(u, str):
                continue
            try:
                from urllib.parse import urlparse

                parsed = urlparse(u)
                netloc = (parsed.netloc or "").lower().replace("www.", "")
                if not netloc or netloc == _domain_from_url(base_url).lower().replace("www.", ""):
                    continue
                if netloc in seen_domains:
                    continue
                seen_domains.add(netloc)
                if parsed.scheme in ("http", "https") or not parsed.scheme:
                    full = u if u.startswith("http") else f"https://{u}"
                    urls.append(full)
            except Exception:
                continue
        out["competitor_urls"] = urls[:3]
    except Exception as e:
        out["error"] = (out.get("error") or "") + f" Discover competitors: {e!s}. "
    return out


# --- Step C: Analyze Competitors (parallel) ---


def node_analyze_competitors(state: MarketDiscoveryState) -> MarketDiscoveryState:
    """
    For each competitor URL, run the existing researcher graph (Scrape → Extract).
    Collect results into competitor_profiles. Run in parallel.
    """
    urls = state.get("competitor_urls") or []
    out: MarketDiscoveryState = {**state, "competitor_profiles": []}
    if not urls:
        return out

    profiles: list[CompetitorProfile] = []
    max_workers = min(3, len(urls))

    def analyze_one(url: str) -> CompetitorProfile | None:
        try:
            result = researcher_graph.invoke({"company_url": url})
            competitor = result.get("competitor")
            if competitor is None:
                competitor = Competitor(
                    pricing_tiers=[],
                    recent_news=[],
                    feature_list=[],
                    swot_analysis=None,
                )
            name = _domain_to_name(_domain_from_url(url))
            return CompetitorProfile(
                company_name=name,
                company_url=url,
                data=competitor,
            )
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(analyze_one, url): url for url in urls}
        for future in as_completed(futures):
            p = future.result()
            if p is not None:
                profiles.append(p)

    out["competitor_profiles"] = profiles
    return out


# --- Step D: Synthesize Intelligence (LLM → MarketReport) ---


def _synthesize_report_with_llm(
    base_profile: BaseProfile,
    competitor_profiles: list[CompetitorProfile],
) -> tuple[ComparisonSummary | None, str | None]:
    """Use gpt-4o-mini to generate ComparisonSummary from real scraped data. Returns (summary, error)."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None, "OPENAI_API_KEY not set"

    def _format_pricing(tiers: list) -> str:
        if not tiers:
            return "No pricing found"
        lines = []
        for t in tiers:
            price = getattr(t, "price", None) or "(no price)"
            name = getattr(t, "name", "Tier")
            lines.append(f"- {name}: {price}")
        return "\n".join(lines)

    base_text = f"""## Base company: {base_profile.company_name} ({base_profile.company_url})
Pricing:
{_format_pricing(base_profile.pricing_tiers)}
Features: {", ".join(base_profile.feature_list[:15]) if base_profile.feature_list else "None"}"""

    comp_texts = []
    for i, cp in enumerate(competitor_profiles, 1):
        comp_texts.append(
            f"""### Competitor {i}: {cp.company_name} ({cp.company_url})
Pricing:
{_format_pricing(cp.data.pricing_tiers)}
Features: {", ".join((cp.data.feature_list or [])[:15]) or "None"}"""
        )
    competitors_block = "\n\n".join(comp_texts)

    prompt = f"""You are a competitive intelligence analyst. Using ONLY the following scraped data (no invented numbers), produce a short comparison.

{base_text}

---

Competitors:

{competitors_block}

From this data only, output a JSON object with exactly these keys (all strings):
- summary_text: 2-3 sentences comparing the base company to competitors (e.g. "[Base] is cheaper than [Competitor A] on entry tier but lacks [feature]. [Competitor B] leads on [X].")
- win_rate: estimated win rate for the base company vs these competitors (e.g. "62%" or "Low" if unclear)
- market_share_estimate: estimated market share for the base company (e.g. "8%" or "Small")
- pricing_advantage: one sentence on pricing (e.g. "15% lower on entry tier vs main competitor")

Use only information present above. If pricing is missing, say "Pricing data unavailable" where relevant. Return only valid JSON, no markdown."""

    try:
        model_name = os.getenv("OPENAI_EXTRACT_MODEL", "gpt-4o-mini")
        llm = ChatOpenAI(model=model_name, temperature=0.1, api_key=api_key)
        response = llm.invoke([HumanMessage(content=prompt)])
        text = (response.content or "").strip() if hasattr(response, "content") else ""
        if not text:
            return None, "LLM returned no text"
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
        data = json.loads(text)
        return (
            ComparisonSummary(
                summary_text=str(data.get("summary_text", "")),
                win_rate=str(data.get("win_rate", "N/A")),
                market_share_estimate=str(data.get("market_share_estimate", "N/A")),
                pricing_advantage=str(data.get("pricing_advantage", "N/A")),
            ),
            None,
        )
    except json.JSONDecodeError as e:
        return None, f"Invalid JSON: {e!s}"
    except Exception as e:
        return None, f"Synthesize: {e!s}"


def node_synthesize(state: MarketDiscoveryState) -> MarketDiscoveryState:
    """
    Generate MarketReport: compare BaseProfile vs CompetitorProfiles via LLM.
    Output: Win Rate, Market Share (estimated), Pricing Advantage from real data.
    """
    base_profile = state.get("base_profile")
    competitor_profiles = state.get("competitor_profiles") or []
    out: MarketDiscoveryState = {**state, "market_report": None}

    if base_profile is None:
        out["error"] = (out.get("error") or "") + " No base profile. "
        return out

    comparisons, err = _synthesize_report_with_llm(base_profile, competitor_profiles)
    if err:
        out["error"] = (out.get("error") or "") + err
    if comparisons is None:
        comparisons = ComparisonSummary(
            summary_text="Comparison could not be generated.",
            win_rate="N/A",
            market_share_estimate="N/A",
            pricing_advantage="N/A",
        )

    out["market_report"] = MarketReport(
        base_company_data=base_profile,
        competitors=competitor_profiles,
        comparisons=comparisons,
    )
    return out


# --- Graph ---


def build_market_discovery_graph() -> StateGraph:
    graph = StateGraph(MarketDiscoveryState)
    graph.add_node("analyze_base", node_analyze_base)
    graph.add_node("discover_competitors", node_discover_competitors)
    graph.add_node("analyze_competitors", node_analyze_competitors)
    graph.add_node("synthesize", node_synthesize)

    graph.add_edge(START, "analyze_base")
    graph.add_edge("analyze_base", "discover_competitors")
    graph.add_edge("discover_competitors", "analyze_competitors")
    graph.add_edge("analyze_competitors", "synthesize")
    graph.add_edge("synthesize", END)

    return graph


market_discovery_graph = build_market_discovery_graph().compile()
