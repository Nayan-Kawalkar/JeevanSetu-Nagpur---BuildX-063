/**
 * Wording helpers for the case screen.
 *
 * Every function that needs the current time takes it as an argument. The clock is never read
 * here: callers pass the value `useNow()` gives them, which is null on the server and for the
 * first paint, so a screen has to say something honest ("since 23:14") instead of a duration
 * measured against a clock it does not have yet.
 */
import type { EmergencyCase } from "@/lib/types";

/** "4 min 32 s" / "1 h 12 min" — how long this patient has been waiting, at a glance. */
export function elapsedLabel(fromIso: string, now: number): string {
  const ms = Math.max(0, now - Date.parse(fromIso));
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, "0")} min`;
  if (minutes > 0) return `${minutes} min ${String(seconds).padStart(2, "0")} s`;
  return `${seconds} s`;
}

/** "2:41" left on a deadline, or null once it has passed. */
export function countdownLabel(untilIso: string, now: number): string | null {
  const ms = Date.parse(untilIso) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Age and sex as recorded on scene — never invented, and openly blank when nobody asked. */
export function patientLine(emergencyCase: EmergencyCase): string {
  const sex =
    emergencyCase.sex === "M"
      ? "male"
      : emergencyCase.sex === "F"
        ? "female"
        : emergencyCase.sex === "OTHER"
          ? "other"
          : undefined;
  if (emergencyCase.age === undefined && sex === undefined) return "Age and sex not recorded";
  if (emergencyCase.age === undefined) return `Age not recorded · ${sex}`;
  if (sex === undefined) return `${emergencyCase.age} years · sex not recorded`;
  return `${emergencyCase.age} years · ${sex}`;
}

/** Where a requirement list came from, said plainly so nobody mistakes a guess for a finding. */
export const REQUIREMENT_SOURCE_LABEL: Record<NonNullable<EmergencyCase["requirementSource"]>, string> = {
  KEYWORD: "Read from the note by the keyword reader",
  AI: "Read from the note by the AI assistant",
  MANUAL: "Set by the crew",
};

/** ICU beds free, as the three-step capacity band the map draws. */
export function capacityBand(icuAvailable: number): "GOOD" | "TIGHT" | "FULL" {
  if (icuAvailable <= 0) return "FULL";
  if (icuAvailable <= 2) return "TIGHT";
  return "GOOD";
}
