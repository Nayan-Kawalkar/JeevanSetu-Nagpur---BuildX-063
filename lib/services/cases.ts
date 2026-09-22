/**
 * Case lifecycle — the thread that ties the engine services together.
 *
 * Extraction says what the patient needs, matching says who can provide it, reservation holds
 * it, and this module is the only place where those three are allowed to change a case. Keeping
 * the lifecycle here means the state machine exists once: a route handler cannot invent a
 * transition, and no screen can move a case forward without the side effects (ambulance status,
 * held beds, audit events) that the transition implies.
 *
 * Three rules shape everything below.
 *  1. A human can always overrule the machine, and the overrule is recorded. The paramedic on
 *     scene knows things the keyword rules never will.
 *  2. Resources are held before a promise is made. A hospital cannot accept a patient it cannot
 *     actually hold a bed for, so the reservation runs first and a failure leaves the request
 *     open rather than sending an ambulance towards a bed that is not there.
 *  3. Every state change writes one event a human can read. The timeline is the product.
 *
 * Coordination and decision support only: nothing here diagnoses, prescribes, invents a vital
 * sign, or presents a reported figure as live.
 */
import { ApiError } from "@/lib/api";
import { etaMinutes, nearest, type LatLng } from "@/lib/geo";
import { extractRequirements } from "@/lib/services/extraction";
import { explainRanked, rankHospitals } from "@/lib/services/matching";
import { consumeReservations, releaseReservations, reserveForCase } from "@/lib/services/reservation";
import {
  addEvent,
  db,
  expirePendingRequests,
  getAmbulance,
  getCase,
  getHospital,
  getRequest,
  isActive,
  listAmbulances,
  listBloodBanks,
  listHospitals,
  listRequests,
  nextId,
  nowIso,
  touchCase,
} from "@/lib/store";
import {
  ACTIVE_STATUSES,
  CASE_STATUSES,
  INCIDENT_LABEL,
  RESOURCE_LABEL,
  type ActorRole,
  type Ambulance,
  type AmbulanceStatus,
  type CaseStatus,
  type EmergencyCase,
  type EventType,
  type HospitalRequest,
  type MatchResult,
  type RankedHospital,
  type ResourceType,
} from "@/lib/types";
import type { CreateCaseInput, CreateRequestInput, RespondRequestInput, UpdateCaseInput } from "@/lib/validation";

// ---------- Tunables ----------

/**
 * How long a hospital has to answer before the request lapses. Short on purpose: an unanswered
 * request is a stalled ambulance, and the control room needs the case back in MATCHING quickly
 * enough to try the backup while the crew is still loading.
 */
/**
 * How long a hospital has to answer before the ask lapses and the case returns to matching.
 *
 * Ten minutes, not three. Three is closer to the real operational pressure, but it is shorter
 * than it takes to walk someone through the screen, so a request would silently expire mid
 * explanation and the system would look broken when it was behaving exactly as designed.
 * A lapse the operator never sees happen teaches them nothing.
 */
export const REQUEST_EXPIRY_MINUTES = 10;

/** The one action vocabulary the UI, the routes and the state machine all share. */
export type CaseAction = "START_JOURNEY" | "ARRIVED" | "COMPLETE_HANDOVER" | "CLOSE" | "CANCEL";

// ---------- State machine ----------

interface ActionRule {
  /** Statuses this action may be applied from; anything else is a 409. */
  readonly from: readonly CaseStatus[];
  readonly to: CaseStatus;
  readonly event: EventType;
  /** Where the crew ends up, when the action moves them. */
  readonly ambulance?: AmbulanceStatus;
}

/**
 * The whole forward lifecycle in one table, so the legal moves can be read at a glance and the
 * UI can grey out a button instead of discovering the rule by getting a 409.
 */
