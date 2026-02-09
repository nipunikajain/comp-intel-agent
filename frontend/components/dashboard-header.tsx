"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DashboardHeaderProps {
  tickerItems?: string[];
}

const DEFAULT_TICKER = [
  "QuickBooks announced 40% price increase for Desktop Pro",
  "Xero launched new AI features",
  "NetSuite acquired CloudTech",
];

export function DashboardHeader({ tickerItems = DEFAULT_TICKER }: DashboardHeaderProps) {
  const tickerText = tickerItems.length > 0 ? tickerItems.join(" · ") : "No alerts today.";

  return (
    <header
      className="sticky top-0 z-50 w-full border-b border-white/10 bg-gradient-to-r from-slate-800 via-blue-900 to-indigo-900 text-white shadow-lg"
      style={{
        background: "linear-gradient(90deg, #1e293b 0%, #1e3a5f 40%, #312e81 100%)",
      }}
    >
      <div className="container flex h-14 items-center justify-between gap-4 px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="shrink-0 text-sm font-semibold text-white/90">
            What&apos;s New Today:
          </span>
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="truncate text-sm text-white/95" title={tickerText}>
              {tickerText}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="relative bg-white/15 text-white hover:bg-white/25"
          >
            <Bell className="mr-1.5 h-4 w-4" />
            Alerts
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-5 min-w-5 px-1 text-xs"
            >
              3
            </Badge>
          </Button>
        </div>
      </div>
    </header>
  );
}
