"""
MarketDiscoveryAgent: autonomous workflow from a single base URL.
Flow: Analyze Base → Discover Competitors (LLM + Tavily validation) → Analyze Competitors (parallel) → Synthesize Report.
Uses gpt-4o-mini for extraction and synthesis. No hardcoded pricing or competitor lists.
"""

from __future__ import annotations

import json
import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FuturesTimeoutError
from datetime import datetime, timezone
from typing import Callable, TypedDict

from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from schemas import (
    BaseProfile,
    Competitor,
    CompetitorProfile,
    ComparisonSummary,
    MarketReport,
    MarketSegmentWithReasoning,
    MetricWithReasoning,
    RecommendationWithReasoning,
    SourceAttribution,
)
from agent import researcher_graph, _domain_from_url

logger = logging.getLogger(__name__)


# --- State ---


PROGRESS_STEP_NAMES = [
    "Analyzing base company",
    "Discovering competitors",
    "Analyzing competitors",
    "Generating insights",
]


class MarketDiscoveryState(TypedDict, total=False):
    base_url: str
    base_company_name: str
    base_profile: BaseProfile | None
    scope: str
    region: str | None
    competitor_urls: list[str]
    competitor_names: list[str]
    competitor_profiles: list[CompetitorProfile]
    market_report: MarketReport | None
    error: str | None
    progress_callback: Callable[[str, str], None]


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
    Reuses the existing researcher graph for consistency. 30s timeout; on timeout proceed with partial data.
    """
    cb = state.get("progress_callback")
    if callable(cb):
        cb(PROGRESS_STEP_NAMES[0], "in_progress")
    base_url = (state.get("base_url") or "").strip()
    if not base_url:
        return {**state, "error": "base_url is required", "base_profile": None}

    out: MarketDiscoveryState = {**state, "base_profile": None}
    BASE_ANALYSIS_TIMEOUT = 30

    def _invoke():
        return researcher_graph.invoke({"company_url": base_url})

    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_invoke)
            result = future.result(timeout=BASE_ANALYSIS_TIMEOUT)
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
    except FuturesTimeoutError:
        domain = _domain_from_url(base_url)
        company_name = _domain_to_name(domain)
        out["error"] = (out.get("error") or "") + " Base analysis timed out (30s). Proceeding with partial data. "
        out["base_company_name"] = company_name
        out["base_profile"] = BaseProfile(
            company_name=company_name,
            company_url=base_url,
            pricing_tiers=[],
            feature_list=[],
        )
    except Exception as e:
        out["error"] = (out.get("error") or "") + f" Base analysis: {e!s}. "
    if callable(state.get("progress_callback")):
        state["progress_callback"](PROGRESS_STEP_NAMES[0], "done")
    return out


# --- Step B: Discover Competitors (LLM + Tavily validation) ---


def _scope_user_fragment(scope: str, location: str | None) -> str:
    """Geographic scope for user message. Scope: global | country | regional | provincial."""
    loc = (location or "").strip()
    if scope == "global" or not loc:
        return "List the top 3-5 global direct competitors."
    if scope == "country":
        return f"List the top 3-5 competitors specifically in {loc}. Include local/regional players that compete in that market."
    if scope == "regional":
        return f"List the top 3-5 competitors in the {loc} region. Include both global players with presence there and local competitors."
    if scope == "provincial":
        return f"List the top 3-5 competitors in {loc}. Include local businesses and regional players."
    return "List the top 3-5 direct competitors."


def _llm_discover_competitors_with_urls(
    base_company_name: str,
    base_url: str,
    scope: str = "global",
    region: str | None = None,
) -> list[dict] | None:
    """
    Ask LLM for top 3-5 competitors with OFFICIAL product website URLs.
    Returns list of {name, url, reason} or None on error.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    system_prompt = f"""You are a market intelligence analyst. For the company {base_company_name} ({base_url}), identify the top 3-5 direct competitors that compete in the SAME product category.

Return ONLY valid JSON — an array of objects with:
- name: string (company/product name, e.g. "QuickBooks" not "Intuit")
- url: string (the OFFICIAL product website, e.g. "https://quickbooks.intuit.com" not "https://www.intuit.com")
- reason: string (one sentence on why they compete)

CRITICAL RULES:
- Use the company's MAIN PRODUCT website, not parent company sites
- Never use review sites (trustpilot, g2, capterra)
- Never use documentation sites (learn.microsoft.com, docs.oracle.com)
- Never use education/academy sites
- Never use book publisher sites
- The URL should be where a customer would go to BUY or SIGN UP for the competing product
- For example: QuickBooks = https://quickbooks.intuit.com, Xero = https://www.xero.com, NetSuite = https://www.netsuite.com"""

    scope_normalized = (scope or "global").strip().lower()
    location = (region or "").strip() or None
    scope_instruction = _scope_user_fragment(scope_normalized, location)
    geo_line = (
        f"Geographic scope: {scope_normalized}. Location: {location or 'worldwide'}.\n"
        "Only include competitors that are relevant at this geographic level.\n"
        "For regional scope, prioritize local competitors and regional market leaders.\n"
        "For global scope, include the largest worldwide competitors."
    )
    user_prompt = (
        f"For {base_company_name} ({base_url}), {scope_instruction}\n\n{geo_line}\n\n"
        "Return ONLY a JSON array of objects with keys: name (string), url (string), reason (string)."
    )

    try:
        model_name = os.getenv("OPENAI_EXTRACT_MODEL", "gpt-4o-mini")
        llm = ChatOpenAI(model=model_name, temperature=0.1, api_key=api_key)
        response = llm.invoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ])
        text = (response.content or "").strip() if hasattr(response, "content") else ""
        if not text:
            return None
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
        data = json.loads(text)
        if not isinstance(data, list):
            return None
        out = []
        for item in data[:5]:
            if isinstance(item, dict) and item.get("name") and item.get("url"):
                out.append({
                    "name": str(item["name"]).strip(),
                    "url": str(item["url"]).strip(),
                    "reason": str(item.get("reason", "")).strip(),
                })
        return out if out else None
    except json.JSONDecodeError:
        return None
    except Exception:
        return None