const ACTION_RULES: Record<CaseAction, ActionRule> = {
  START_JOURNEY: {
    from: ["ACCEPTED"],
    to: "AMBULANCE_EN_ROUTE",
    event: "AMBULANCE_EN_ROUTE",
    ambulance: "EN_ROUTE",
  },
  ARRIVED: { from: ["AMBULANCE_EN_ROUTE"], to: "ARRIVED", event: "ARRIVED", ambulance: "AT_HOSPITAL" },
  COMPLETE_HANDOVER: { from: ["ARRIVED"], to: "HANDOVER_COMPLETED", event: "HANDOVER_COMPLETED" },
  CLOSE: { from: ["HANDOVER_COMPLETED"], to: "CLOSED", event: "CASE_CLOSED", ambulance: "AVAILABLE" },
  // A case can be called off at any point it is still live — the crash turns out to be a false
  // alarm, or the family drives the patient themselves. Held beds go straight back to the ward.
  CANCEL: { from: ACTIVE_STATUSES, to: "CANCELLED", event: "CASE_CANCELLED", ambulance: "AVAILABLE" },
};

/** Every legal edge, including the ones other services own. Used to reject impossible edits. */
const ALLOWED_TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  CREATED: ["REQUIREMENTS_EXTRACTED", "MATCHING", "CANCELLED"],
  REQUIREMENTS_EXTRACTED: ["MATCHING", "CANCELLED"],
  MATCHING: ["HOSPITAL_REQUESTED", "CANCELLED"],
  HOSPITAL_REQUESTED: ["ACCEPTED", "MATCHING", "CANCELLED"],
  ACCEPTED: ["AMBULANCE_EN_ROUTE", "MATCHING", "CANCELLED"],
  AMBULANCE_EN_ROUTE: ["ARRIVED", "CANCELLED"],
  ARRIVED: ["HANDOVER_COMPLETED", "CANCELLED"],
  HANDOVER_COMPLETED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

/**
 * Statuses that are a consequence of another flow, never a field a human types. Letting an edit
 * set ACCEPTED by hand would mark a case as accepted with no bed held anywhere, which is exactly
 * the failure the reservation service exists to prevent.
 */
const SERVICE_OWNED_STATUS: Partial<Record<CaseStatus, string>> = {
  HOSPITAL_REQUESTED: "sending a hospital request",
  ACCEPTED: "a hospital answering the request",
};

/** Statuses at or past which a new hospital request makes no sense. */
const REQUEST_BLOCKED_STATUS: Partial<Record<CaseStatus, string>> = {
  ACCEPTED: "already accepted by a hospital",
  AMBULANCE_EN_ROUTE: "already en route",
  ARRIVED: "already at the hospital",
  HANDOVER_COMPLETED: "already handed over",
  CLOSED: "closed",
  CANCELLED: "cancelled",
};

// ---------- Small helpers ----------

/** Position in the lifecycle, used only to answer "has this case already moved past X?". */
const stageOf = (status: CaseStatus): number => CASE_STATUSES.indexOf(status);

