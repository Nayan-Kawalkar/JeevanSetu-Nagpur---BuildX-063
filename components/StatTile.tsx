import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "neutral" | "danger" | "warning" | "success";
}) {
  const toneClass = {
    neutral: "border-border bg-white",
    danger: "border-red-200 bg-red-50",
    warning: "border-amber-200 bg-amber-50",
    success: "border-emerald-200 bg-emerald-50",
  }[tone];

  const valueClass = {
    neutral: "text-slate-900",
    danger: "text-red-700",
    warning: "text-amber-800",
    success: "text-emerald-700",
  }[tone];

  return (
    <div className={cn("rounded-xl border p-4", toneClass)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cn("mt-1 text-3xl font-bold tabular-nums", valueClass)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
