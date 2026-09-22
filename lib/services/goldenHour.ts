/**
 * Golden hour arithmetic — Twist 4.
 *
 * Trauma outcomes are dominated by the first sixty minutes after the injury, and the thing that
 * eats those minutes is almost never the driving: it is coordination. This module does two jobs.
 * It says how much of the hour is left, and it reconstructs where the hour actually went from the
 * event timeline we already keep.
 *
 * Two rules govern it. First, it is **pure**: no store, no network, and the only clock read is the
 * default for the `now` parameter, so a screen and an API route asked the same question at the same
 * instant always agree. Second, it **never invents a span**. If no event evidences a phase, that
 * phase is simply absent from the result and the UI is free to say the rest is unmeasured. A
 * fabricated "on scene: 6 min" bar would be a clinical-looking number with nothing behind it, and
 * this product does not do that.
 *
 * Nothing here diagnoses, prescribes or promises an outcome. A countdown is a coordination aid.
 */
import { GOLDEN_HOUR_MINUTES, type CarePhase, type EmergencyCase, type EmergencyEvent } from "@/lib/types";

/** Above this many minutes remaining the clock is comfortable. */
const SAFE_ABOVE_MINUTES = 30;
/** At or above this many minutes remaining it is tight; below it, critical. */
const TIGHT_ABOVE_MINUTES = 15;

const MS_PER_MINUTE = 60_000;

export type GoldenHourBand = "SAFE" | "TIGHT" | "CRITICAL" | "EXPIRED";

export interface GoldenHourStatus {
  /** ISO time the hour started: `incidentAt` when the crew recorded it, otherwise `createdAt`. */
  startedAt: string;
  /** ISO time sixty minutes after `startedAt`. */
  deadlineAt: string;
  /** Whole minutes since `startedAt`, never negative. */
  elapsedMinutes: number;
  /** Whole minutes left of the sixty, floored at zero once the deadline passes. */
  remainingMinutes: number;
  expired: boolean;
  band: GoldenHourBand;
  /** 0..100, for a progress bar. Capped at 100 once expired. */
  percentUsed: number;
}

export interface PhaseSpan {
  phase: CarePhase;
  startedAt: string;
  /** Absent while the phase is still running; `minutes` then counts up to `now`. */
  endedAt?: string;
  minutes: number;
}

export interface ProjectedArrival {
  /** ISO time the crew is expected to reach the receiving hospital. */
  arrivesAt: string;
  /**
   * Minutes of the golden hour still unspent on arrival. Deliberately **signed**: a negative
   * number is the honest answer and is more useful to a coordinator than a zero.
   */
  minutesLeftOnArrival: number;
  withinGoldenHour: boolean;
}

/** Epoch ms for an ISO string, or undefined when it cannot be parsed — never a silent zero. */
function parse(iso: string | undefined): number | undefined {
  if (iso === undefined) return undefined;
  const at = Date.parse(iso);
  return Number.isNaN(at) ? undefined : at;
}

function bandFor(remaining: number, expired: boolean): GoldenHourBand {
  if (expired) return "EXPIRED";
  if (remaining > SAFE_ABOVE_MINUTES) return "SAFE";
  if (remaining >= TIGHT_ABOVE_MINUTES) return "TIGHT";
  return "CRITICAL";
}

/**
 * Where a case stands against its sixty minutes.
 *
 * The hour starts at `incidentAt` — when the injury happened — falling back to `createdAt` when
 * nobody recorded it. That fallback is optimistic by exactly the time it took someone to call,
 * which is why the UI should say which of the two it is using.
 */
export function goldenHourStatus(c: EmergencyCase, now?: number): GoldenHourStatus {
  const at = now ?? Date.now();
  const start = parse(c.incidentAt) ?? parse(c.createdAt) ?? at;
  const deadline = start + GOLDEN_HOUR_MINUTES * MS_PER_MINUTE;

  const elapsedMinutes = Math.max(0, Math.round((at - start) / MS_PER_MINUTE));
  const expired = at >= deadline;
  const remainingMinutes = Math.max(0, GOLDEN_HOUR_MINUTES - elapsedMinutes);
  const percentUsed = Math.min(100, Math.max(0, Math.round((elapsedMinutes / GOLDEN_HOUR_MINUTES) * 100)));

  return {
    startedAt: new Date(start).toISOString(),
    deadlineAt: new Date(deadline).toISOString(),
    elapsedMinutes,
    remainingMinutes,
    expired,
    band: bandFor(remainingMinutes, expired),
    percentUsed,
  };
}