/** Joins fragments the way a person says them: "a", "a and b", "a, b and c". */
function joinAnd(parts: readonly string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Lowercases a resource label for mid-sentence use without mangling acronyms, so an event reads
 * "no ICU bed" and "no emergency bed" rather than "no icu bed".
 */
function phraseLabel(resource: ResourceType): string {
  const label = RESOURCE_LABEL[resource];
  const isAcronym = label.length > 1 && label[0] === label[0].toUpperCase() && label[1] === label[1].toUpperCase();
  return isAcronym ? label : label[0].toLowerCase() + label.slice(1);
}

/** Requirement list as a reader would say it, for event messages. */
const labelList = (resources: readonly ResourceType[]): string =>
  resources.length === 0 ? "none recorded" : joinAnd(resources.map((r) => RESOURCE_LABEL[r]));

/** Hospital name for a message, falling back to the id so an event is never blank. */
const hospitalName = (id: string | undefined): string =>
  id === undefined ? "no hospital" : (db().hospitals[id]?.name ?? id);

/**
 * Patient label used when the crew gave none. Deliberately derived from the case number: a real
 * name on a shared control-room wall display is a privacy leak, and the crew can attach identity
 * later at the hospital where it belongs.
 */
function fallbackPatientId(caseId: string): string {
  const tail = caseId.split("-").pop() ?? "";
  const digits = (/^\d+$/.test(tail) ? tail : caseId.replace(/\D/g, "")) || "0000";
  return `TMP-${digits}`;
}

/**
 * Where travel time is measured from: the crew's own position once one is assigned, otherwise
 * the incident location. Mirrors the control room's ETA logic so a coordinator and a paramedic
 * never see two different numbers for the same journey.
 */
function originOf(emergencyCase: EmergencyCase): LatLng {
  const ambulance = emergencyCase.ambulanceId ? db().ambulances[emergencyCase.ambulanceId] : undefined;
  return ambulance ? { lat: ambulance.lat, lng: ambulance.lng } : { lat: emergencyCase.lat, lng: emergencyCase.lng };
}

/**
 * Ranks hospitals for a case without writing anything. Both `matchCase` and the safety check in
 * `requestHospital` go through here, so the request guard is always judged on the same fresh
 * figures as the recommendation rather than on a stored ranking that may be minutes old.
 */
function rankFor(emergencyCase: EmergencyCase, now?: number): MatchResult {
  return rankHospitals({
    origin: originOf(emergencyCase),
    requirements: emergencyCase.requirements,
    severity: emergencyCase.severity,
    bloodGroup: emergencyCase.bloodGroup,
    bloodUnitsNeeded: emergencyCase.bloodUnitsNeeded,
    hospitals: listHospitals(),
    bloodBanks: listBloodBanks(),
    now,
  });
}

/**
 * Moves the crew with the case and keeps the ambulance's own record in step. On arrival the
 * pin is snapped to the hospital, because a vehicle marked AT_HOSPITAL while drawn three km
 * away is a contradiction an operator has to resolve by radio.
 */
function moveAmbulance(emergencyCase: EmergencyCase, status: AmbulanceStatus): Ambulance | undefined {
  if (!emergencyCase.ambulanceId) return undefined;
  const ambulance = db().ambulances[emergencyCase.ambulanceId];
  if (!ambulance) return undefined;

  ambulance.status = status;
  if (status === "AVAILABLE") delete ambulance.caseId;
  else ambulance.caseId = emergencyCase.id;

  if (status === "AT_HOSPITAL" && emergencyCase.hospitalId) {
    const hospital = db().hospitals[emergencyCase.hospitalId];
    if (hospital) {
      ambulance.lat = hospital.lat;
      ambulance.lng = hospital.lng;
    }
  }
  return ambulance;
}

/** The crew's call sign for a message, or a plain phrase when no crew is attached yet. */
const crewLabel = (emergencyCase: EmergencyCase): string => {
  const id = emergencyCase.ambulanceId;
  const ambulance = id ? db().ambulances[id] : undefined;
  return ambulance ? ambulance.callSign : "No ambulance";
};

// ---------- Create ----------

/**
 * Opens a case: files the incident, works out what the patient will need, and puts the nearest
 * free crew on it in one step.
 *
 * Extraction runs unless the caller already reviewed the requirements, in which case the human
 * list is kept verbatim and marked MANUAL — the machine never overwrites a decision a paramedic
 * has already made. Extraction may raise the severity the crew chose but never lower it, and
 * whatever it could not determine is stored as `missingInformation` so the gaps stay visible
 * instead of being quietly filled in.
 *
 * The only asynchronous entry point in this module, because the optional AI layer is the only
 * thing in the lifecycle that can touch the network.
 */
export async function createCase(input: CreateCaseInput): Promise<EmergencyCase> {
  // Validate a hand-picked crew before anything is written, so a bad id cannot leave a
  // half-created case sitting in the store.
  const requestedAmbulance = input.ambulanceId ? getAmbulance(input.ambulanceId) : undefined;
  if (requestedAmbulance?.caseId) {
    throw new ApiError(
      409,
      `Ambulance ${requestedAmbulance.callSign} is already assigned to case ${requestedAmbulance.caseId}.`,
    );
  }

  // An explicitly supplied list is the crew's own decision. An empty array is treated as "not
  // filled in" rather than "this patient needs nothing", so a case can never reach matching
  // with nothing to rank hospitals against.
  const manualRequirements = input.requirements && input.requirements.length > 0 ? input.requirements : undefined;
  const extraction = manualRequirements
    ? undefined
    : await extractRequirements({
        notes: input.notes,
        incidentType: input.incidentType,
        severity: input.severity,
        bloodGroup: input.bloodGroup,
        age: input.age,
      });

  const requirements = manualRequirements ?? extraction?.requirements ?? [];
  const severity = extraction?.priority ?? input.severity;
  const escalated = severity !== input.severity;

  // Even on the manual path the one gap that stops a transfusion is worth surfacing.
  const missingInformation =
    extraction?.missingInformation ??
    (requirements.includes("BLOOD_BANK") && !input.bloodGroup ? ["blood group not confirmed"] : []);

  const id = nextId("case");
  const createdAt = nowIso();
  const emergencyCase: EmergencyCase = {
    id,
    tempPatientId: input.tempPatientId ?? fallbackPatientId(id),
    age: input.age,
    sex: input.sex,
    incidentType: input.incidentType,
    notes: input.notes,
    severity,
    bloodGroup: extraction?.bloodGroup ?? input.bloodGroup,
    bloodUnitsNeeded: input.bloodUnitsNeeded,
    lat: input.lat,
    lng: input.lng,
    locationLabel: input.locationLabel,
    requirements,
    requirementSource: manualRequirements ? "MANUAL" : (extraction?.source ?? "KEYWORD"),
    missingInformation,
    status: "REQUIREMENTS_EXTRACTED",
    reservations: [],
    createdAt,
    updatedAt: createdAt,
  };
  db().cases[id] = emergencyCase;

  // Nearest free crew to the scene. `nearest` is straight-line; over a city this picks the same
  // vehicle a dispatcher would, and the ETA below is the road estimate they will actually quote.
  const scene: LatLng = { lat: emergencyCase.lat, lng: emergencyCase.lng };
  const ambulance =
    requestedAmbulance ?? nearest(scene, listAmbulances().filter((a) => a.status === "AVAILABLE" && !a.caseId));
  if (ambulance) {
    ambulance.status = "ASSIGNED";
    ambulance.caseId = id;
    emergencyCase.ambulanceId = ambulance.id;
  }

  const crew = ambulance
    ? `${ambulance.callSign} assigned, about ${etaMinutes(ambulance, scene)} min from the scene`
    : "no ambulance free to assign yet";
  addEvent({
    caseId: id,
    type: "CASE_CREATED",
    actorRole: "PARAMEDIC",
    message: `Case opened at ${emergencyCase.locationLabel} — ${INCIDENT_LABEL[
      emergencyCase.incidentType
    ].toLowerCase()}, severity ${emergencyCase.severity}; ${crew}.`,
  });

  const gaps = missingInformation.length > 0 ? ` Still unconfirmed: ${joinAnd(missingInformation)}.` : "";
  const escalation = escalated ? ` Severity raised from ${input.severity} to ${severity} by the note wording.` : "";
  addEvent({
    caseId: id,
    type: "REQUIREMENTS_EXTRACTED",
    actorRole: manualRequirements ? "PARAMEDIC" : "SYSTEM",
    message: manualRequirements
      ? `Requirements entered by the crew: ${labelList(requirements)}.${gaps}`
      : `Requirements (${extraction?.source === "AI" ? "assisted" : "keyword"} reading, ${
          extraction?.confidence ?? "LOW"
        } confidence, confirm before use): ${labelList(requirements)}.${escalation}${gaps}`,
  });

  touchCase(emergencyCase);
  return emergencyCase;
}

// ---------- Edit ----------

/**
 * Applies a human's edit to a case, one field at a time, and records what changed.
 *
 * A paramedic overriding the extracted requirements is a feature, not an error path: they can
 * see the patient. But an override has to be visible afterwards, so any edit writes a single
 * REQUIREMENTS_EDITED event naming every field that moved, and touching the requirements flips
 * the source to MANUAL so no later screen claims the machine chose them.
 *
 * Status is not a free-text field. A move the lifecycle forbids is refused (409), a move another
 * flow owns is refused with the flow that owns it, and a move that has real side effects is
 * handed to `advanceStatus` so the ambulance and the held beds cannot be left behind.
 */
export function updateCase(id: string, patch: UpdateCaseInput): EmergencyCase {
  const emergencyCase = getCase(id);
  const changes: string[] = [];

  if (patch.requirements) {
    const before = new Set(emergencyCase.requirements);
    const after = new Set(patch.requirements);
    const added = patch.requirements.filter((r) => !before.has(r));
    const removed = emergencyCase.requirements.filter((r) => !after.has(r));
    emergencyCase.requirements = [...patch.requirements];
    emergencyCase.requirementSource = "MANUAL";
    if (added.length > 0) changes.push(`added ${joinAnd(added.map((r) => phraseLabel(r)))}`);
    if (removed.length > 0) changes.push(`removed ${joinAnd(removed.map((r) => phraseLabel(r)))}`);
    if (added.length === 0 && removed.length === 0) changes.push("confirmed the requirement list unchanged");
  }

  if (patch.bloodGroup !== undefined) {
    if (patch.bloodGroup === null) {
      // An explicit null is a retraction: the crew no longer stands behind the group they typed.
      if (emergencyCase.bloodGroup) changes.push("cleared the blood group");
      delete emergencyCase.bloodGroup;
    } else if (patch.bloodGroup !== emergencyCase.bloodGroup) {
      changes.push(`set the blood group to ${patch.bloodGroup}`);
      emergencyCase.bloodGroup = patch.bloodGroup;
    }
  }

  if (patch.bloodUnitsNeeded !== undefined && patch.bloodUnitsNeeded !== emergencyCase.bloodUnitsNeeded) {
    changes.push(`set blood units needed to ${patch.bloodUnitsNeeded}`);
    emergencyCase.bloodUnitsNeeded = patch.bloodUnitsNeeded;
  }

  if (patch.severity !== undefined && patch.severity !== emergencyCase.severity) {
    changes.push(`changed severity from ${emergencyCase.severity} to ${patch.severity}`);
    emergencyCase.severity = patch.severity;
  }

  const statusMove = patch.status !== undefined && patch.status !== emergencyCase.status ? patch.status : undefined;
  if (statusMove) {
    const owner = SERVICE_OWNED_STATUS[statusMove];
    if (owner) {
      throw new ApiError(409, `Status ${statusMove} is set by ${owner}, not by editing the case.`);
    }
    if (!ALLOWED_TRANSITIONS[emergencyCase.status].includes(statusMove)) {
      throw new ApiError(
        409,
        `Cannot move case ${id} from ${emergencyCase.status} to ${statusMove}. Allowed from here: ${
          ALLOWED_TRANSITIONS[emergencyCase.status].join(", ") || "nothing, this case is finished"
        }.`,
      );
    }
  }

  if (changes.length > 0) {
    addEvent({
      caseId: id,
      type: "REQUIREMENTS_EDITED",
      actorRole: patch.actorRole,
      message: `Case edited by ${patch.actorRole.toLowerCase().replace(/_/g, " ")}: ${joinAnd(changes)}.`,
    });
    touchCase(emergencyCase);
  }

  if (statusMove) {
    // Some moves carry consequences (a crew to redirect, beds to give back). Route those through
    // the state machine rather than repeating its side effects here.
    const action = (Object.keys(ACTION_RULES) as CaseAction[]).find(
      (a) => ACTION_RULES[a].to === statusMove && ACTION_RULES[a].from.includes(emergencyCase.status),
    );
    if (action) return advanceStatus(id, action, patch.actorRole);

    const from = emergencyCase.status;
    emergencyCase.status = statusMove;
    addEvent({
      caseId: id,
      type: "REQUIREMENTS_EDITED",
      actorRole: patch.actorRole,
      message: `Case moved from ${from} to ${statusMove} by ${patch.actorRole.toLowerCase().replace(/_/g, " ")}.`,
    });
    touchCase(emergencyCase);
  }

  return emergencyCase;
}

// ---------- Match ----------

/**
 * Ranks every hospital for this case and stores the result on the case.
 *
 * The ranking is kept on `lastMatch` rather than recomputed per screen so the control room, the
 * paramedic and the audit trail are all looking at one decision taken at one moment, with the
 * data ages it was taken on. The backup is stored too: when a hospital says no, the next option
 * must already be on the screen, not a re-run away.
 */
export function matchCase(id: string, now?: number): MatchResult {
  const emergencyCase = getCase(id);
  if (!isActive(emergencyCase)) {
    throw new ApiError(409, `Case ${id} is ${emergencyCase.status}; there is nothing left to match.`);
  }

  const result = rankFor(emergencyCase, now);
  emergencyCase.lastMatch = result;
  if (result.backupHospitalId) emergencyCase.backupHospitalId = result.backupHospitalId;
  else delete emergencyCase.backupHospitalId;

  // Matching can be re-run at any point (a bed was taken, requirements changed), but it must not
  // drag a case that is already accepted or en route back to the start of the workflow.
  if (stageOf(emergencyCase.status) < stageOf("MATCHING")) emergencyCase.status = "MATCHING";

  const primary = result.ranked.find((r) => r.hospitalId === result.primaryHospitalId);
  const backupSuffix = result.backupHospitalId ? ` Backup: ${hospitalName(result.backupHospitalId)}.` : "";
  const message = primary
    ? `${explainRanked(primary, hospitalName(primary.hospitalId))}${backupSuffix}`
    : `No hospital on the list can take this patient right now. Closest option: ${
        result.ranked[0] ? explainRanked(result.ranked[0], hospitalName(result.ranked[0].hospitalId)) : "none ranked."
      }`;

  addEvent({
    caseId: id,
    hospitalId: result.primaryHospitalId,
    type: "MATCHING_COMPLETED",
    actorRole: "SYSTEM",
    message,
  });

  touchCase(emergencyCase);
  return result;
}

/**
 * The same ranking as `matchCase`, recomputed on today's bed counts but writing nothing.
 *
 * A paramedic screen polls its ranking every few seconds. Running the recording version on every
 * one of those reads would stamp a MATCHING_COMPLETED event into the case timeline several times
 * a minute and keep bumping `updatedAt`, which buries the real decisions the timeline exists to
 * show and makes a case look freshly handled when nobody touched it. So a read recomputes and a
 * write records: the numbers a poll shows are still live, but only a deliberate match is history.
 * Both paths go through the same `rankFor`, so the two can never recommend different hospitals.
 */
export function previewMatch(id: string, now?: number): MatchResult {
  const emergencyCase = getCase(id);
  if (!isActive(emergencyCase)) {
    throw new ApiError(409, `Case ${id} is ${emergencyCase.status}; there is nothing left to match.`);
  }
  return rankFor(emergencyCase, now);
}

// ---------- Request a hospital ----------

/** Everything this hospital cannot give this patient, phrased for a human. */
function lackingPhrases(entry: RankedHospital): string[] {
  const blockers = entry.missing.includes("BLOOD_BANK")
    ? [...entry.missingCritical, "BLOOD_BANK" as ResourceType]
    : entry.missingCritical;
  return blockers.map((r) => (r === "BLOOD_BANK" ? "no matched blood within reach" : `no ${phraseLabel(r)}`));
}

/**
 * Sends one case to one hospital and starts the answer clock.
 *
 * Two guarantees matter here. A repeated `idempotencyKey` returns the request that already
 * exists — Accept gets double-tapped on a phone in a noisy control room, and two requests for
 * one patient means two coordinators holding two beds. And a hospital that cannot supply a
 * critical resource right now is refused outright (422): the nearest hospital is not the right
 * hospital, and the system must not let anyone send a critical patient somewhere that cannot
 * treat them, however tempting the distance looks.
 */
export function requestHospital(input: CreateRequestInput): HospitalRequest {
  // Sweep first so a request that lapsed seconds ago does not look like a live one and block this.
  expirePendingRequests();

  if (input.idempotencyKey) {
    const existing = listRequests().find((r) => r.idempotencyKey === input.idempotencyKey);
    if (existing) return existing;
  }

  const emergencyCase = getCase(input.caseId);
  const hospital = getHospital(input.hospitalId);

  const blocked = REQUEST_BLOCKED_STATUS[emergencyCase.status];
  if (blocked) {
    throw new ApiError(409, `Case ${emergencyCase.id} is ${blocked}; it cannot be offered to another hospital.`);
  }

  const pending = listRequests({ caseId: emergencyCase.id, status: "PENDING" })[0];
  if (pending) {
    throw new ApiError(
      409,
      `Case ${emergencyCase.id} is already waiting on ${hospitalName(pending.hospitalId)}. Wait for that answer or let it expire.`,
    );
  }

  const entry = rankFor(emergencyCase).ranked.find((r) => r.hospitalId === hospital.id);
  if (!entry) {
    throw new ApiError(422, `${hospital.name} could not be ranked for this case; re-run matching.`);
  }
  if (entry.suitability === "UNSUITABLE") {
    throw new ApiError(
      422,
      `${hospital.name} cannot take this patient: ${joinAnd(lackingPhrases(entry))}. Choose a hospital that can, or change the requirements first.`,
    );
  }

  const createdAt = nowIso();
  const request: HospitalRequest = {
    id: nextId("request"),
    caseId: emergencyCase.id,
    hospitalId: hospital.id,
    status: "PENDING",
    idempotencyKey: input.idempotencyKey,
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + REQUEST_EXPIRY_MINUTES * 60_000).toISOString(),
  };
  db().requests[request.id] = request;

  emergencyCase.status = "HOSPITAL_REQUESTED";
  touchCase(emergencyCase);

  addEvent({
    caseId: emergencyCase.id,
    hospitalId: hospital.id,
    type: "HOSPITAL_REQUESTED",
    actorRole: "PARAMEDIC",
    message: `Request sent to ${hospital.name}, ${REQUEST_EXPIRY_MINUTES} min to answer. ${entry.explanation}`,
  });

  return request;
}

