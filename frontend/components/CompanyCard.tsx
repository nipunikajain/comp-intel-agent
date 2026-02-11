import type { BaseProfile, CompetitorProfile, SourceAttribution } from "@/lib/types";
import { SourceBadge } from "@/components/SourceBadge";
import { SourcesInfo } from "@/components/SourcesInfo";

export interface CompanyCardProps {
  /** Base company profile or competitor profile (with company_name, pricing_tiers, feature_list). */
  profile: BaseProfile | CompetitorProfile;
  /** Optional label, e.g. "Your company" or "Competitor" */
  label?: string;
  /** Optional source attributions (e.g. profile.data.sources when profile is CompetitorProfile) */
  sources?: SourceAttribution[];
}

export function CompanyCard({ profile, label, sources }: CompanyCardProps) {
  const name = profile.company_name;
  const url = profile.company_url;
  const pricingTiers = "pricing_tiers" in profile ? profile.pricing_tiers : profile.data.pricing_tiers;
  const featureList = "feature_list" in profile ? profile.feature_list : profile.data.feature_list;
  const displaySources = sources ?? ("data" in profile ? profile.data?.sources : undefined) ?? [];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {label && <p className="text-xs font-medium text-gray-500">{label}</p>}
          <h3 className="text-lg font-semibold text-gray-900">{name}</h3>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline hover:text-blue-700">
              {url}
            </a>
          )}
        </div>
        {displaySources.length > 0 && (
          <SourcesInfo sources={displaySources} label="ℹ️ Sources" compact />
        )}
      </div>
      <div className="mt-3">
        <p className="text-sm font-medium text-gray-500">Pricing</p>
        <ul className="list-inside list-disc text-sm text-gray-700">
          {pricingTiers.length ? pricingTiers.map((t) => (
            <li key={t.name} className="flex flex-wrap items-center gap-1">
              <span>{t.name}: {t.price ?? "—"}</span>
              {"source" in t && t.source && (
                <SourceBadge source={t.source} />
              )}
            </li>
          )) : <li>No pricing found</li>}
        </ul>
      </div>
      <div className="mt-2">
        <p className="text-sm font-medium text-gray-500">Features</p>
        <ul className="list-inside list-disc text-sm text-gray-700">
          {featureList.length ? featureList.slice(0, 8).map((f, i) => <li key={i}>{f}</li>) : <li>—</li>}
        </ul>
      </div>
    </div>
  );
}
