"""
Researcher agent: LangGraph workflow for competitor intelligence.
Flow: Start -> Search (Tavily) -> Scrape (Firecrawl) -> Extract (OpenAI) -> End.
"""

from __future__ import annotations

import json
import os
import re
from typing import TypedDict
from urllib.parse import urlparse

from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from firecrawl import FirecrawlApp

from schemas import Competitor, PricingTier, NewsItem, SWOTItem


# --- State (mutable dict for LangGraph) ---


class ResearcherState(TypedDict, total=False):
    """State for the Researcher agent graph."""

    company_url: str
    pricing_url: str | None
    news_url: str | None
    raw_pricing_text: str | None
    raw_news_text: str | None
    competitor: Competitor | None
    error: str | None


def _domain_from_url(url: str) -> str:
    """Extract domain (host) from URL for site-scoped search."""
    try:
        parsed = urlparse(url)
        return parsed.netloc or url
    except Exception:
        return url


def _origin_from_url(url: str) -> str:
    """Extract origin (scheme + netloc) for fallback paths like /pricing, /blog."""
    try:
        parsed = urlparse(url)
        scheme = parsed.scheme or "https"
        netloc = parsed.netloc or ""
        return f"{scheme}://{netloc}".rstrip("/")
    except Exception:
        return url


# --- Search node (Tavily) ---


def search_node(state: ResearcherState) -> ResearcherState:
    """
    Use Tavily to find the competitor's Pricing and News pages.
    Returns updated state with pricing_url and news_url set.
    """
    company_url = state.get("company_url") or ""
    domain = _domain_from_url(company_url)
    out: ResearcherState = {**state, "pricing_url": None, "news_url": None}

    origin = _origin_from_url(company_url)
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        out["error"] = "TAVILY_API_KEY not set"
        # Fallback: use site origin + common paths (e.g. https://www.timely.com/pricing)
        out["pricing_url"] = f"{origin}/pricing"
        out["news_url"] = f"{origin}/blog"
        return out

    try:
        from tavily import TavilyClient

        client = TavilyClient(api_key=api_key)

        # Search for pricing page (prefer same domain)
        pricing_query = f"site:{domain} pricing"
        pricing_resp = client.search(pricing_query, max_results=5)
        results = pricing_resp.get("results", []) if isinstance(pricing_resp, dict) else []
        for r in results:
            u = r.get("url") if isinstance(r, dict) else None
            if u and domain in u:
                out["pricing_url"] = u
                break
        if not out.get("pricing_url"):
            out["pricing_url"] = f"{origin}/pricing"

        # Search for news/blog
        news_query = f"site:{domain} news OR blog"
        news_resp = client.search(news_query, max_results=5)
        results = news_resp.get("results", []) if isinstance(news_resp, dict) else []
        for r in results:
            u = r.get("url") if isinstance(r, dict) else None
            if u and domain in u:
                out["news_url"] = u
                break
        if not out.get("news_url"):
            out["news_url"] = f"{origin}/blog"
    except Exception as e:
        out["error"] = (out.get("error") or "") + f" Search: {e!s}. "
        out["pricing_url"] = out.get("pricing_url") or f"{origin}/pricing"
        out["news_url"] = out.get("news_url") or f"{origin}/blog"

    return out


# --- Scrape node (Firecrawl) ---


