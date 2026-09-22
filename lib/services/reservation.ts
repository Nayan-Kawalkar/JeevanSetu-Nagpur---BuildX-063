/**
 * Reservation service — the code behind "the bed will still be there when we arrive".
 *
 * A coordinator who taps Accept is making a promise to an ambulance that is already moving.
 * This module turns that promise into held stock. Every write here is all-or-nothing: a
 * partial hold is worse than a refusal, because the crew would drive to a hospital that can
 * take half the patient and discover the rest on arrival. So the plan is built and checked
 * in full before a single counter moves.
 *
 * Holds expire after RESERVATION_MINUTES so an accepted case that never arrives cannot keep
 * an ICU bed out of circulation for the rest of the night.
 *
 * Coordination only. Nothing here diagnoses, prescribes, or invents clinical data; every
 * outcome carries a sentence a human coordinator can read and argue with.
 */
import { haversineKm } from "@/lib/geo";
import { addEvent, db, getCase, getHospital, listCases, nextId, nowIso, touchCase } from "@/lib/store";
import {
  BLOOD_GROUP_LABEL,
  COUNTABLE_RESOURCES,
  RESOURCE_LABEL,
  type BloodGroup,
  type CountableResource,
  type EmergencyCase,
  type Hospital,
  type Reservation,
  type ResourceType,
} from "@/lib/types";

/** How long a hold survives without a handover. Long enough for a cross-city run, short enough that a no-show frees the bed. */
export const RESERVATION_MINUTES = 45;

/** Blood must be close enough to reach the operating room in time; beyond this the hold is a fiction. */
export const BLOOD_SOURCE_RADIUS_KM = 6;

export type ReserveOutcome =
  | { ok: true; reservations: Reservation[] }
  | { ok: false; error: string; shortfall: string[] };

// ---------- Internal plan shape (nothing below is written until the whole plan passes) ----------

interface BloodPlan {
  bankId: string;
  bankName: string;
  group: BloodGroup;
  units: number;
  distanceKm: number;
}

interface Plan {
  countable: CountableResource[];
  blood?: BloodPlan;
  /** Honest caveats shown to the coordinator, e.g. a requirement this hospital does not stock at all. */
  notes: string[];
  shortfall: string[];
}

// ---------- Small pure helpers ----------

/** True for the resources a hospital counts as total/available, so a Reservation can be mapped back to a counter. */
function isCountable(resource: ResourceType | "BLOOD_UNITS"): resource is CountableResource {
  return (COUNTABLE_RESOURCES as readonly string[]).includes(resource);
}

/**
 * Lowercases a resource label for mid-sentence use without mangling acronyms,
 * so messages read "no ICU bed free" and "no emergency bed free".
 */
function phraseLabel(resource: ResourceType): string {
  const label = RESOURCE_LABEL[resource];
  const isAcronym = label.length > 1 && label[0] === label[0].toUpperCase() && label[1] === label[1].toUpperCase();
  return isAcronym ? label : label[0].toLowerCase() + label.slice(1);
}

