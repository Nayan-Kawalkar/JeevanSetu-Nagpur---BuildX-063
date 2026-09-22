/**
 * Small formatting helpers shared by the control-room panels.
 *
 * Every one of them is pure and takes numbers the API already computed, so no panel ever
 * reads the clock during render.
 */

/** The overview service reports this age when a timestamp could not be parsed at all. */
const UNKNOWN_AGE_MINUTES = 99_999;

/** "14 min ago" / "2 h ago" — for a number a person typed in, never for a live reading. */
export function ageLabel(minutes: number): string {
  if (minutes >= UNKNOWN_AGE_MINUTES) return "age unknown";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** "48 min" / "2 h 5 min" — how long a case has been open. */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** The paramedic screens own the case detail page; this board only links to it. */
export function casePath(caseId: string): string {
  return `/paramedic/cases/${encodeURIComponent(caseId)}`;
}

export function plural(count: number, word: string): string {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}
