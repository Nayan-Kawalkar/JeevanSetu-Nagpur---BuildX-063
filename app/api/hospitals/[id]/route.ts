/**
 * One hospital — the single endpoint behind the whole hospital coordinator dashboard.
 *
 * GET answers the three questions that desk asks at once: what do we have, who is asking for
 * it, and who is already on the way. Serving them from one request means the screen can never
 * show a request next to a bed count that was read seconds apart, which is exactly the kind of
 * mismatch that makes a coordinator accept a patient into a bed that is already taken.
 *
 * PATCH is the other half of the bargain. Freshness is rewarded by the matching score, so the
 * act of a human confirming a number is itself valuable data: it is recorded as MANUAL with
 * HIGH confidence and stamped with the time, and it writes one event a human can read.
 *
 * Coordination only. Nothing here diagnoses, prescribes, or invents a measurement; every
 * number returned is one a person typed, carrying the age of when they typed it.
 */
import { handle, json, parseBody } from "@/lib/api";
import { auditGuardedMutation, effectiveActorRole, requireHospital } from "@/lib/auth";
import { STALE_AFTER_MINUTES } from "@/lib/services/overview";
import { expireReservations } from "@/lib/services/reservation";
import {
  addEvent,
  expirePendingRequests,
  getHospital,
  isActive,
  listCases,
  listRequests,
  nowIso,
} from "@/lib/store";
import {
  COUNTABLE_RESOURCES,
  RESOURCE_LABEL,
  RESOURCE_TYPES,
  SPECIALIST_TYPES,
  type CountableResource,
  type EmergencyCase,
  type Hospital,
  type ResourceType,
  type SpecialistStatus,
} from "@/lib/types";
import { UpdateHospitalSchema } from "@/lib/validation";

/** A hospital as last reported, carrying the freshness facts needed to judge it. */
export interface HospitalWithFreshness extends Hospital {
  /** Whole minutes since a human last confirmed these numbers. */
  dataAgeMinutes: number;
  /** True once the report is older than STALE_AFTER_MINUTES: show it, but never as fact. */
  stale: boolean;
}

/** Stand-in age for an unparsable timestamp: treated as maximally old, never as fresh. */
const UNKNOWN_AGE_MINUTES = 99_999;

/**
 * Short names for the event sentence, so the timeline reads "ICU 2 of 8 free" rather than
 * "ICU bed 2 of 8 free". RESOURCE_LABEL is written for chips and lists; this is written for
 * a sentence a coordinator reads back to a colleague on the phone.
 */
const COUNT_LABEL: Record<CountableResource, string> = {
  ICU: "ICU",
  EMERGENCY_BED: "Emergency beds",
  VENTILATOR: "Ventilators",
  CT_SCAN: "CT scanners",
  OPERATING_ROOM: "Operating rooms",
};

/**
 * Whole minutes since an ISO timestamp. A timestamp that cannot be parsed is reported as
 * maximally old rather than as "just now", because the failure mode of a wrong clock must be
 * "call and check", not "trust it".
 */
function ageInMinutes(iso: string, now: number): number {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return UNKNOWN_AGE_MINUTES;
  return Math.max(0, Math.round((now - at) / 60_000));
}

/** Attaches dataAgeMinutes and stale to a hospital without mutating the stored record. */
function withFreshness(hospital: Hospital, now: number): HospitalWithFreshness {
  const dataAgeMinutes = ageInMinutes(hospital.lastUpdatedAt, now);
  return { ...hospital, dataAgeMinutes, stale: dataAgeMinutes > STALE_AFTER_MINUTES };
}

/**
 * True for a case this hospital still has work to do on: one on its way, or one just handed
 * over. Closed and cancelled cases are dropped — the board is a list of people arriving, not
 * an archive, and the fewer patient records sit on a shared screen the better.
 */
function concernsHospital(emergencyCase: EmergencyCase, hospitalId: string): boolean {
  if (emergencyCase.hospitalId !== hospitalId) return false;
  return isActive(emergencyCase) || emergencyCase.status === "HANDOVER_COMPLETED";
}

/**
 * GET /api/hospitals/:id — the hospital, the requests waiting on an answer, and the cases
 * behind them, keyed by case id.
 *
 * Both sweeps run first so the desk is never asked to answer a request that has already timed
 * out, and never sees a bed as held by a hold that lapsed an hour ago.
 */
export function GET(_request: Request, context: RouteContext<"/api/hospitals/[id]">): Promise<Response> {
  return handle(async () => {
    const { id } = await context.params;
    const hospital = getHospital(id);

    const now = Date.now();
    expirePendingRequests(now);
    expireReservations(now);

    const pendingRequests = listRequests({ hospitalId: id, status: "PENDING" });

    // Every case the desk needs on screen: the ones asking to come, plus the ones already
    // routed here. Keyed by id so the UI can look a case up from a request without a search.
    const caseById = new Map(listCases().map((c) => [c.id, c]));
    const cases: Record<string, EmergencyCase> = {};
    for (const request of pendingRequests) {
      const referenced = caseById.get(request.caseId);
      if (referenced) cases[referenced.id] = referenced;
    }
    for (const emergencyCase of caseById.values()) {
      if (concernsHospital(emergencyCase, id)) cases[emergencyCase.id] = emergencyCase;
    }

    return json({ hospital: withFreshness(hospital, now), pendingRequests, cases });
  });
}

