"use client";

import { useState, useMemo } from "react";
import type { MarketReport } from "@/lib/types";
import { askAI } from "@/lib/api";
import type { DealContext } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Send, ChevronDown, ChevronUp } from "lucide-react";

export interface AskAIProps {
  jobId: string | null;
  /** Report used to populate "Competing against" and deal-specific prompts */
  report?: MarketReport | null;
}

interface QAPair {
  question: string;
  answer: string;
  sources_referenced: string[];
}

const SUGGESTED_QUESTIONS = [
  "What are the biggest competitive threats?",
  "How does our pricing compare?",
  "What features should we prioritize?",
  "Summarize the competitive landscape",
];

const COMPANY_SIZES = ["Startup", "SMB", "Mid-Market", "Enterprise"] as const;
const BUYER_PERSONAS = ["CEO/Founder", "CFO/Finance", "CTO/IT", "Operations", "Procurement"] as const;

/** Simple inline markdown: **bold**, [text](url), newlines as <br /> */
function renderAnswerText(text: string): React.ReactNode {
  if (!text) return null;
  const lines = text.split(/\n/);
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {line.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((segment, j) => {
            const bold = segment.match(/^\*\*([^*]+)\*\*$/);
            const link = segment.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
            if (bold) return <strong key={j}>{bold[1]}</strong>;
            if (link)
              return (
                <a
                  key={j}
                  href={link[2]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline hover:text-blue-700"
                >
                  {link[1]}
                </a>
              );
            return <span key={j}>{segment}</span>;
          })}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

export function AskAI({ jobId }: AskAIProps) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<QAPair[]>([]);
  const [dealContextExpanded, setDealContextExpanded] = useState(false);
  const [prospectCompany, setProspectCompany] = useState("");
  const [prospectSize, setProspectSize] = useState("");
  const [useCase, setUseCase] = useState("");
  const [buyerRole, setBuyerRole] = useState("");
  const [painPoint, setPainPoint] = useState("");

  const dealContext: DealContext | null = useMemo(() => {
    const hasAny =
      prospectCompany.trim() ||
      prospectSize ||
      useCase.trim() ||
      buyerRole ||
      painPoint.trim();
    if (!hasAny) return null;
    return {
      prospect_company: prospectCompany.trim() || "",
      prospect_size: prospectSize || "",
      use_case: useCase.trim() || "",
      buyer_role: buyerRole || "",
      pain_point: painPoint.trim() || "",
    };
  }, [prospectCompany, prospectSize, useCase, buyerRole, painPoint]);

  const handleSubmit = async (question: string) => {
    const q = question.trim();
    if (!q || !jobId) return;
    setError(null);
    setLoading(true);
    setInput("");
    try {
      const { answer, sources_referenced } = await askAI(jobId, q, dealContext ?? null);
      setHistory((prev) => [...prev, { question: q, answer, sources_referenced }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const dealStarterQuestions = useMemo(() => {
    if (!dealContext) return [];
    const company = prospectCompany.trim() || "this prospect";
    const size = prospectSize || "this size";
    const role = buyerRole || "buyer";
    return [
      `How should we position for ${company} (${size})?`,
      `What objections will the ${role} likely raise?`,
      "Give me a 30-second elevator pitch for this deal",
      "What proof points matter most for their pain point?",
    ];
  }, [dealContext, prospectCompany, prospectSize, buyerRole]);

  if (!jobId) return null;

  return (
    <section className="w-full space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
        Ask AI
      </h3>

      {/* Deal Context — expandable */}
      <div className="rounded-xl border border-gray-200 bg-gray-50/50">
        <button
          type="button"
          onClick={() => setDealContextExpanded((e) => !e)}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-100/80"
        >
          <span>Deal context</span>
          {dealContextExpanded ? (
            <ChevronUp className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          )}
        </button>
        {dealContextExpanded && (
          <div className="border-t border-gray-200 px-4 pb-4 pt-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Prospect company</label>
              <input
                type="text"
                value={prospectCompany}
                onChange={(e) => setProspectCompany(e.target.value)}
                placeholder="e.g. Acme Corp, Mid-market SaaS"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Company size</label>
              <select
                value={prospectSize}
                onChange={(e) => setProspectSize(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Select size</option>
                {COMPANY_SIZES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Use case</label>
              <input
                type="text"
                value={useCase}
                onChange={(e) => setUseCase(e.target.value)}
                placeholder="e.g. Replace legacy ERP, scale billing"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Buyer role</label>
              <select
                value={buyerRole}
                onChange={(e) => setBuyerRole(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Select role</option>
                {BUYER_PERSONAS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Pain point</label>
              <input
                type="text"
                value={painPoint}
                onChange={(e) => setPainPoint(e.target.value)}
                placeholder="e.g. Cost control, migration risk, need better reporting"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>
        )}
      </div>

      {/* Suggested questions — general + deal-specific when context set */}
      <div className="flex flex-wrap gap-2">
        {dealStarterQuestions.length > 0 &&
          dealStarterQuestions.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => handleSubmit(q)}
              disabled={loading}
              className="rounded-full border border-blue-200 bg-blue-50/50 px-3 py-1.5 text-xs font-medium text-blue-800 shadow-sm transition-colors hover:bg-blue-100 hover:border-blue-300 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => handleSubmit(q)}
            disabled={loading}
            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input row */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(input);
            }
          }}
          placeholder="Ask anything about this competitive analysis..."
          disabled={loading}
          className="min-w-[200px] flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
        />
        <Button
          type="button"
          onClick={() => handleSubmit(input)}
          disabled={loading || !input.trim()}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
          <span className="ml-2">Ask</span>
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {/* Q&A history */}
      <div className="space-y-4">
        {history.map((qa, i) => (
          <div key={i} className="space-y-2">
            {/* User question — right-aligned blue bubble */}
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-lg rounded-br-none bg-blue-600 px-4 py-2 text-sm text-white shadow-sm">
                {qa.question}
              </div>
            </div>
            {/* AI answer — left-aligned card */}
            <div className="flex justify-start">
              <Card className="max-w-[95%] rounded-xl border-gray-200 bg-gray-50/50 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                      AI-generated
                    </span>
                  </div>
                  <div className="text-sm text-gray-800 [&>strong]:font-semibold">
                    {renderAnswerText(qa.answer)}
                  </div>
                  {qa.sources_referenced.length > 0 && (
                    <div className="mt-3 border-t border-gray-200 pt-3">
                      <p className="text-xs font-medium text-gray-500">
                        Sources referenced
                      </p>
                      <ul className="mt-1 space-y-1">
                        {qa.sources_referenced.map((url, j) => (
                          <li key={j}>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="break-all text-xs text-blue-600 underline hover:text-blue-700"
                            >
                              {url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
