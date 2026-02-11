export interface SWOTData {
  strength?: string[];
  weakness?: string[];
  opportunity?: string[];
  threat?: string[];
}

export interface SWOTGridProps {
  swot: SWOTData | null;
  title?: string;
}

export function SWOTGrid({ swot, title = "SWOT" }: SWOTGridProps) {
  if (!swot) return <p className="text-sm text-gray-500">No SWOT data</p>;

  const cells = [
    { label: "Strengths", items: swot.strength ?? [], className: "border-green-200 bg-green-50/50" },
    { label: "Weaknesses", items: swot.weakness ?? [], className: "border-red-200 bg-red-50/30" },
    { label: "Opportunities", items: swot.opportunity ?? [], className: "border-blue-200 bg-blue-50/30" },
    { label: "Threats", items: swot.threat ?? [], className: "border-amber-200 bg-amber-50/30" },
  ];

  return (
    <div>
      {title && <h4 className="mb-2 text-sm font-semibold text-gray-900">{title}</h4>}
      <div className="grid grid-cols-2 gap-3">
        {cells.map(({ label, items, className }) => (
          <div key={label} className={`rounded-lg border p-3 ${className}`}>
            <p className="text-xs font-medium text-gray-500">{label}</p>
            <ul className="mt-1 list-inside list-disc text-sm text-gray-700">
              {items.length ? items.map((s, i) => <li key={i}>{s}</li>) : <li>—</li>}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