def _tavily_find_pricing_url(
    competitor_name: str,
    llm_url: str,
    api_key: str,
    region: str | None = None,
) -> str:
    """
    Search Tavily for competitor pricing page; optionally include region in query.
    If results from the same domain exist, return the first such URL; else keep LLM-provided URL.
    """
    from urllib.parse import urlparse

    try:
        parsed = urlparse(llm_url if llm_url.startswith("http") else f"https://{llm_url}")
        netloc = (parsed.netloc or "").lower().replace("www.", "")
        if not netloc:
            return llm_url if llm_url.startswith("http") else f"https://{llm_url}"
        domain = netloc

        from tavily import TavilyClient
        client = TavilyClient(api_key=api_key)
        region_str = (region or "").strip()
        if region_str:
            query = f"competitors of {competitor_name} in {region_str} pricing site:{domain}"
        else:
            query = f"{competitor_name} official pricing page site:{domain}"
        resp = client.search(query, max_results=5)
        results = resp.get("results", []) if isinstance(resp, dict) else []
        skip_paths = ("/docs", "/learn", "/academy", "/support", "/help", "/blog/", "/community")
        for r in results:
            u = r.get("url") if isinstance(r, dict) else None
            if not u or not isinstance(u, str):
                continue
            full = u if u.startswith("http") else f"https://{u}"
            try:
                p = urlparse(full)
                host = (p.netloc or "").lower().replace("www.", "")
                if host != domain and not host.endswith("." + domain):
                    continue
                path = (p.path or "").lower()
                if any(skip in path for skip in skip_paths):
                    continue
                if p.scheme in ("http", "https"):
                    return full
            except Exception:
                continue
        return llm_url if llm_url.startswith("http") else f"https://{llm_url}"
    except Exception:
        return llm_url if llm_url.startswith("http") else f"https://{llm_url}" if llm_url else ""


