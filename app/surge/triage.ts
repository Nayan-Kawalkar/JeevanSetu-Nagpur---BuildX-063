import { TRIAGE_LABEL, type TriageTag } from "@/lib/types";

/**
 * Triage colour is never the only signal.
 *
 * START triage is a colour vocabulary and responders read it fluently, so dropping the colour
 * would be worse than useless. But roughly one man in twelve cannot separate the red tag from
 * the green one, and a surge board is read fast, at a distance, under bad light. So every place
 * a tag appears it carries its word — Immediate, Delayed, Minor, Expectant — and the colour is
 * reinforcement, not the message.
 */
export interface TriageStyle {
  /** Big count tile. */
  tile: string;
  value: string;
  /** Inline chip in a list row. */
  chip: string;
  /** Bar/segment fill for the triage mix. */
  bar: string;
}

export const TRIAGE_STYLE: Record<TriageTag, TriageStyle> = {
  RED: {
    tile: "border-red-300 bg-red-50",
    value: "text-red-700",
    chip: "bg-red-600 text-white ring-red-700",
    bar: "bg-red-600",
  },
  YELLOW: {
    tile: "border-amber-300 bg-amber-50",
    value: "text-amber-800",
    chip: "bg-amber-400 text-amber-950 ring-amber-500",
    bar: "bg-amber-400",
  },
  GREEN: {
    tile: "border-emerald-300 bg-emerald-50",
    value: "text-emerald-700",
    chip: "bg-emerald-600 text-white ring-emerald-700",
    bar: "bg-emerald-600",
  },
  BLACK: {
    tile: "border-slate-400 bg-slate-100",
    value: "text-slate-900",
    chip: "bg-slate-900 text-white ring-slate-900",
    bar: "bg-slate-900",
  },
};

/** "RED · Immediate" — the pair, always together. */
export function triageText(tag: TriageTag): string {
  return `${tag} · ${TRIAGE_LABEL[tag]}`;
}