/**
 * PATCH /api/hospitals/:id — a coordinator confirming what this hospital actually has.
 *
 * Availability is clamped into 0..total: a ward cannot have more free beds than beds, and a
 * negative count would quietly corrupt the matching score for every later case. Any clamp is
 * reported back in `notes` rather than applied silently, because an operator whose typed
 * number was overruled needs to know it was.
 *
 * Guarded by requireHospital: a coordinator signed in at one hospital cannot edit another
 * hospital's beds, because those numbers decide where an ambulance is sent. Control room and admin
 * pass. With no role chosen at all the permissive demo session applies — see lib/auth.ts.
 *
 * The write is stamped MANUAL / HIGH confidence on purpose. Freshness carries weight in the
 * ranking, and a human who has just looked at the ward is the most reliable source this
 * system has — that is the behaviour the weighting exists to reward.
 *
 * It also accepts `readinessMinutes`, which is the only way anything in the system records that a
 * resource exists but is not yet usable. The matcher ranks on travel time plus that delay, so this
 * is the desk that makes "five minutes further but ready now" a real answer rather than a claim.
 */
export function PATCH(request: Request, context: RouteContext<"/api/hospitals/[id]">): Promise<Response> {
  return handle(async () => {
    const { id } = await context.params;
    const session = await requireHospital(id);
    const hospital = getHospital(id);
    const patch = await parseBody(request, UpdateHospitalSchema);

    const changes: string[] = [];
    const notes: string[] = [];

    for (const resource of COUNTABLE_RESOURCES) {
      const entry = patch.resources?.[resource];
      if (!entry) continue;

      const slot = hospital.resources[resource];
      const total = entry.total ?? slot.total;
      const requested = entry.available ?? slot.available;
      const available = Math.min(total, Math.max(0, requested));
      if (available !== requested) {
        notes.push(
          `${COUNT_LABEL[resource]}: ${requested} free was recorded as ${available}, because ${hospital.name} lists ${total} in total.`,
        );
      }

      slot.total = total;
      slot.available = available;
      changes.push(`${COUNT_LABEL[resource]} ${available} of ${total} free`);
    }

    for (const specialist of SPECIALIST_TYPES) {
      const entry = patch.specialists?.[specialist];
      if (!entry) continue;

      const current = hospital.specialists[specialist];
      const next: SpecialistStatus = { onCall: entry.onCall };
      // The roster name is display-only and this form cannot change it, so it is carried over.
      if (current.name) next.name = current.name;
      // An omitted note clears the old one: a leftover "back at 08:00" shown as current is
      // worse than no note at all.
      if (entry.note) next.note = entry.note;
      hospital.specialists[specialist] = next;

      const who = next.name ? ` (${next.name})` : "";
      const why = next.note ? ` — ${next.note}` : "";
      changes.push(
        entry.onCall
          ? `${RESOURCE_LABEL[specialist]} on call${who}`
          : `${RESOURCE_LABEL[specialist]} not on call${why}`,
      );
    }

    // Twist 4: readiness is merged, never replaced. A coordinator confirming that the CT is clear
    // must not silently erase the forty minutes someone else recorded against the neurosurgeon.
    // Zero is kept rather than deleted, because "I checked, it is ready now" is a real report and
    // the matcher reads a missing key and a reported zero as the same thing anyway.
    if (patch.readinessMinutes) {
      const readiness: Partial<Record<ResourceType, number>> = { ...hospital.readinessMinutes };
      for (const resource of RESOURCE_TYPES) {
        const minutes = patch.readinessMinutes[resource];
        if (minutes === undefined) continue;
        readiness[resource] = minutes;
        changes.push(
          minutes === 0
            ? `${RESOURCE_LABEL[resource]} ready now`
            : `${RESOURCE_LABEL[resource]} usable in about ${minutes} min`,
        );
      }
      hospital.readinessMinutes = readiness;
    }

    hospital.lastUpdatedAt = nowIso();
    hospital.updatedBy = patch.updatedBy;
    hospital.sourceType = "MANUAL";
    hospital.confidenceLevel = "HIGH";

    // A patch of empty objects is still a confirmation: the numbers were looked at and stand.
    const summary = changes.length > 0 ? changes.join(", ") : "no change to the numbers already recorded";
    addEvent({
      hospitalId: hospital.id,
      type: "RESOURCE_UPDATED",
      // The server's own view of who is acting, not a role the client claimed. With no role
      // chosen the timeline keeps saying "hospital", which is who is at this screen.
      actorRole: effectiveActorRole(session, "HOSPITAL_COORDINATOR"),
      message: `${hospital.name} confirmed by ${patch.updatedBy}: ${summary}.${
        notes.length > 0 ? ` ${notes.join(" ")}` : ""
      }`,
    });
    auditGuardedMutation(session, {
      type: "RESOURCE_UPDATED",
      hospitalId: hospital.id,
      action: `updated resources at ${hospital.name}`,
    });

    return json({ hospital: withFreshness(hospital, Date.now()), notes });
  });
}