// ---------- Answer a request ----------

/**
 * Records a hospital's answer, and on Accept turns that answer into held resources first.
 *
 * The order is the whole point. `reserveForCase` runs before the request is marked ACCEPTED, so
 * if the last ICU bed went to a walk-in thirty seconds ago the accept simply does not happen:
 * the request stays PENDING, the case is untouched, and the coordinator is handed the exact
 * shortfall to act on. A hospital must never be able to accept a patient it cannot actually hold
 * resources for, because by then an ambulance is already moving on the strength of that promise.
 *
 * A rejection is not a dead end: the case goes back to MATCHING and the event names the backup
 * the ranking already picked, so the next call can be made immediately.
 */
export function respondToRequest(
  requestId: string,
  input: RespondRequestInput,
): { request: HospitalRequest; case: EmergencyCase; reservationError?: string } {
  // Sweep first: answering a request that timed out must fail, not quietly succeed late.
  expirePendingRequests();

  const request = getRequest(requestId);
  if (request.status !== "PENDING") {
    throw new ApiError(
      409,
      `Request ${requestId} is already ${request.status.toLowerCase()} and cannot be answered again.`,
    );
  }

  const emergencyCase = getCase(request.caseId);
  const hospital = getHospital(request.hospitalId);

  if (input.action === "REJECT") {
    request.status = "REJECTED";
    request.reason = input.reason;
    request.respondedAt = nowIso();
    request.respondedBy = input.respondedBy;

    // The backup the ranking already chose, skipping the hospital that just said no.
    const suggested =
      emergencyCase.lastMatch?.ranked.find(
        (r) => r.hospitalId !== hospital.id && r.suitability !== "UNSUITABLE",
      )?.hospitalId ?? emergencyCase.backupHospitalId;

    if (isActive(emergencyCase)) {
      emergencyCase.status = "MATCHING";
      touchCase(emergencyCase);
    }

    addEvent({
      caseId: emergencyCase.id,
      hospitalId: hospital.id,
      type: "HOSPITAL_REJECTED",
      actorRole: "HOSPITAL_COORDINATOR",
      message: `${hospital.name} declined — ${input.reason?.trim() || "no reason given"}. ${
        suggested && suggested !== hospital.id
          ? `Next option: ${hospitalName(suggested)}.`
          : "No backup on file; re-run matching."
      }`,
    });

    return { request, case: emergencyCase };
  }

  // Hold the resources before the promise is recorded anywhere.
  const outcome = reserveForCase(emergencyCase.id, hospital.id);
  if (!outcome.ok) {
    // Nothing is written here: the request stays open so the same hospital can answer again once
    // a bed frees up, and the reservation service has already logged why it failed.
    return { request, case: emergencyCase, reservationError: outcome.error };
  }

  request.status = "ACCEPTED";
  request.respondedAt = nowIso();
  request.respondedBy = input.respondedBy;

  emergencyCase.hospitalId = hospital.id;
  emergencyCase.status = "ACCEPTED";
  moveAmbulance(emergencyCase, "ASSIGNED");
  touchCase(emergencyCase);

  const held =
    outcome.reservations.length > 0
      ? `${outcome.reservations.length} resource${outcome.reservations.length === 1 ? "" : "s"} held`
      : "no countable resource needed here";
  addEvent({
    caseId: emergencyCase.id,
    hospitalId: hospital.id,
    type: "HOSPITAL_ACCEPTED",
    actorRole: "HOSPITAL_COORDINATOR",
    message: `${hospital.name} accepted (${input.respondedBy}); ${held}. ${crewLabel(emergencyCase)} is the assigned crew.`,
  });

  return { request, case: emergencyCase };
}