/** Joins fragments the way a person speaks them: "a", "a and b", "a, b and c". */
function joinPhrases(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** One reservation as a coordinator would say it aloud, for event messages. */
function describeReservation(r: Reservation): string {
  if (r.resourceType === "BLOOD_UNITS") {
    const label = r.bloodGroup ? BLOOD_GROUP_LABEL[r.bloodGroup] : "matched";
    return `${r.quantity} ${label} unit${r.quantity === 1 ? "" : "s"}`;
  }
  return `${r.quantity} ${phraseLabel(r.resourceType)}`;
}

/**
 * A hospital "tracks" a countable resource when it claims the capability or actually holds
 * units of it. Reserving something a hospital has never had would push a counter negative
 * and invent capacity, so those requirements are reported as not held instead.
 */
function tracksCountable(hospital: Hospital, resource: CountableResource): boolean {
  return hospital.capabilities.includes(resource) || hospital.resources[resource].total > 0;
}

/** nowIso() for live calls; an injected epoch keeps the sweep and its expiry maths testable. */
function isoAt(ms: number | undefined): string {
  return ms === undefined ? nowIso() : new Date(ms).toISOString();
}

/**
 * Builds the complete list of units this case needs at this hospital and checks every line
 * against current stock. Pure: it reads the store but writes nothing, which is what makes
 * the all-or-nothing guarantee possible.
 */
function buildPlan(emergencyCase: EmergencyCase, hospital: Hospital): Plan {
  const plan: Plan = { countable: [], notes: [], shortfall: [] };

  for (const resource of COUNTABLE_RESOURCES) {
    if (!emergencyCase.requirements.includes(resource)) continue;
    if (!tracksCountable(hospital, resource)) {
      plan.notes.push(`${RESOURCE_LABEL[resource]} (${hospital.name} does not have one)`);
      continue;
    }
    plan.countable.push(resource);
    if (hospital.resources[resource].available < 1) {
      plan.shortfall.push(`no ${phraseLabel(resource)} free`);
    }
  }

  if (emergencyCase.requirements.includes("BLOOD_BANK")) {
    if (!emergencyCase.bloodGroup) {
      plan.notes.push("blood (the patient's group is still unknown)");
    } else {
      const units = emergencyCase.bloodUnitsNeeded ?? 1;
      if (units < 1) {
        plan.notes.push("blood (no units requested)");
      } else {
        const group = emergencyCase.bloodGroup;
        const label = BLOOD_GROUP_LABEL[group];
        const nearby = Object.values(db().bloodBanks)
          .map((bank) => ({ bank, km: haversineKm(hospital, bank) }))
          .filter((entry) => entry.km <= BLOOD_SOURCE_RADIUS_KM)
          .sort((a, b) => a.km - b.km);

        // One bank only: a split hold means two couriers and two chances to lose the units.
        const source = nearby.find((entry) => entry.bank.inventory[group].available >= units);
        if (source) {
          plan.blood = {
            bankId: source.bank.id,
            bankName: source.bank.name,
            group,
            units,
            distanceKm: Math.round(source.km * 10) / 10,
          };
        } else if (nearby.length === 0) {
          plan.shortfall.push(`no blood bank within ${BLOOD_SOURCE_RADIUS_KM} km of ${hospital.name}`);
        } else {
          const best = nearby.reduce((max, entry) => Math.max(max, entry.bank.inventory[group].available), 0);
          plan.shortfall.push(
            best === 0
              ? `no ${label} units available within ${BLOOD_SOURCE_RADIUS_KM} km`
              : `only ${best} of ${units} ${label} units available within ${BLOOD_SOURCE_RADIUS_KM} km`,
          );
        }
      }
    }
  }

  return plan;
}

/**
 * Puts units back where they came from. Used by both release and expiry, because a hold
 * that ends for any reason other than handover must return the capacity it was hiding.
 * Clamped at both ends: availability never exceeds total and blood never goes negative.
 */
function returnUnits(reservation: Reservation): void {
  if (reservation.hospitalId && isCountable(reservation.resourceType)) {
    const hospital = db().hospitals[reservation.hospitalId];
    if (!hospital) return;
    const slot = hospital.resources[reservation.resourceType];
    slot.available = Math.min(slot.total, Math.max(0, slot.available + reservation.quantity));
    return;
  }
  if (reservation.bloodBankId && reservation.bloodGroup) {
    const bank = db().bloodBanks[reservation.bloodBankId];
    if (!bank) return;
    const stock = bank.inventory[reservation.bloodGroup];
    // Give back only what is still shown as reserved, so an operator's manual stock edit is never overwritten.
    const giveBack = Math.min(reservation.quantity, stock.reserved);
    stock.reserved = Math.max(0, stock.reserved - giveBack);
    stock.available = Math.max(0, stock.available + giveBack);
  }
}

/** The hospital an event about these reservations should be filed under, if any. */
function hospitalIdOf(reservations: Reservation[]): string | undefined {
  return reservations.find((r) => r.hospitalId)?.hospitalId;
}

// ---------- Public API ----------

/**
 * Every hold this case is currently sitting on. Read-only snapshot used by the UI and by
 * the idempotency check; throws the store's 404 when the case id is unknown.
 */
export function activeReservations(caseId: string): Reservation[] {
  return getCase(caseId).reservations.filter((r) => r.status === "ACTIVE");
}

/**
 * Holds everything this case needs at this hospital, or holds nothing and says why.
 *
 * All-or-nothing by design: the whole plan is checked before any counter moves, so a
 * coordinator never ends up with a bed but no blood. Idempotent, because Accept gets
 * double-tapped on a phone in a noisy control room and a double-booked ICU is a real bed
 * denied to a real patient.
 */
export function reserveForCase(caseId: string, hospitalId: string, now?: number): ReserveOutcome {
  const nowMs = now ?? Date.now();
  // Sweep first: a hold that lapsed a minute ago must not block this accept or be mistaken
  // for an existing booking below.
  expireReservations(nowMs);

  const emergencyCase = getCase(caseId);
  const hospital = getHospital(hospitalId);

  const active = emergencyCase.reservations.filter((r) => r.status === "ACTIVE");
  const here = active.filter((r) => r.hospitalId === hospitalId);
  const elsewhere = active.filter((r) => r.hospitalId !== undefined && r.hospitalId !== hospitalId);
  const bloodHeld = active.filter((r) => r.bloodBankId !== undefined);

  if (here.length > 0) {
    // Already booked here. Return what is held and touch nothing.
    return { ok: true, reservations: [...here, ...bloodHeld] };
  }

  if (elsewhere.length > 0) {
    const otherId = hospitalIdOf(elsewhere) ?? "another hospital";
    const other = db().hospitals[otherId]?.name ?? otherId;
    const shortfall = [`units already held at ${other}`];
    const error = `Cannot accept at ${hospital.name}: this case already holds ${joinPhrases(
      elsewhere.map(describeReservation),
    )} at ${other}. Release that hold first.`;
    addEvent({
      caseId,
      hospitalId,
      type: "RESERVATION_FAILED",
      actorRole: "SYSTEM",
      message: error,
    });
    return { ok: false, error, shortfall };
  }

  const plan = buildPlan(emergencyCase, hospital);

  if (bloodHeld.length > 0 && plan.countable.length === 0) {
    // Blood-only case that is already covered: re-running would reserve a second batch.
    return { ok: true, reservations: bloodHeld };
  }

  if (plan.shortfall.length > 0) {
    const error = `Cannot accept at ${hospital.name}: ${joinPhrases(plan.shortfall)}.`;
    addEvent({
      caseId,
      hospitalId,
      type: "RESERVATION_FAILED",
      actorRole: "SYSTEM",
      message: error,
    });
    return { ok: false, error, shortfall: plan.shortfall };
  }

  // ---- The plan passed. Only now do we write. ----
  const createdAt = isoAt(now);
  const expiresAt = new Date(nowMs + RESERVATION_MINUTES * 60_000).toISOString();
  const written: Reservation[] = [];

  for (const resource of plan.countable) {
    const slot = hospital.resources[resource];
    slot.available = Math.min(slot.total, Math.max(0, slot.available - 1));
    written.push({
      id: nextId("reservation"),
      caseId,
      hospitalId,
      resourceType: resource,
      quantity: 1,
      status: "ACTIVE",
      createdAt,
      expiresAt,
    });
  }

  if (plan.blood) {
    const bank = db().bloodBanks[plan.blood.bankId];
    if (bank) {
      const stock = bank.inventory[plan.blood.group];
      stock.available = Math.max(0, stock.available - plan.blood.units);
      stock.reserved = Math.max(0, stock.reserved + plan.blood.units);
      written.push({
        id: nextId("reservation"),
        caseId,
        bloodBankId: plan.blood.bankId,
        resourceType: "BLOOD_UNITS",
        bloodGroup: plan.blood.group,
        quantity: plan.blood.units,
        status: "ACTIVE",
        createdAt,
        expiresAt,
      });
    }
  }

  emergencyCase.reservations.push(...written);
  touchCase(emergencyCase);

  const held = written.map(describeReservation);
  const bloodSuffix = plan.blood ? ` (blood from ${plan.blood.bankName}, ${plan.blood.distanceKm} km away)` : "";
  const caveat = plan.notes.length > 0 ? ` Not held: ${joinPhrases(plan.notes)}.` : "";
  const message =
    held.length > 0
      ? `Reserved ${joinPhrases(held)} at ${hospital.name}${bloodSuffix}, held for ${RESERVATION_MINUTES} minutes.${caveat}`
      : `Nothing to reserve at ${hospital.name} — this case needs no countable resource here.${caveat}`;

  addEvent({ caseId, hospitalId, type: "RESOURCES_RESERVED", actorRole: "SYSTEM", message });

  return { ok: true, reservations: written };
}

/**
 * Ends every hold this case is carrying and gives the units back, for a rejection, a
 * re-route or a cancellation. Returns how many were released. Releasing twice is a no-op,
 * so a retried request can never hand the same bed back to the ward twice.
 */
export function releaseReservations(caseId: string, reason: string): number {
  const emergencyCase = getCase(caseId);
  const active = emergencyCase.reservations.filter((r) => r.status === "ACTIVE");
  if (active.length === 0) return 0;

  for (const reservation of active) {
    reservation.status = "RELEASED";
    returnUnits(reservation);
  }
  touchCase(emergencyCase);

  addEvent({
    caseId,
    hospitalId: hospitalIdOf(active),
    type: "RESERVATION_RELEASED",
    actorRole: "SYSTEM",
    message: `Released ${joinPhrases(active.map(describeReservation))} back to stock — ${reason}`,
  });

  return active.length;
}

/**
 * Marks the holds as used at handover. Units are deliberately NOT returned: the patient is
 * now occupying the bed and the blood is on the trolley, so the ward's availability figure
 * is already correct and giving it back would advertise capacity that does not exist.
 */
export function consumeReservations(caseId: string): number {
  const emergencyCase = getCase(caseId);
  const active = emergencyCase.reservations.filter((r) => r.status === "ACTIVE");
  if (active.length === 0) return 0;

  for (const reservation of active) reservation.status = "CONSUMED";
  touchCase(emergencyCase);

  return active.length;
}

/**
 * Returns the units of every hold that has run past its expiry. Synchronous and cheap, so
 * read paths can call it and dashboards never show a bed as held by a case that quietly
 * died hours ago. Returns how many reservations expired.
 */
export function expireReservations(now: number = Date.now()): number {
  let expired = 0;

  for (const emergencyCase of listCases()) {
    const due = emergencyCase.reservations.filter(
      (r) => r.status === "ACTIVE" && new Date(r.expiresAt).getTime() < now,
    );
    if (due.length === 0) continue;

    for (const reservation of due) {
      reservation.status = "EXPIRED";
      returnUnits(reservation);
    }
    expired += due.length;
    touchCase(emergencyCase);

    addEvent({
      caseId: emergencyCase.id,
      hospitalId: hospitalIdOf(due),
      type: "RESERVATION_RELEASED",
      actorRole: "SYSTEM",
      message: `Hold expired after ${RESERVATION_MINUTES} minutes without a handover; ${joinPhrases(
        due.map(describeReservation),
      )} returned to stock.`,
    });
  }

  return expired;
}
