"use client";

import useSWR from "swr";
import { cn } from "@/lib/utils";

interface Health {
  ok: boolean;
  activeCases: number;
  criticalCases: number;
  serverTime: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<Health>);

/** Live "how many emergencies are open right now" pill, polled every 3 s. */
export function EmergencyIndicator() {
  const { data, error } = useSWR<Health>("/api/health", fetcher, { refreshInterval: 3000 });
  const offline = !!error;
  const active = data?.activeCases ?? 0;
  const critical = data?.criticalCases ?? 0;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
        offline
          ? "border-slate-300 bg-slate-100 text-slate-500"
          : active > 0
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-emerald-200 bg-emerald-50 text-emerald-700",
      )}
      aria-live="polite"
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          offline ? "bg-slate-400" : active > 0 ? "bg-red-600 pulse-ring" : "bg-emerald-500",
        )}
        aria-hidden
      />
      {offline ? "Offline" : active === 0 ? "No active emergencies" : `${active} active · ${critical} critical`}
    </div>
  );
}