def node_discover_competitors(state: MarketDiscoveryState) -> MarketDiscoveryState:
    """
    STEP 1: LLM identifies competitors WITH correct official product URLs (strict rules).
    STEP 2: Parse JSON; store name and URL per competitor.
    STEP 3: Optionally validate each URL via Tavily "official pricing page site:{domain}"; keep LLM URL if no same-domain result.
    Store competitor_urls and competitor_names in state.
    """
    if callable(state.get("progress_callback")):
        state["progress_callback"](PROGRESS_STEP_NAMES[1], "in_progress")
    base_name = state.get("base_company_name") or state.get("base_url") or "the company"
    base_url = (state.get("base_url") or "").strip()
    scope = (state.get("scope") or "global").strip().lower()
    region = state.get("region")
    out: MarketDiscoveryState = {**state, "competitor_urls": [], "competitor_names": []}

    # STEP 1 — LLM with strict URL rules (official product sites only)
    candidates = _llm_discover_competitors_with_urls(base_name, base_url, scope, region)
    if not candidates:
        out["error"] = (out.get("error") or "") + " LLM returned no competitors. "
        if callable(state.get("progress_callback")):
            state["progress_callback"](PROGRESS_STEP_NAMES[1], "done")
        return out

    tavily_key = os.getenv("TAVILY_API_KEY")
    base_domain = _domain_from_url(base_url).lower().replace("www.", "")
    seen_domains: set[str] = set()
    urls: list[str] = []
    names: list[str] = []

    for c in candidates:
        name = (c.get("name") or "").strip()
        llm_url = (c.get("url") or "").strip()
        if not name or not llm_url:
            continue
        if not llm_url.startswith("http"):
            llm_url = f"https://{llm_url}"

        # STEP 3 — validate: try to find pricing page on same domain; else keep LLM URL
        if tavily_key:
            final_url = _tavily_find_pricing_url(name, llm_url, tavily_key, region)
        else:
            final_url = llm_url

        if not final_url:
            continue
        try:
            from urllib.parse import urlparse
            parsed = urlparse(final_url)
            netloc = (parsed.netloc or "").lower().replace("www.", "")
            if not netloc or netloc == base_domain:
                continue
            if netloc in seen_domains:
                continue
            seen_domains.add(netloc)
            urls.append(final_url)
            names.append(name)
        except Exception:
            continue
        if len(urls) >= 5:
            break

    out["competitor_urls"] = urls
    out["competitor_names"] = names
    if callable(state.get("progress_callback")):
        state["progress_callback"](PROGRESS_STEP_NAMES[1], "done")
    return out


# --- Step C: Analyze Competitors (parallel) ---


def node_analyze_competitors(state: MarketDiscoveryState) -> MarketDiscoveryState:
    """
    For each competitor URL, run the existing researcher graph (Scrape → Extract).
    Use competitor_names from discovery when building CompetitorProfile (e.g. "QuickBooks" not "Intuit").
    """
    if callable(state.get("progress_callback")):
        state["progress_callback"](PROGRESS_STEP_NAMES[2], "in_progress")
    urls = state.get("competitor_urls") or []
    names = state.get("competitor_names") or []
    out: MarketDiscoveryState = {**state, "competitor_profiles": []}
    if not urls:
        if callable(state.get("progress_callback")):
            state["progress_callback"](PROGRESS_STEP_NAMES[2], "done")
        return out

    def name_for_index(i: int, url: str) -> str:
        if i < len(names) and names[i]:
            return names[i]
        return _domain_to_name(_domain_from_url(url))

    profiles: list[CompetitorProfile] = []
    max_workers = 5

    COMPETITOR_TIMEOUT = 60

    def analyze_one(index: int, url: str) -> tuple[int, CompetitorProfile] | None:
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
            company_name = name_for_index(index, url)
            return (
                index,
                CompetitorProfile(
                    company_name=company_name,
                    company_url=url,
                    data=competitor,
                ),
            )
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(analyze_one, i, url): (i, url) for i, url in enumerate(urls)}
        results_by_index: list[tuple[int, CompetitorProfile]] = []
        for future in as_completed(futures):
            try:
                pair = future.result(timeout=COMPETITOR_TIMEOUT)
                if pair is not None:
                    results_by_index.append(pair)
            except (FuturesTimeoutError, Exception):
                pass
        results_by_index.sort(key=lambda x: x[0])
        profiles = [p for _, p in results_by_index]

    out["competitor_profiles"] = profiles
    if callable(state.get("progress_callback")):
        state["progress_callback"](PROGRESS_STEP_NAMES[2], "done")
    return out


# --- Step D: Synthesize Intelligence (LLM → MarketReport) ---


