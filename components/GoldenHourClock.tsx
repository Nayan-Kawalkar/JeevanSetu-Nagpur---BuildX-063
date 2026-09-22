"use client";

/**
 * The golden hour, as a clock a crew can read across a moving ambulance — Twist 4.
 *
 * Three rules shape this component.
 *
 * 1. **Never colour alone.** Every band is a word first ("tight", "critical") and a colour
 *    second, because a red bar means nothing on a sunlit screen or to a colour-blind medic.
 * 2. **Never read the clock during render.** `useNow(1000)` is null on the server and for the
 *    first paint, so until it arrives the component shows the absolute deadline time — a fact
 *    that does not depend on knowing "now" — rather than a countdown guessed from a clock it
 *    does not have.
 * 3. **Past sixty minutes is not hopeless.** The hour is a coordination target, not a verdict on
 *    a patient. Past it the clock says "past the first hour" and keeps counting up, factually.
 *
 * Coordination aid only. Nothing here diagnoses, prescribes or predicts an outcome.
 */

import { useNow } from "@/lib/hooks";
import type { GoldenHourBand, GoldenHourStatus } from "@/lib/services/goldenHour";
import { GOLDEN_HOUR_MINUTES } from "@/lib/types";
import { cn } from "@/lib/utils";

const MS_PER_MINUTE = 60_000;

/** Word, tone and bar colour per band. The word is the primary signal; colour only reinforces. */
const BAND: Record<GoldenHourBand, { word: string; text: string; bar: string; chip: string; track: string }> = {
  SAFE: {
    word: "safe",
    text: "text-emerald-800",
    bar: "bg-emerald-600",
    chip: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    track: "bg-emerald-100",
  },
  TIGHT: {
    word: "tight",
    text: "text-amber-900",
    bar: "bg-amber-500",
    chip: "bg-amber-50 text-amber-900 ring-amber-200",
    track: "bg-amber-100",
  },
  CRITICAL: {
    word: "critical",
    text: "text-red-800",
    bar: "bg-red-600",
    chip: "bg-red-50 text-red-800 ring-red-200",
    track: "bg-red-100",
  },
  EXPIRED: {
    word: "past the first hour",
    text: "text-slate-800",
    bar: "bg-slate-700",
    chip: "bg-slate-100 text-slate-800 ring-slate-300",
    track: "bg-slate-200",
  },
};

/** "23:41" in the browser's own zone — an absolute fact, safe to print without a live clock. */
export function clockTime(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "unknown time";
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Sixty minutes after the hour started, computed purely so it needs no clock. */
function deadlineFrom(startedAtIso: string): string {
  const at = Date.parse(startedAtIso);
  if (Number.isNaN(at)) return startedAtIso;
  return new Date(at + GOLDEN_HOUR_MINUTES * MS_PER_MINUTE).toISOString();
}

/** "12:04" left, or "+3:20" once the hour has gone past. Seconds come from the live clock. */
function faceFor(deadlineIso: string, now: number): { text: string; past: boolean } {
  const deadline = Date.parse(deadlineIso);
  if (Number.isNaN(deadline)) return { text: "—", past: false };
  const ms = deadline - now;
  const past = ms <= 0;
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return { text: `${past ? "+" : ""}${minutes}:${String(seconds).padStart(2, "0")}`, past };
}

export interface GoldenHourClockProps {
  /**
   * The status as computed by the caller against the same `now` it uses elsewhere, or null
   * before the shared clock has arrived (server render and first paint).
   */
  status: GoldenHourStatus | null;
  /** `incidentAt ?? createdAt`. Used to print the deadline while `status` is still null. */
  startedAt: string;
  /**
   * Epoch ms at which the clock stopped — handover, for a case that reached it. The face then
   * freezes on the figure it read at that instant instead of counting on against a finished case.
   */
  stoppedAt?: number;
  /** `large` for a page header, `compact` for a row in a list. */
  variant?: "large" | "compact";
  /** Says whether the hour is being measured from the injury or only from the call. */
  sourceNote?: string;
  className?: string;
}

/**
 * A live countdown of the first sixty minutes.
 *
 * `status` carries the band and the percentage; the seconds on the face are recomputed here
 * from the deadline so the digits tick once a second without the parent re-deriving anything.
 */
export function GoldenHourClock({
  status,
  startedAt,
  stoppedAt,
  variant = "large",
  sourceNote,
  className,
}: GoldenHourClockProps) {
  const now = useNow(1000);
  const deadlineAt = status?.deadlineAt ?? deadlineFrom(startedAt);
  const band = BAND[status?.band ?? "SAFE"];
  const percent = status === null ? 0 : status.percentUsed;
  const reading = stoppedAt ?? now;
  const face = reading === null ? null : faceFor(deadlineAt, reading);

  // Screen-reader sentence: the whole state in words, never colour, never a bare number.
  const spoken =
    status === null
      ? `First hour ends at ${clockTime(deadlineAt)}.`
      : status.expired
        ? `Past the first hour. It ended at ${clockTime(deadlineAt)}, ${status.elapsedMinutes} minutes after the incident.`
        : `${status.remainingMinutes} minutes of the first hour remaining, ending ${clockTime(deadlineAt)}. Status ${band.word}.`;

  if (variant === "compact") {
    return (
      <span className={cn("inline-flex items-center gap-2", className)} title={spoken}>
        <span className="sr-only">{spoken}</span>
        <span
          aria-hidden
          className={cn(
            "inline-flex items-baseline gap-1 rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums ring-1 ring-inset",
            band.chip,
          )}
        >
          {face === null ? `ends ${clockTime(deadlineAt)}` : face.text}
          <span className="text-[11px] font-medium uppercase tracking-wide">{band.word}</span>
        </span>
      </span>
    );
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span aria-hidden className={cn("text-4xl font-bold leading-none tabular-nums sm:text-5xl", band.text)}>
          {face === null ? "—:—" : face.text}
        </span>
        <span aria-hidden className={cn("text-base font-semibold", band.text)}>
          {status?.expired === true ? "past the first hour" : "left of the first hour"}
        </span>
        <span
          aria-hidden
          className={cn(
            "rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset",
            band.chip,
          )}
        >
          {band.word}
        </span>
      </div>
      <p className="sr-only" role="status">
        {spoken}
      </p>

      <div
        aria-hidden
        className={cn("mt-2 h-2.5 w-full overflow-hidden rounded-full", band.track)}
      >
        <div className={cn("h-full rounded-full transition-[width] duration-500", band.bar)} style={{ width: `${percent}%` }} />
      </div>

      <p aria-hidden className="mt-1.5 text-sm text-slate-600">
        {status === null
          ? `First hour ends ${clockTime(deadlineAt)}.`
          : status.expired
            ? `Started ${clockTime(status.startedAt)}, hour ended ${clockTime(deadlineAt)}. Care still matters — this is a coordination target, not a limit on the patient.`
            : `Started ${clockTime(status.startedAt)} · ${status.elapsedMinutes} of ${GOLDEN_HOUR_MINUTES} minutes used · ends ${clockTime(deadlineAt)}.`}
        {sourceNote !== undefined && ` ${sourceNote}`}
      </p>
    </div>
  );
}
