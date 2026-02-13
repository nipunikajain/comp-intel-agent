"use client";

import { useRef, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type GeographicScope = "global" | "continent" | "country" | "region";

function scopeBadgeText(
  geographicScope?: GeographicScope,
  geographicLocation?: string | null
): string {
  if (geographicScope === "global" || !geographicLocation) return "🌍 Global";
  if (geographicScope === "country") return `🇨🇦 ${geographicLocation}`;
  return `📍 ${geographicLocation}`;
}

interface DashboardHeaderProps {
  tickerItems?: string[];
  geographicScope?: GeographicScope;
  geographicLocation?: string | null;
  /** Total alert count for the badge */
  alertCount?: number;
  /** List of alert titles to show in the dropdown (so users can see what the alerts are) */
  alertItems?: string[];
  /** Called when user clicks "View Alerts tab" in the dropdown */
  onAlertsClick?: () => void;
}

const DEFAULT_TICKER = [
  "QuickBooks announced 40% price increase for Desktop Pro",
  "Xero launched new AI features",
  "NetSuite acquired CloudTech",
];

export function DashboardHeader({
  tickerItems = DEFAULT_TICKER,
  geographicScope = "global",
  geographicLocation,
  alertCount,
  alertItems,
  onAlertsClick,
}: DashboardHeaderProps) {
  const [alertsOpen, setAlertsOpen] = useState(false);
  const alertsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (alertsRef.current && !alertsRef.current.contains(e.target as Node)) {
        setAlertsOpen(false);
      }
    }
    if (alertsOpen) document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [alertsOpen]);

  const tickerText = tickerItems.length > 0 ? tickerItems.join(" · ") : "No alerts today.";
  const scopeBadge = scopeBadgeText(geographicScope, geographicLocation);
  const count = alertCount ?? alertItems?.length ?? 0;
  const list = alertItems ?? tickerItems;

  return (
    <header
      className="sticky top-0 z-50 w-full border-b border-white/10 bg-gradient-to-r from-slate-800 via-blue-900 to-indigo-900 text-white shadow-lg"
      style={{
        background: "linear-gradient(90deg, #1e293b 0%, #1e3a5f 40%, #312e81 100%)",
      }}
    >
      <div className="container flex h-14 items-center justify-between gap-4 px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {(geographicScope || geographicLocation) && (
            <Badge className="shrink-0 bg-white/20 text-white hover:bg-white/30">
              {scopeBadge}
            </Badge>
          )}
          <span className="shrink-0 text-sm font-semibold text-white/90">
            What&apos;s New Today:
          </span>
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="truncate text-sm text-white/95" title={tickerText}>
              {tickerText}
            </p>
          </div>
        </div>
        <div className="relative flex shrink-0 items-center gap-2" ref={alertsRef}>
          <Button
            variant="secondary"
            size="sm"
            className="relative bg-white/15 text-white hover:bg-white/25"
            onClick={() => setAlertsOpen((o) => !o)}
            aria-expanded={alertsOpen}
            aria-haspopup="true"
          >
            <Bell className="mr-1.5 h-4 w-4" />
            Alerts
            {count > 0 && (
              <Badge
                variant="destructive"
                className="absolute -right-1 -top-1 h-5 min-w-5 px-1 text-xs"
              >
                {count}
              </Badge>
            )}
          </Button>
          {alertsOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 min-w-[280px] max-w-[360px] rounded-lg border border-gray-200 bg-white py-2 shadow-lg">
              <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Recent alerts
              </p>
              {list.length > 0 ? (
                <ul className="max-h-64 overflow-y-auto">
                  {list.slice(0, 15).map((item, i) => (
                    <li
                      key={i}
                      className="border-b border-gray-100 px-3 py-2 text-left text-sm text-gray-800 last:border-0"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-2 text-sm text-gray-500">No alerts right now.</p>
              )}
              {onAlertsClick && (
                <div className="mt-1 border-t border-gray-100 px-2 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-center text-gray-700"
                    onClick={() => {
                      onAlertsClick();
                      setAlertsOpen(false);
                    }}
                  >
                    View full Alerts tab
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