def _fallback_simple_synthesis(
    base_profile: BaseProfile,
    competitor_profiles: list[CompetitorProfile],
    api_key: str,
    model_name: str,
) -> dict | None:
    """Second attempt with a minimal prompt (company names only). Returns dict with summary_text, win_rate, market_share_estimate, pricing_advantage or None."""
    base_name = base_profile.company_name
    comp_names = [cp.company_name for cp in competitor_profiles]
    names_list = ", ".join(comp_names) if comp_names else "none"

    simple_prompt = f"""You are a competitive intelligence analyst. Based only on company names, write a 2-3 sentence competitive overview.

Base company: {base_name}
Competitors: {names_list}

Return ONLY a JSON object with these exact keys (no markdown, no code block):
- summary_text: 2-3 sentences comparing {base_name} to these competitors in the market. Be substantive.
- win_rate: estimated win rate for {base_name} vs these competitors (e.g. "55%" or "Moderate")
- market_share_estimate: estimated market share for {base_name} (e.g. "12%" or "Mid-tier")
- pricing_advantage: one short sentence on typical pricing position (e.g. "Competitive on entry tier")"""

    try:
        llm = ChatOpenAI(model=model_name, temperature=0.1, api_key=api_key)
        response = llm.invoke([HumanMessage(content=simple_prompt)])
        text = (response.content or "").strip() if hasattr(response, "content") else ""
        logger.info("Fallback synthesis response (first 400 chars): %s", (text[:400] if text else "(empty)"))
        if not text:
            return None
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
        data = json.loads(text)
        if not isinstance(data, dict):
            return None
        summary = str((data.get("summary_text") or "")).strip()
        win_rate = str(data.get("win_rate") or "N/A").strip()
        market_share = str(data.get("market_share_estimate") or "N/A").strip()
        pricing = str(data.get("pricing_advantage") or "N/A").strip()
        if summary and (win_rate.upper() != "N/A" or market_share.upper() != "N/A"):
            return {
                "summary_text": summary,
                "win_rate": win_rate if win_rate.upper() != "N/A" else "Moderate",
                "market_share_estimate": market_share if market_share.upper() != "N/A" else "Est. mid-tier",
                "pricing_advantage": pricing if pricing.upper() != "N/A" else "Competitive positioning.",
            }
        return None
    except json.JSONDecodeError as e:
        logger.warning("Fallback synthesis JSON parse error: %s", e)
        return None
    except Exception as e:
        logger.warning("Fallback synthesis failed: %s", e)
        return None


def _parse_metric(data: dict, key: str, default_value: str = "N/A") -> MetricWithReasoning:
    """Parse a metric from LLM output: either {value, reasoning, confidence, inputs_used} or plain string."""
    raw = data.get(key)
    if isinstance(raw, dict):
        return MetricWithReasoning(
            value=str(raw.get("value", default_value)).strip() or default_value,
            reasoning=str(raw.get("reasoning", "")).strip(),
            confidence=str(raw.get("confidence", "medium")).strip().lower() or "medium",
            inputs_used=[str(x).strip() for x in (raw.get("inputs_used") or []) if x],
        )
    return MetricWithReasoning(
        value=str(raw).strip() if raw is not None else default_value,
        reasoning="",
        confidence="low",
        inputs_used=[],
    )


