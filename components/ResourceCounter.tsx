"use client";

import { cn } from "@/lib/utils";

/**
 * Big +/- stepper for a coordinator updating bed counts on a ward phone.
 * Every press is a human confirming the number, which is what makes the
 * freshness score meaningful, so the control is deliberately large and hard to mis-tap.
 */
export function ResourceCounter({
  label,
  available,
  total,
  disabled,
  onChange,
}: {
  label: string;
  available: number;
  total: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  const none = available === 0;
  const absent = total === 0;

  return (
    <div className={cn("rounded-lg border p-3", none && !absent ? "border-red-200 bg-red-50" : "border-border bg-white")}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span className="text-xs text-muted">of {total}</span>
      </div>
      {absent ? (
        <p className="mt-2 text-sm text-muted">Not available at this hospital</p>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange(Math.max(0, available - 1))}
            disabled={disabled || available <= 0}
            aria-label={`Reduce available ${label}`}
            className="h-11 w-11 rounded-lg border border-slate-300 bg-white text-xl font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            −
          </button>
          <output
            aria-label={`${label} available`}
            className={cn(
              "flex-1 rounded-lg py-2 text-center text-2xl font-bold tabular-nums",
              none ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-900",
            )}
          >
            {available}
          </output>
          <button
            type="button"
            onClick={() => onChange(Math.min(total, available + 1))}
            disabled={disabled || available >= total}
            aria-label={`Increase available ${label}`}
            className="h-11 w-11 rounded-lg border border-slate-300 bg-white text-xl font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

/** On-call toggle for a specialist or trauma team. */
export function OnCallToggle({
  label,
  name,
  onCall,
  note,
  disabled,
  onChange,
}: {
  label: string;
  name?: string;
  onCall: boolean;
  note?: string;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border p-3",
        onCall ? "border-emerald-200 bg-emerald-50" : "border-border bg-white",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="truncate text-xs text-muted">{onCall ? (name ?? "On call now") : (note ?? "Not on call")}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={onCall}
        aria-label={`${label} on call`}
        disabled={disabled}
        onClick={() => onChange(!onCall)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50",
          onCall ? "bg-emerald-600" : "bg-slate-300",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform",
            onCall ? "translate-x-[22px]" : "translate-x-0.5",
          )}
          aria-hidden
        />
      </button>
    </div>
  );
}
