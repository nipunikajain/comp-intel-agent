"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initAnalysis } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = baseUrl.trim();
    if (!url) {
      setError("Please enter your company URL");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { job_id } = await initAnalysis(url);
      router.push(`/dashboard?job_id=${job_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start analysis");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 p-8">
      <div className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
        <LayoutDashboard className="h-8 w-8 text-primary" />
        CompIntel
      </div>
      <p className="text-slate-600">Competitive Intelligence — discover market and pricing from your company URL</p>

      <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-3">
        <label htmlFor="base_url" className="text-sm font-medium text-slate-700">
          Enter your company URL
        </label>
        <Input
          id="base_url"
          type="url"
          placeholder="https://www.sage.com"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          disabled={loading}
          className="bg-white"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Starting analysis…
            </>
          ) : (
            "Analyze market"
          )}
        </Button>
      </form>

      <p className="text-center text-xs text-slate-500">
        We’ll scrape your site for pricing and features, discover top competitors, and build a comparison report.
      </p>
    </main>
  );
}