def _strip_html_to_text(html: str, max_chars: int = 20000) -> str:
    """Crude HTML strip so we have text for the LLM when markdown is empty."""
    if not html:
        return ""
    text = re.sub(r"<script[^>]*>[\s\S]*?</script>", " ", html, flags=re.IGNORECASE)
    text = re.sub(r"<style[^>]*>[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars] if text else ""


def _scrape_one(url: str, api_key: str) -> tuple[str | None, str | None]:
    """
    Scrape a single URL with Firecrawl.
    Returns (text_content, error_message). Use content when not None; error when scrape failed.
    """
    try:


        app = FirecrawlApp(api_key=api_key)
        try:
            result = app.scrape(url, params={"formats": ["markdown", "html"]})
        except TypeError:
            result = app.scrape(url)
        if not result:
            return None, "Firecrawl returned empty"

        # Handle dict response (API returns { "success": true, "data": { "markdown": "...", "html": "..." } } or similar)
        if isinstance(result, dict):
            if result.get("success") is False:
                err = result.get("error") or result.get("message") or "Scrape failed"
                return None, err
            data = result.get("data") or result
            if not isinstance(data, dict):
                return None, "Firecrawl response missing data"
            md = data.get("markdown") or result.get("markdown")
            if md and str(md).strip():
                return str(md).strip()[:20000], None
            html = data.get("html") or data.get("rawHtml") or result.get("html")
            if html and str(html).strip():
                text = _strip_html_to_text(str(html))
                if len(text) > 200:
                    return text, None
            return None, "Firecrawl returned no markdown or HTML content"

        # Object response
        md = getattr(result, "markdown", None)
        if md and str(md).strip():
            return str(md).strip()[:20000], None
        data = getattr(result, "data", None)
        if data and getattr(data, "html", None):
            text = _strip_html_to_text(str(getattr(data, "html", "")))
            if len(text) > 200:
                return text, None
        return None, "Firecrawl returned no content"
    except Exception as e:
        return None, f"Firecrawl: {e!s}"


def _is_placeholder_text(text: str) -> bool:
    """True if text looks like an error/placeholder rather than real content."""
    if not text or len(text.strip()) < 150:
        return True
    placeholders = ("(Could not scrape", "(No pricing URL", "(No news URL", "same as pricing")
    return any(p in text for p in placeholders)


def scrape_node(state: ResearcherState) -> ResearcherState:
    """
    Use Firecrawl to scrape the URLs discovered in search_node.
    If pricing/news scrapes fail, fall back to scraping the company homepage.
    """
    api_key = os.getenv("FIRECRAWL_API_KEY")
    out: ResearcherState = {
        **state,
        "raw_pricing_text": None,
        "raw_news_text": None,
    }

    if not api_key:
        out["error"] = (out.get("error") or "") + "FIRECRAWL_API_KEY not set. "
        return out

    company_url = state.get("company_url") or ""
    origin = _origin_from_url(company_url)
    pricing_url = state.get("pricing_url")
    news_url = state.get("news_url")

    if pricing_url:
        pricing_content, pricing_err = _scrape_one(pricing_url, api_key)
        out["raw_pricing_text"] = pricing_content or "(Could not scrape pricing page.)"
        if pricing_err:
            out["error"] = (out.get("error") or "") + f" Pricing: {pricing_err}. "
    else:
        out["raw_pricing_text"] = "(No pricing URL.)"

    if news_url and news_url != pricing_url:
        news_content, news_err = _scrape_one(news_url, api_key)
        out["raw_news_text"] = news_content or "(Could not scrape news page.)"
        if news_err:
            out["error"] = (out.get("error") or "") + f" News: {news_err}. "
    else:
        out["raw_news_text"] = "(No news URL or same as pricing.)"

    # If both are placeholders or very short, scrape homepage so we have something to extract
    if _is_placeholder_text(out["raw_pricing_text"] or "") and _is_placeholder_text(out["raw_news_text"] or ""):
        for fallback_url in (company_url, origin):
            if not fallback_url:
                continue
            homepage_content, homepage_err = _scrape_one(fallback_url, api_key)
            if homepage_content and len(homepage_content) > 200:
                out["raw_pricing_text"] = f"(Pricing page unavailable.)\n\n## Homepage content\n{homepage_content[:10000]}"
                out["raw_news_text"] = "(News page unavailable.)"
                if out.get("error"):
                    out["error"] = (out.get("error") or "").rstrip() + " Used homepage fallback. "
                break
            if homepage_err:
                out["error"] = (out.get("error") or "") + f" Homepage: {homepage_err}. "

    return out


# --- Extract node (OpenAI -> Competitor schema) ---


def _extract_competitor_with_llm(pricing_text: str, news_text: str, company_url: str) -> tuple[Competitor | None, str | None]:
    """Use OpenAI (ChatOpenAI) to extract Competitor schema from raw scraped text. Returns (competitor, error_message)."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None, "OPENAI_API_KEY not set"

    try:
        model_name = os.getenv("OPENAI_EXTRACT_MODEL", "gpt-4o-mini")
        llm = ChatOpenAI(
            model=model_name,
            temperature=0.1,
            api_key=api_key,
        )

        combined = f"""## Pricing page content\n{pricing_text[:12000]}\n\n## News/Blog content\n{news_text[:8000]}"""

        prompt = f"""You are a competitive intelligence analyst. Extract structured data from the following scraped web content (from {company_url}) into a JSON object that matches this exact schema. Return only valid JSON, no markdown or explanation.

The content may be from dedicated pricing/news pages OR from a homepage if those were unavailable. Extract whatever you can: pricing mentions, product features, value propositions, and infer a brief SWOT from the tone and claims. Prefer at least 3-5 feature_list items and 1-2 pricing_tiers if any price is mentioned.

Schema:
- pricing_tiers: list of objects, each with: name (string), price (string or null), features (list of strings)
- recent_news: list of objects, each with: title (string), summary (string or null), url (string or null), date (string or null)
- feature_list: list of strings (product/feature names or capabilities) — extract at least 3 if the page describes the product
- swot_analysis: one object with: strength (list of strings), weakness (list of strings), opportunity (list of strings), threat (list of strings). Infer 1-2 items per category if possible from positioning and claims.

Content:

{combined}

Return a single JSON object with keys: pricing_tiers, recent_news, feature_list, swot_analysis."""

        response = llm.invoke([HumanMessage(content=prompt)])
        text = (response.content or "").strip() if hasattr(response, "content") else ""
        if not text:
            return None, "OpenAI returned no text"

        # Strip markdown code block if present
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
        data = json.loads(text)

        pricing_tiers = [
            PricingTier(
                name=t.get("name", ""),
                price=t.get("price"),
                features=t.get("features") or [],
            )
            for t in data.get("pricing_tiers") or []
        ]
        recent_news = [
            NewsItem(
                title=n.get("title", ""),
                summary=n.get("summary"),
                url=n.get("url"),
                date=n.get("date"),
            )
            for n in data.get("recent_news") or []
        ]
        feature_list = list(data.get("feature_list") or [])
        swot = data.get("swot_analysis")
        if swot and isinstance(swot, dict):
            swot_item = SWOTItem(
                strength=list(swot.get("strength") or []),
                weakness=list(swot.get("weakness") or []),
                opportunity=list(swot.get("opportunity") or []),
                threat=list(swot.get("threat") or []),
            )
        else:
            swot_item = None

        return (
            Competitor(
                pricing_tiers=pricing_tiers,
                recent_news=recent_news,
                feature_list=feature_list,
                swot_analysis=swot_item,
            ),
            None,
        )
    except json.JSONDecodeError as e:
        return None, f"OpenAI response not valid JSON: {e!s}"
    except Exception as e:
        return None, f"OpenAI: {e!s}"


def extract_node(state: ResearcherState) -> ResearcherState:
    """
    Use OpenAI (ChatOpenAI) to extract the Competitor schema from raw text.
    Returns updated state with competitor set.
    """
    pricing_text = state.get("raw_pricing_text") or ""
    news_text = state.get("raw_news_text") or ""
    company_url = state.get("company_url") or ""

    competitor, extract_err = _extract_competitor_with_llm(pricing_text, news_text, company_url)
    if competitor is None:
        competitor = Competitor(
            pricing_tiers=[],
            recent_news=[],
            feature_list=[],
            swot_analysis=None,
        )
    out = {**state, "competitor": competitor}
    if extract_err:
        out["error"] = (state.get("error") or "") + f" Extract: {extract_err}"
    return out


# --- Graph definition ---


def build_researcher_graph() -> StateGraph:
    """Build the Researcher agent graph: Start -> Search -> Scrape -> Extract -> End."""
    graph = StateGraph(ResearcherState)

    graph.add_node("search", search_node)
    graph.add_node("scrape", scrape_node)
    graph.add_node("extract", extract_node)

    graph.add_edge(START, "search")
    graph.add_edge("search", "scrape")
    graph.add_edge("scrape", "extract")
    graph.add_edge("extract", END)

    return graph


researcher_graph = build_researcher_graph().compile()
