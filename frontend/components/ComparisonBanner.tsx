import type { ComparisonSummary } from "@/lib/types";
import { getMetricValue } from "@/lib/metric-utils";
import { SourcesInfo } from "@/components/SourcesInfo";

export interface ComparisonBannerProps {
  comparisons: ComparisonSummary;
}

function AIEstimatedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
      🤖 AI-Estimated
    </span>
  );
}

export function ComparisonBanner({ comparisons }: ComparisonBannerProps) {
  const sources = comparisons.data_sources ?? [];
  const hasSources = sources.length > 0;

  return (
    <div className="space-y-2">
      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-gray-500">Win rate</p>
            <AIEstimatedBadge />
          </div>
          <p className="text-2xl font-semibold text-gray-900">{getMetricValue(comparisons.win_rate)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-gray-500">Market share (est.)</p>
            <AIEstimatedBadge />
          </div>
          <p className="text-2xl font-semibold text-gray-900">{getMetricValue(comparisons.market_share_estimate)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-gray-500">Pricing advantage</p>
            <AIEstimatedBadge />
          </div>
          <p className="text-lg font-semibold text-gray-900">{getMetricValue(comparisons.pricing_advantage)}</p>
        </div>
      </div>
      {hasSources && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <SourcesInfo sources={sources} label="AI-estimated • Sources" compact />
          {comparisons.confidence_note && (
            <span className="max-w-xl truncate" title={comparisons.confidence_note}>
              {comparisons.confidence_note}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