// ---------- Advance ----------

/** The one-line event message for each action, so the timeline reads as a narrative. */
function actionMessage(action: CaseAction, emergencyCase: EmergencyCase, released: number): string {
  const crew = crewLabel(emergencyCase);
  const where = hospitalName(emergencyCase.hospitalId);
  switch (action) {
    case "START_JOURNEY":
      return `${crew} left for ${where}.`;
    case "ARRIVED":
      return `${crew} arrived at ${where}.`;
    case "COMPLETE_HANDOVER":
      return `Handover completed at ${where}; ${released} held resource${released === 1 ? "" : "s"} now in use.`;
    case "CLOSE":
      return `Case closed at ${where}. ${crew} back in service.`;
    case "CANCEL":
      return released > 0
        ? `Case cancelled; ${released} held resource${released === 1 ? "" : "s"} returned to stock and ${crew} back in service.`
        : `Case cancelled; nothing was being held. ${crew} back in service.`;
  }
}

/**
 * The only way a case moves through the journey, and the only place the side effects live.
 *
 * Each action is allowed from exactly the statuses in ACTION_RULES and refused with a 409
 * anywhere else, so a stale tab or a double tap cannot skip a step — a case cannot be handed
 * over before it arrives, and it cannot be closed before it is handed over. Handover consumes
 * the holds (the patient is in the bed now, so returning it would advertise capacity that does
 * not exist), while a cancellation releases them so the ward gets the bed back immediately.
 */
export function advanceStatus(id: string, action: CaseAction, actorRole: ActorRole): EmergencyCase {
  const emergencyCase = getCase(id);
  const rule = ACTION_RULES[action];

  if (!rule.from.includes(emergencyCase.status)) {
    throw new ApiError(
      409,
      `Cannot ${action.toLowerCase().replace(/_/g, " ")} case ${id}: it is ${emergencyCase.status}, and this step is only possible from ${joinAnd(rule.from)}.`,
    );
  }

  let released = 0;
  if (action === "COMPLETE_HANDOVER") released = consumeReservations(id);
  if (action === "CANCEL") released = releaseReservations(id, "the case was cancelled");

  emergencyCase.status = rule.to;
  if (rule.ambulance) moveAmbulance(emergencyCase, rule.ambulance);
  touchCase(emergencyCase);

  addEvent({
    caseId: id,
    hospitalId: emergencyCase.hospitalId,
    type: rule.event,
    actorRole,
    message: actionMessage(action, emergencyCase, released),
  });

  return emergencyCase;
}