/** The phases we can evidence, each as the pair of events that opens and closes it. */
const PHASE_SHAPE: readonly { phase: CarePhase; from: EmergencyEvent["type"]; to: EmergencyEvent["type"] }[] = [
  // Finding somewhere to take the patient: from the case opening to a hospital saying yes.
  { phase: "DISPATCH", from: "CASE_CREATED", to: "HOSPITAL_ACCEPTED" },
  // Destination known, crew still at the roadside packaging the patient.
  { phase: "ON_SCENE", from: "HOSPITAL_ACCEPTED", to: "AMBULANCE_EN_ROUTE" },
  { phase: "TO_HOSPITAL", from: "AMBULANCE_EN_ROUTE", to: "ARRIVED" },
  { phase: "HANDOVER", from: "ARRIVED", to: "HANDOVER_COMPLETED" },
  // DETECTION and TO_SCENE are intentionally absent: we have no event that marks the call
  // landing or the crew reaching the roadside, and a span with no evidence would be a lie.
];

/** First occurrence of each event type for this case, in epoch ms. */
function firstTimes(caseId: string, events: EmergencyEvent[]): Map<EmergencyEvent["type"], number> {
  const times = new Map<EmergencyEvent["type"], number>();
  for (const e of events) {
    if (e.caseId !== caseId) continue;
    const at = parse(e.at);
    if (at === undefined) continue;
    const seen = times.get(e.type);
    if (seen === undefined || at < seen) times.set(e.type, at);
  }
  return times;
}

/**
 * Reconstructs where the hour went, as real spans derived from the event log.
 *
 * Only phases with both a start event and either an end event or an honest "still running" are
 * returned; everything else is omitted rather than estimated. A phase that has started and not
 * finished comes back with no `endedAt` and its minutes counted up to `now`, and only the latest
 * such phase can be open — an earlier unfinished phase is closed at the next event we do have.
 */
export function carePhases(c: EmergencyCase, events: EmergencyEvent[], now?: number): PhaseSpan[] {
  const at = now ?? Date.now();
  const times = firstTimes(c.id, events);

  const spans: PhaseSpan[] = [];
  for (let i = 0; i < PHASE_SHAPE.length; i += 1) {
    const shape = PHASE_SHAPE[i];
    const start = times.get(shape.from);
    if (start === undefined) continue;

    // Prefer this phase's own closing event; otherwise the start of any later phase we do have,
    // so an unclosed middle phase cannot swallow the rest of the timeline.
    let end = times.get(shape.to);
    if (end === undefined) {
      for (const later of PHASE_SHAPE.slice(i + 1)) {
        const candidate = times.get(later.from);
        if (candidate !== undefined && candidate >= start) {
          end = candidate;
          break;
        }
      }
    }

    if (end === undefined) {
      spans.push({
        phase: shape.phase,
        startedAt: new Date(start).toISOString(),
        minutes: Math.max(0, Math.round((at - start) / MS_PER_MINUTE)),
      });
      continue;
    }
    spans.push({
      phase: shape.phase,
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(end).toISOString(),
      minutes: Math.max(0, Math.round((end - start) / MS_PER_MINUTE)),
    });
  }
  return spans;
}

/**
 * What the clock will read when the crew gets there.
 *
 * `etaMinutes` should be the matcher's time to definitive care where one is available, not raw
 * travel time — arriving at a hospital whose theatre is still forty minutes away is not arrival.
 */
export function projectedArrival(c: EmergencyCase, etaMinutes: number, now?: number): ProjectedArrival {
  const at = now ?? Date.now();
  const status = goldenHourStatus(c, at);
  const travel = Math.max(0, Math.round(etaMinutes));
  const minutesLeftOnArrival = GOLDEN_HOUR_MINUTES - (status.elapsedMinutes + travel);
  return {
    arrivesAt: new Date(at + travel * MS_PER_MINUTE).toISOString(),
    minutesLeftOnArrival,
    withinGoldenHour: minutesLeftOnArrival >= 0,
  };
}
