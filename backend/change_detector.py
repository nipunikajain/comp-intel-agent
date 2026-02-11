"""
Compare two MarketReports and produce a list of ChangeEvents.
Used by the monitoring system when refreshing a monitored company.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from schemas import ChangeEvent, MarketReport


def _parse_price(price: str | None) -> float | None:
    """Extract numeric value from price string (e.g. '$29/mo' -> 29)."""
    if not price:
        return None
    cleaned = re.sub(r"[^0-9.]", "", str(price))
    try:
        return float(cleaned) if cleaned else None
    except ValueError:
        return None


def _price_change_pct(old_val: float | None, new_val: float | None) -> float | None:
    """Return percentage change (positive = increase). None if either value missing or zero."""
    if old_val is None or new_val is None or old_val == 0:
        return None
    return ((new_val - old_val) / old_val) * 100


def _competitor_key(c: object) -> str:
    """Stable key for a competitor (company_url or company_name)."""
    if hasattr(c, "company_url") and getattr(c, "company_url"):
        return getattr(c, "company_url", "")
    return getattr(c, "company_name", "")


def _tier_price(tier: object) -> tuple[str, str | None]:
    """(tier_name, price) from a PricingTier or dict."""
    name = tier.get("name", "") if isinstance(tier, dict) else getattr(tier, "name", "")
    price = tier.get("price") if isinstance(tier, dict) else getattr(tier, "price", None)
    return (name or "Tier", price)


def _news_key(n: object) -> str:
    """Stable key for a news item (title + url)."""
    title = n.get("title", "") if isinstance(n, dict) else getattr(n, "title", "")
    url = n.get("url", "") if isinstance(n, dict) else getattr(n, "url", "")
    return f"{title}|{url}"


def _swot_lists(swot: object | None) -> tuple[list[str], list[str], list[str], list[str]]:
    """(strength, weakness, opportunity, threat) from SWOTItem or dict."""
    if not swot:
        return ([], [], [], [])
    if isinstance(swot, dict):
        return (
            list(swot.get("strength") or []),
            list(swot.get("weakness") or []),
            list(swot.get("opportunity") or []),
            list(swot.get("threat") or []),
        )
    return (
        list(getattr(swot, "strength", []) or []),
        list(getattr(swot, "weakness", []) or []),
        list(getattr(swot, "opportunity", []) or []),
        list(getattr(swot, "threat", []) or []),
    )


def detect_changes(
    old_report: MarketReport,
    new_report: MarketReport,
    monitor_id: str,
) -> list[ChangeEvent]:
    """
    Compare two MarketReports and return a list of ChangeEvents.
    Severity: critical (pricing +20%+, major feature removal), high (pricing change, new competitor),
    medium (new features, SWOT changes), low (new news).
    """
    events: list[ChangeEvent] = []
    base_name = new_report.base_company_data.company_name
    detected_at = datetime.now(timezone.utc).isoformat()

    old_competitors = {_competitor_key(c): c for c in (old_report.competitors or [])}
    new_competitors = {_competitor_key(c): c for c in (new_report.competitors or [])}

    # New competitors
    for url_key, new_c in new_competitors.items():
        if url_key not in old_competitors:
            name = getattr(new_c, "company_name", url_key)
            events.append(
                ChangeEvent(
                    monitored_company_id=monitor_id,
                    competitor_name=name,
                    change_type="new_competitor",
                    title="New competitor discovered",
                    description=f"Competitor '{name}' is now in the competitive set.",
                    new_value=url_key,
                    severity="high",
                    detected_at=detected_at,
                    source_url=getattr(new_c, "company_url", None),
                )
            )

    # Per-competitor: pricing, features, SWOT, news
    for url_key, new_c in new_competitors.items():
        old_c = old_competitors.get(url_key)
        comp_name = getattr(new_c, "company_name", url_key)
        comp_url = getattr(new_c, "company_url", None)
        new_data = getattr(new_c, "data", new_c) if hasattr(new_c, "data") else new_c
        old_data = getattr(old_c, "data", old_c) if old_c and hasattr(old_c, "data") else old_c

        if not old_data:
            continue

        new_tiers = getattr(new_data, "pricing_tiers", None) or (new_data.get("pricing_tiers") if isinstance(new_data, dict) else [])
        old_tiers = getattr(old_data, "pricing_tiers", None) or (old_data.get("pricing_tiers") if isinstance(old_data, dict) else [])
        old_tier_by_name = {_tier_price(t)[0]: _tier_price(t)[1] for t in old_tiers}
        for t in new_tiers:
            name, new_price = _tier_price(t)
            old_price = old_tier_by_name.get(name)
            if old_price is None:
                continue
            if (old_price or "").strip() == (new_price or "").strip():
                continue
            old_num = _parse_price(old_price)
            new_num = _parse_price(new_price)
            pct = _price_change_pct(old_num, new_num)
            if pct is None:
                severity = "high"
            elif pct >= 20:
                severity = "critical"
            elif pct <= -20:
                severity = "high"
            else:
                severity = "high"
            events.append(
                ChangeEvent(
                    monitored_company_id=monitor_id,
                    competitor_name=comp_name,
                    change_type="pricing_change",
                    title=f"Pricing change: {name}",
                    description=f"Price for tier '{name}' changed from {old_price} to {new_price}.",
                    old_value=old_price,
                    new_value=new_price,
                    severity=severity,
                    detected_at=detected_at,
                    source_url=comp_url,
                )
            )

        new_features = set((getattr(new_data, "feature_list", None) or new_data.get("feature_list") or []))
        old_features = set((getattr(old_data, "feature_list", None) or old_data.get("feature_list") or []))
        new_only = new_features - old_features
        removed = old_features - new_features
        for f in new_only:
            events.append(
                ChangeEvent(
                    monitored_company_id=monitor_id,
                    competitor_name=comp_name,
                    change_type="new_feature",
                    title=f"New feature: {f}",
                    description=f"Competitor '{comp_name}' now lists feature '{f}'.",
                    new_value=f,
                    severity="medium",
                    detected_at=detected_at,
                    source_url=comp_url,
                )
            )
        if removed:
            severity = "critical" if len(removed) > 3 else "high"
            events.append(
                ChangeEvent(
                    monitored_company_id=monitor_id,
                    competitor_name=comp_name,
                    change_type="removed_feature",
                    title="Features removed from listing",
                    description=f"Features no longer listed: {', '.join(sorted(removed)[:10])}{'...' if len(removed) > 10 else ''}.",
                    old_value=", ".join(sorted(removed)),
                    severity=severity,
                    detected_at=detected_at,
                    source_url=comp_url,
                )
            )

        new_swot = getattr(new_data, "swot_analysis", None) or (new_data.get("swot_analysis") if isinstance(new_data, dict) else None)
        old_swot = getattr(old_data, "swot_analysis", None) or (old_data.get("swot_analysis") if isinstance(old_data, dict) else None)
        n_s, n_w, n_o, n_t = _swot_lists(new_swot)
        o_s, o_w, o_o, o_t = _swot_lists(old_swot)
        if (set(n_s) != set(o_s)) or (set(n_w) != set(o_w)) or (set(n_o) != set(o_o)) or (set(n_t) != set(o_t)):
            events.append(
                ChangeEvent(
                    monitored_company_id=monitor_id,
                    competitor_name=comp_name,
                    change_type="swot_change",
                    title="SWOT analysis updated",
                    description=f"SWOT for '{comp_name}' has changed (strengths, weaknesses, opportunities, or threats).",
                    severity="medium",
                    detected_at=detected_at,
                    source_url=comp_url,
                )
            )

        new_news = getattr(new_data, "recent_news", None) or (new_data.get("recent_news") if isinstance(new_data, dict) else [])
        old_news = getattr(old_data, "recent_news", None) or (old_data.get("recent_news") if isinstance(old_data, dict) else [])
        old_news_keys = {_news_key(n) for n in old_news}
        for n in new_news:
            if _news_key(n) in old_news_keys:
                continue
            title = n.get("title", "") if isinstance(n, dict) else getattr(n, "title", "")
            events.append(
                ChangeEvent(
                    monitored_company_id=monitor_id,
                    competitor_name=comp_name,
                    change_type="news",
                    title=title or "New news item",
                    description=title or "New announcement or news.",
                    new_value=title,
                    severity="low",
                    detected_at=detected_at,
                    source_url=n.get("url") if isinstance(n, dict) else getattr(n, "url", None),
                )
            )

    return events
