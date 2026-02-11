/**
 * Pricing comparison utilities.
 * Normalizes price strings to a comparable monthly per-unit value to avoid
 * absurd percentages (e.g. comparing $2,500/year to $30/mo as 2500 vs 30).
 */

export interface NormalizeResult {
  /** Normalized monthly per-unit price, or null if unparseable */
  monthly: number | null;
  /** Human-readable note for tooltip (e.g. "Annual $2,500 → ~$208/mo") */
  note: string | null;
  /** Whether annual pricing was detected and converted */
  wasAnnual: boolean;
  /** Whether per-user or per-seat was detected (e.g. "for 25 users") */
  wasPerUser: boolean;
}

/**
 * Normalize a price string to a comparable monthly per-unit number.
 * Handles: $25/mo, $300/year, $2,500 annually for 25 users, per user, Free, Custom, etc.
 */
export function normalizeToMonthlyPrice(priceString: string | null): NormalizeResult {
  const empty: NormalizeResult = { monthly: null, note: null, wasAnnual: false, wasPerUser: false };
  if (!priceString || typeof priceString !== "string") return empty;
  const raw = priceString.trim();
  const lower = raw.toLowerCase();

  // "Free" → 0
  if (lower === "free" || lower === "free tier") {
    return { monthly: 0, note: "Free tier", wasAnnual: false, wasPerUser: false };
  }
  // "Custom", "Contact us", "Enterprise" → not comparable
  if (
    lower.includes("contact") ||
    lower.includes("custom") ||
    (lower.includes("enterprise") && !/\d|\./.test(raw)) ||
    lower === "—" ||
    lower === "n/a"
  ) {
    return empty;
  }

  // Extract first number (allow commas and one decimal)
  const numberMatch = raw.replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d+)?)/);
  const num = numberMatch ? parseFloat(numberMatch[1]) : null;
  if (num === null || !Number.isFinite(num)) return empty;

  // Detect billing period
  const isAnnual =
    lower.includes("annual") ||
    lower.includes("yearly") ||
    lower.includes("/year") ||
    lower.includes("/yr") ||
    lower.includes("per year");
  const isMonthly =
    lower.includes("/mo") ||
    lower.includes("/month") ||
    lower.includes("monthly") ||
    lower.includes("per month");

  // Detect "for N users" (total price for N users → divide by N to get per-user)
  let usersDivisor: number | null = null;
  const perUserMatch = lower.match(/(?:for|up to)\s*(\d+)\s*users?/);
  if (perUserMatch) {
    usersDivisor = parseInt(perUserMatch[1], 10);
  }
  // "$99/month per user" is already per-user per month — do not divide

  let monthly = num;
  let note: string | null = null;
  const wasAnnual = isAnnual;
  const wasPerUser = usersDivisor !== null;

  if (isAnnual) {
    monthly = num / 12;
    note = `Annual $${num.toLocaleString()} → ~$${Math.round(monthly * 10) / 10}/mo`;
  } else if (!isMonthly && !isAnnual) {
    // Assume monthly if we only see a number (e.g. "$25")
    monthly = num;
  }

  if (usersDivisor !== null && usersDivisor > 0) {
    monthly = monthly / usersDivisor;
    if (note) note += `, ÷${usersDivisor} users`;
    else note = `Per-user price → ~$${Math.round(monthly * 10) / 10}/user/mo`;
  }

  if (!note && monthly !== num) note = `~$${Math.round(monthly * 10) / 10}/mo`;
  return { monthly, note, wasAnnual, wasPerUser };
}

export interface PriceDifferenceResult {
  percentage: number | null;
  direction: "lower" | "higher" | "equal";
  baseMonthly: number | null;
  competitorMonthly: number | null;
  comparable: boolean;
  baseNote: string | null;
  competitorNote: string | null;
}

const MAX_REASONABLE_PCT = 500;
const CAP_DISPLAY_PCT = 200;

/**
 * Compare two price strings using normalized monthly values.
 * Returns comparable: false if either price cannot be normalized.
 */
export function calculatePriceDifference(
  basePrice: string | null,
  competitorPrice: string | null
): PriceDifferenceResult {
  const base = normalizeToMonthlyPrice(basePrice);
  const comp = normalizeToMonthlyPrice(competitorPrice);
  const result: PriceDifferenceResult = {
    percentage: null,
    direction: "equal",
    baseMonthly: base.monthly,
    competitorMonthly: comp.monthly,
    comparable: false,
    baseNote: base.note,
    competitorNote: comp.note,
  };

  if (base.monthly === null || comp.monthly === null) {
    return result;
  }
  result.comparable = true;

  if (comp.monthly === 0 && base.monthly === 0) {
    result.direction = "equal";
    result.percentage = 0;
    return result;
  }
  if (comp.monthly === 0) {
    result.direction = "higher";
    result.percentage = 100;
    return result;
  }

  const pct = ((comp.monthly - base.monthly) / comp.monthly) * 100;
  result.percentage = Math.round(pct * 10) / 10;
  if (Math.abs(pct) < 0.5) {
    result.direction = "equal";
    result.percentage = 0;
  } else {
    result.direction = pct > 0 ? "lower" : "higher";
  }
  return result;
}

/**
 * Format the difference for display: cap at 200% and show "Significantly higher/lower" when needed.
 */
export function formatPriceDifference(result: PriceDifferenceResult): {
  label: string;
  lower: boolean;
  tooltip: string;
} {
  if (!result.comparable) {
    return {
      label: "Different pricing models",
      lower: false,
      tooltip: "Prices could not be normalized to the same units (e.g. annual vs monthly, per-user vs total).",
    };
  }
  if (result.percentage === null) {
    return { label: "—", lower: false, tooltip: "" };
  }
  if (result.direction === "equal") {
    const tooltipParts: string[] = ["Prices normalized to monthly for comparison."];
    if (result.baseNote) tooltipParts.push(`Base: ${result.baseNote}`);
    if (result.competitorNote) tooltipParts.push(`Competitor: ${result.competitorNote}`);
    return {
      label: "Equal",
      lower: true,
      tooltip: tooltipParts.join(" "),
    };
  }

  const absPct = Math.abs(result.percentage);
  const lower = result.direction === "lower";
  if (absPct > CAP_DISPLAY_PCT || (result.percentage !== null && Math.abs(result.percentage) > MAX_REASONABLE_PCT)) {
    return {
      label: `Significantly ${lower ? "lower" : "higher"}`,
      lower,
      tooltip: `Pricing models differ significantly. Normalized: base ~$${result.baseMonthly?.toFixed(1) ?? "?"}/mo vs competitor ~$${result.competitorMonthly?.toFixed(1) ?? "?"}/mo. ${result.baseNote ?? ""} ${result.competitorNote ?? ""}`.trim(),
    };
  }

  const tooltipParts: string[] = ["Prices normalized to monthly per-user rate for comparison."];
  if (result.baseNote) tooltipParts.push(`Base: ${result.baseNote}`);
  if (result.competitorNote) tooltipParts.push(`Competitor: ${result.competitorNote}`);

  return {
    label: `${Math.round(absPct)}% ${lower ? "lower" : "higher"}`,
    lower,
    tooltip: tooltipParts.join(" "),
  };
}