def _synthesize_report_with_llm(
    base_profile: BaseProfile,
    competitor_profiles: list[CompetitorProfile],
    scope: str = "global",
    region: str | None = None,
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

    scope_label = (scope or "global").strip().lower()
    region_label = (region or "").strip() or None
    scope_context = (
        f"This analysis is scoped to {scope_label} level"
        + (f", specifically {region_label}." if region_label else " (global).")
    )
    geography_note = (
        "Market estimates (total_market_size, total_active_users, market_segments) should reflect this scoped geography."
        if region_label else ""
    )

    prompt = f"""You are a competitive intelligence analyst. Using the following scraped data plus your knowledge of this market, produce a comparison and market intelligence estimates.

{scope_context} {geography_note}

If pricing data is missing or appears incorrect for some competitors, focus your analysis on the competitors where you have good data. Use your training knowledge about these well-known companies to supplement the scraped data where needed. Always provide a substantive summary_text and every metric with its reasoning — never return empty strings.

For EVERY metric you generate, you MUST include:
- reasoning: explain in 1-2 sentences how you arrived at this number
- confidence: "high" if based on scraped data, "medium" if inferred from scraped data, "low" if mostly estimated from your training knowledge
- inputs_used: list the specific data points (with values) that informed this metric
Do NOT generate numbers without explanation. If data is insufficient, say so in the reasoning and set confidence to "low".

{base_text}

---

Competitors:

{competitors_block}

Output a JSON object with this structure:

- summary_text: 2-3 sentences comparing the base company to competitors.

- win_rate: object with value (e.g. "62%"), reasoning (1-2 sentences), confidence ("high"|"medium"|"low"), inputs_used (array of strings, e.g. ["Sage entry price: $25/mo", "QuickBooks entry price: $30/mo", "Feature overlap: 8/10"]).

- market_share_estimate: object with value (e.g. "8%"), reasoning, confidence, inputs_used.

- pricing_advantage: object with value (e.g. "15% lower on entry tier"), reasoning, confidence, inputs_used.

- total_market_size: object with value (e.g. "$8.4B"), reasoning, confidence, inputs_used. Or null if not estimated.

- total_active_users: object with value (e.g. "22M"), reasoning, confidence, inputs_used. Or null if not estimated.

- market_segments: list of 3-4 objects, each with segment_name, leader, share, growth, and reasoning (why this leader/share).

- strategic_recommendations: object with three arrays: immediate_actions, product_priorities, market_focus. Each array contains objects with text (the recommendation) and reasoning (why it was suggested). Example: {{ "immediate_actions": [{{ "text": "Highlight lower entry pricing", "reasoning": "Scraped data shows 15% lower entry tier vs main competitor" }}], ... }}.

Return only valid JSON, no markdown."""

    logger.info("Synthesis prompt length: %s", len(prompt))

    try:
        model_name = os.getenv("OPENAI_EXTRACT_MODEL", "gpt-4o-mini")
        llm = ChatOpenAI(model=model_name, temperature=0.1, api_key=api_key)
        response = llm.invoke([HumanMessage(content=prompt)])
        text = (response.content or "").strip() if hasattr(response, "content") else ""
        logger.info("Raw LLM response (first 500 chars): %s", (text[:500] if text else "(empty)"))
        if not text:
            logger.error("Synthesis failed: LLM returned no text")
            return None, "LLM returned no text"
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
        try:
            data = json.loads(text)
        except json.JSONDecodeError as parse_err:
            logger.error("Synthesis failed: Invalid JSON from LLM: %s. Raw response (first 500): %s", parse_err, text[:500])
            return None, f"Invalid JSON: {parse_err!s}"

        market_segments = data.get("market_segments")
        if market_segments is not None and not isinstance(market_segments, list):
            market_segments = None
        elif market_segments is not None:
            segments_out = []
            for seg in market_segments:
                if not isinstance(seg, dict):
                    continue
                segments_out.append(
                    MarketSegmentWithReasoning(
                        segment_name=str(seg.get("segment_name", "Segment")).strip(),
                        leader=str(seg.get("leader", "")).strip(),
                        share=str(seg.get("share", "")).strip(),
                        growth=str(seg.get("growth", "")).strip(),
                        reasoning=str(seg.get("reasoning", "")).strip(),
                    )
                )
            market_segments = segments_out if segments_out else None

        strat = data.get("strategic_recommendations")
        if strat is not None and isinstance(strat, dict):
            def _norm_rec(v: list) -> list[RecommendationWithReasoning]:
                out = []
                for x in (v or [])[:5]:
                    if isinstance(x, dict) and ("text" in x or "action" in x):
                        out.append(
                            RecommendationWithReasoning(
                                text=str(x.get("text") or x.get("action", "")).strip(),
                                reasoning=str(x.get("reasoning", "")).strip(),
                            )
                        )
                    elif isinstance(x, str):
                        out.append(RecommendationWithReasoning(text=x.strip(), reasoning=""))
                return out
            strat = {
                "immediate_actions": _norm_rec(strat.get("immediate_actions")),
                "product_priorities": _norm_rec(strat.get("product_priorities")),
                "market_focus": _norm_rec(strat.get("market_focus")),
            }
        else:
            strat = None

        source_urls = [base_profile.company_url]
        for cp in competitor_profiles:
            if cp.company_url and cp.company_url not in source_urls:
                source_urls.append(cp.company_url)
        confidence_note = (
            "Market estimates generated by AI based on scraped competitor data from: "
            + ", ".join(source_urls)
        )
        scraped_at = datetime.now(timezone.utc).isoformat()
        data_sources = [
            SourceAttribution(
                source_url="(AI synthesis)",
                source_type="llm_estimate",
                scraped_at=scraped_at,
                confidence="medium",
            )
        ]

        summary_text = str(data.get("summary_text", "")).strip()
        win_rate = _parse_metric(data, "win_rate", "N/A")
        market_share_estimate = _parse_metric(data, "market_share_estimate", "N/A")
        pricing_advantage = _parse_metric(data, "pricing_advantage", "N/A")
        all_nas = (
            (not summary_text)
            or (
                (win_rate.value or "").upper() == "N/A"
                and (market_share_estimate.value or "").upper() == "N/A"
                and (pricing_advantage.value or "").upper() == "N/A"
            )
        )
        if all_nas:
            logger.info("Primary synthesis returned empty/N/A; attempting fallback simple synthesis.")
            model_name = os.getenv("OPENAI_EXTRACT_MODEL", "gpt-4o-mini")
            fallback = _fallback_simple_synthesis(
                base_profile, competitor_profiles, api_key, model_name
            )
            if fallback:
                summary_text = fallback.get("summary_text") or summary_text or "Competitive overview based on market context."
                win_rate = MetricWithReasoning(
                    value=fallback.get("win_rate") or win_rate.value or "N/A",
                    reasoning="Fallback estimate from company names only (scraped data was insufficient).",
                    confidence="low",
                    inputs_used=[],
                )
                market_share_estimate = MetricWithReasoning(
                    value=fallback.get("market_share_estimate") or market_share_estimate.value or "N/A",
                    reasoning="Fallback estimate from company names only.",
                    confidence="low",
                    inputs_used=[],
                )
                pricing_advantage = MetricWithReasoning(
                    value=fallback.get("pricing_advantage") or pricing_advantage.value or "N/A",
                    reasoning="Fallback estimate from company names only.",
                    confidence="low",
                    inputs_used=[],
                )
                logger.info("Fallback synthesis succeeded; using fallback for summary_text and metrics.")

        total_market_size = None
        if data.get("total_market_size") is not None:
            if isinstance(data["total_market_size"], dict):
                total_market_size = _parse_metric(data, "total_market_size", "—")
            else:
                total_market_size = MetricWithReasoning(
                    value=str(data["total_market_size"]).strip(),
                    reasoning="",
                    confidence="low",
                    inputs_used=[],
                )
        total_active_users = None
        if data.get("total_active_users") is not None:
            if isinstance(data["total_active_users"], dict):
                total_active_users = _parse_metric(data, "total_active_users", "—")
            else:
                total_active_users = MetricWithReasoning(
                    value=str(data["total_active_users"]).strip(),
                    reasoning="",
                    confidence="low",
                    inputs_used=[],
                )

        return (
            ComparisonSummary(
                summary_text=summary_text or "Comparison overview could not be generated from available data.",
                win_rate=win_rate,
                market_share_estimate=market_share_estimate,
                pricing_advantage=pricing_advantage,
                total_market_size=total_market_size,
                total_active_users=total_active_users,
                market_segments=market_segments,
                strategic_recommendations=strat,
                data_sources=data_sources,
                sources_used=source_urls,
                confidence_note=confidence_note,
            ),
            None,
        )
    except json.JSONDecodeError as e:
        logger.error("Synthesis failed: %s", e)
        return None, f"Invalid JSON: {e!s}"
    except Exception as e:
        logger.error("Synthesis failed: %s", e)
        return None, f"Synthesize: {e!s}"


def node_synthesize(state: MarketDiscoveryState) -> MarketDiscoveryState:
    """
    Generate MarketReport: compare BaseProfile vs CompetitorProfiles via LLM.
    Output: Win Rate, Market Share (estimated), Pricing Advantage from real data.
    """
    if callable(state.get("progress_callback")):
        state["progress_callback"](PROGRESS_STEP_NAMES[3], "in_progress")
    base_profile = state.get("base_profile")
    competitor_profiles = state.get("competitor_profiles") or []
    out: MarketDiscoveryState = {**state, "market_report": None}

    if base_profile is None:
        out["error"] = (out.get("error") or "") + " No base profile. "
        if callable(state.get("progress_callback")):
            state["progress_callback"](PROGRESS_STEP_NAMES[3], "done")
        return out

    scope = (state.get("scope") or "global").strip().lower()
    region = state.get("region")
    comparisons, err = _synthesize_report_with_llm(base_profile, competitor_profiles, scope, region)
    if err:
        out["error"] = (out.get("error") or "") + err
    if comparisons is None:
        _na = MetricWithReasoning(value="N/A", reasoning="", confidence="low", inputs_used=[])
        comparisons = ComparisonSummary(
            summary_text="Comparison could not be generated.",
            win_rate=_na,
            market_share_estimate=_na,
            pricing_advantage=_na,
            total_market_size=None,
            total_active_users=None,
            market_segments=None,
            strategic_recommendations=None,
            data_sources=[],
            sources_used=[],
            confidence_note=None,
        )

    out["market_report"] = MarketReport(
        base_company_data=base_profile,
        competitors=competitor_profiles,
        comparisons=comparisons,
    )
    if callable(state.get("progress_callback")):
        state["progress_callback"](PROGRESS_STEP_NAMES[3], "done")
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
