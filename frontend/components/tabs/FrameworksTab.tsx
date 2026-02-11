"use client";

import React, { useState, useCallback } from "react";
import type { MarketReport } from "@/lib/types";
import type { CompetitiveFramework } from "@/lib/types";
import {
  generateFramework,
  FRAMEWORK_TYPES,
  type FrameworkType,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Download } from "lucide-react";

const FRAMEWORK_LABELS: Record<FrameworkType, string> = {
  positioning_matrix: "Positioning Matrix",
  pricing_power: "Pricing Power",
  feature_gap: "Feature Gap",
  porters_five: "Porter's Five Forces",
  value_chain: "Value Chain",
};

export interface FrameworksTabProps {
  report: MarketReport;
  jobId: string | null;
}

function PositioningMatrixViz({ data }: { data: Record<string, unknown> }) {
  const axes = data.axes as { x?: string; y?: string } | undefined;
  const companies = (data.companies as Array<{ name: string; x_score?: number; y_score?: number; bubble_size?: string }>) ?? [];
  const xLabel = axes?.x ?? "X";
  const yLabel = axes?.y ?? "Y";
  const scale = (v: number) => Math.max(0, Math.min(10, v)) * 10;

  return (
    <div className="space-y-4">
      <div className="flex justify-between text-xs font-medium text-gray-500">
        <span>{yLabel} ↑</span>
        <span className="sr-only">2×2 grid</span>
        <span>→ {xLabel}</span>
      </div>
      <div
        className="relative h-[320px] w-full max-w-2xl rounded-xl border border-gray-200 bg-gray-50/50"
        style={{ aspectRatio: "1" }}
        aria-label="Positioning matrix"
      >
        {/* Grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between py-2 px-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-px w-full bg-gray-200" />
          ))}
        </div>
        <div className="absolute inset-0 flex flex-row justify-between py-2 px-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-full w-px bg-gray-200" />
          ))}
        </div>
        {/* Companies as positioned dots */}
        {companies.map((c, i) => {
          const x = scale(Number(c.x_score) ?? 5);
          const y = 100 - scale(Number(c.y_score) ?? 5);
          const size = c.bubble_size === "large" ? 14 : c.bubble_size === "small" ? 8 : 11;
          const colors = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed"];
          const color = colors[i % colors.length];
          return (
            <div
              key={c.name}
              className="absolute flex items-center justify-center rounded-full text-white text-[10px] font-semibold shadow-md"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: size * 2,
                height: size * 2,
                minWidth: 24,
                minHeight: 24,
                backgroundColor: color,
                transform: "translate(-50%, -50%)",
              }}
              title={`${c.name}: ${xLabel}=${c.x_score}, ${yLabel}=${c.y_score}`}
            >
              {c.name.slice(0, 2).toUpperCase()}
            </div>
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-3 text-sm">
        {companies.map((c, i) => {
          const colors = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed"];
          return (
            <li key={c.name} className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: colors[i % colors.length] }}
              />
              <span className="text-gray-700">{c.name}</span>
              <span className="text-gray-500 text-xs">
                ({xLabel}: {c.x_score ?? "—"}, {yLabel}: {c.y_score ?? "—"})
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PricingPowerViz({ data }: { data: Record<string, unknown> }) {
  const companies = (data.companies as Array<{ name: string; score?: number; factors?: string[] }>) ?? [];
  const insights = (data.insights as string) ?? "";

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {companies.map((c) => {
          const score = Math.max(0, Math.min(100, Number(c.score) ?? 0));
          return (
            <div key={c.name} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-gray-900">{c.name}</span>
                <span className="text-gray-600">{score}/100</span>
              </div>
              <div className="h-6 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: `${score}%` }}
                />
              </div>
              {Array.isArray(c.factors) && c.factors.length > 0 && (
                <ul className="mt-1 list-inside list-disc text-xs text-gray-500">
                  {c.factors.slice(0, 3).map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {insights && (
        <p className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-sm text-gray-700">
          {insights}
        </p>
      )}
    </div>
  );
}

function FeatureGapViz({ data }: { data: Record<string, unknown> }) {
  const categories = (data.categories as Array<{ name: string; features: Array<{ name: string; companies: Record<string, boolean> }> }>) ?? [];
  const companyNames = new Set<string>();
  categories.forEach((cat) =>
    cat.features?.forEach((f) => Object.keys(f.companies ?? {}).forEach((c) => companyNames.add(c)))
  );
  const companies = Array.from(companyNames);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[500px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2 text-left font-semibold text-gray-700">Feature / Category</th>
            {companies.map((c) => (
              <th key={c} className="px-3 py-2 text-center font-medium text-gray-700">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <React.Fragment key={cat.name}>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td colSpan={companies.length + 1} className="px-3 py-1.5 font-medium text-gray-800">
                  {cat.name}
                </td>
              </tr>
              {(cat.features ?? []).map((f, i) => (
                <tr key={`${cat.name}-${i}`} className="border-b border-gray-100">
                  <td className="px-3 py-1.5 text-gray-600 pl-6">{f.name}</td>
                  {companies.map((co) => {
                    const has = (f.companies ?? {})[co];
                    return (
                      <td key={co} className="px-3 py-1.5 text-center">
                        <span
                          className={`inline-block h-5 w-5 rounded ${has ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-400"}`}
                          title={has ? "Has feature" : "No"}
                          aria-label={has ? "Yes" : "No"}
                        >
                          {has ? "✓" : "—"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PortersFiveViz({ data }: { data: Record<string, unknown> }) {
  const forces = (data.forces as Array<{ name: string; intensity?: string; factors?: string[] }>) ?? [];

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Pentagon-style: 5 segments in a circle */}
      <div className="relative h-64 w-64 sm:h-72 sm:w-72">
        {forces.slice(0, 5).map((f, i) => {
          const angle = (i * 72 - 90) * (Math.PI / 180);
          const r = 80;
          const x = 50 + r * Math.cos(angle);
          const y = 50 + r * Math.sin(angle);
          const intensity = (f.intensity ?? "medium").toLowerCase();
          return (
            <div
              key={f.name}
              className="absolute flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-2 shadow-sm"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: "translate(-50%, -50%)",
                width: "44%",
              }}
            >
              <span className="text-[10px] font-semibold text-gray-700 text-center leading-tight">
                {f.name}
              </span>
              <span
                className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${intensity === "high" ? "bg-red-500" : intensity === "low" ? "bg-emerald-500" : "bg-amber-500"}`}
              >
                {intensity}
              </span>
            </div>
          );
        })}
      </div>
      <ul className="w-full max-w-xl space-y-3">
        {forces.map((f) => (
          <li key={f.name} className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">{f.name}</span>
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium text-white ${(f.intensity ?? "").toLowerCase() === "high" ? "bg-red-500" : (f.intensity ?? "").toLowerCase() === "low" ? "bg-emerald-500" : "bg-amber-500"}`}
              >
                {(f.intensity ?? "medium").toLowerCase()}
              </span>
            </div>
            {Array.isArray(f.factors) && f.factors.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-xs text-gray-600">
                {f.factors.map((factor, i) => (
                  <li key={i}>{factor}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ValueChainViz({ data }: { data: Record<string, unknown> }) {
  const stages = (data.stages as Array<{ name: string; companies: Array<{ name: string; strength?: string }> }>) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 overflow-x-auto pb-2">
        {stages.map((stage) => (
          <div
            key={stage.name}
            className="flex min-w-[200px] flex-col rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {stage.name}
            </p>
            <ul className="space-y-1.5">
              {(stage.companies ?? []).map((c) => {
                const s = (c.strength ?? "medium").toLowerCase();
                return (
                  <li key={c.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-gray-900">{c.name}</span>
                    <span
                      className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                        s === "strong"
                          ? "bg-emerald-100 text-emerald-800"
                          : s === "weak"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {s}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function FrameworkVisualization({
  framework,
}: {
  framework: CompetitiveFramework;
}) {
  const { framework_type, data } = framework;
  switch (framework_type) {
    case "positioning_matrix":
      return <PositioningMatrixViz data={data as Record<string, unknown>} />;
    case "pricing_power":
      return <PricingPowerViz data={data as Record<string, unknown>} />;
    case "feature_gap":
      return <FeatureGapViz data={data as Record<string, unknown>} />;
    case "porters_five":
      return <PortersFiveViz data={data as Record<string, unknown>} />;
    case "value_chain":
      return <ValueChainViz data={data as Record<string, unknown>} />;
    default:
      return (
        <pre className="overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs">
          {JSON.stringify(data, null, 2)}
        </pre>
      );
  }
}

export function FrameworksTab({ report, jobId }: FrameworksTabProps) {
  const [selectedType, setSelectedType] = useState<FrameworkType>("positioning_matrix");
  const [framework, setFramework] = useState<CompetitiveFramework | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!jobId) {
      setError("No analysis job; run an analysis first.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await generateFramework(jobId, selectedType);
      setFramework(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate framework");
      setFramework(null);
    } finally {
      setLoading(false);
    }
  }, [jobId, selectedType]);

  const handleExport = useCallback(() => {
    if (!framework) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            ...framework,
            exported_at: new Date().toISOString(),
          },
          null,
          2
        ),
      ],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `framework-${framework.framework_type}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [framework]);

  return (
    <div className="w-full space-y-6">
      <Card className="rounded-xl border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Competitive Frameworks</CardTitle>
          <p className="text-sm text-gray-500">
            Generate industry-aware frameworks from your analysis — positioning matrix, pricing power, feature gap, Porter&apos;s Five Forces, value chain.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="framework-type" className="text-sm font-medium text-gray-700">
              Framework type
            </label>
            <select
              id="framework-type"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as FrameworkType)}
              disabled={loading}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              {FRAMEWORK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FRAMEWORK_LABELS[t]}
                </option>
              ))}
            </select>
            <Button
              onClick={handleGenerate}
              disabled={loading || !jobId}
              className="rounded-lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                "Generate"
              )}
            </Button>
            {framework && (
              <Button variant="outline" size="sm" onClick={handleExport} className="rounded-lg">
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            )}
          </div>
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {framework && (
        <Card className="rounded-xl border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">{framework.title}</CardTitle>
            <p className="text-sm text-gray-600">{framework.description}</p>
            <p className="text-xs text-gray-500">
              Generated {framework.generated_at ? new Date(framework.generated_at).toLocaleString() : ""}
            </p>
          </CardHeader>
          <CardContent>
            <FrameworkVisualization framework={framework} />
          </CardContent>
        </Card>
      )}

      {!framework && !loading && jobId && (
        <p className="text-sm text-gray-500">
          Select a framework type and click Generate to create a consultant-style deliverable from your analysis.
        </p>
      )}
    </div>
  );
}
