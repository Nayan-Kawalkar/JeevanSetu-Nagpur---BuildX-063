/** Tiny className joiner: skips falsy values so callers can write cn("a", cond && "b"). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Formats an ISO timestamp as HH:MM (24h) for timelines and "last updated" labels. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * How long ago something happened, as a unit and a number rather than a sentence.
 *
 * Split out from `timeAgo` so the wording can be translated. A formatter that returns
 * "8 min ago" can only ever be English, and it was landing inside translated sentences as
 * "शेवटची खात्री 8 min ago". The caller picks the words; this only does the arithmetic.
 */
export type Age = { unit: "now" } | { unit: "min" | "h"; value: number };

export function ageSince(iso: string, now: number = Date.now()): Age {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (min < 1) return { unit: "now" };
  if (min < 60) return { unit: "min", value: min };
  return { unit: "h", value: Math.round(min / 60) };
}

/**
 * Human "3 min ago" style label, in English.
 *
 * Kept for callers outside a React render — sorting, aria strings, logs. Anything a person
 * reads on screen should use `formatAge` from lib/i18n, which says the same thing in the
 * locale they chose.
 */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const age = ageSince(iso, now);
  if (age.unit === "now") return "just now";
  return age.unit === "min" ? `${age.value} min ago` : `${age.value} h ago`;
}
