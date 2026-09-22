/**
 * Family access — the one door in this system that opens without a login.
 *
 * In the track scenario the family is the only party with no information at all: they are
 * ringing relatives and WhatsApp groups because nobody has told them which hospital the
 * ambulance is going to. A read-only, expiring link fixes that without creating an account,
 * a password, or a second place where patient data can be edited.
 *
 * Two rules shape this module.
 *
 *  1. The token is the whole credential, so it must be unguessable. It comes from
 *     crypto.randomUUID() — never Math.random, and never anything derived from the case id,
 *     because a token built from "JS-2026-0003" would let one family walk to another family's
 *     page by changing a digit.
 *  2. Unknown, expired and revoked tokens are indistinguishable from the outside. All three
 *     return null and the page renders the same calm sentence, so probing tokens teaches a
 *     guesser nothing — not even whether a case exists.
 *
 * FamilyView below is the privacy boundary. It is the only shape that crosses it, and it is
 * built by hand rather than by spreading a case, so a field added to EmergencyCase later
 * cannot leak onto a public page by accident.
 *
 * Coordination information only: nothing here is a diagnosis, a treatment, or a promise about
 * an outcome, and no wording on the family page may imply one.
 */
import { ApiError } from "@/lib/api";
import { etaMinutes } from "@/lib/geo";
import {
  addEvent,
  db,
  getCase,
  listBloodRequests,
  listEvents,
  listFamilyTokens,
  nowIso,
} from "@/lib/store";
import type {
  ActorRole,
  CaseSeverity,
  CaseStatus,
  EmergencyCase,
  EventType,
  FamilyAccessToken,
} from "@/lib/types";

/** How long a link stays usable. One long shift: enough for a whole run, not a standing key. */
export const FAMILY_TOKEN_HOURS = 12;

// ---------- The shape that crosses the boundary ----------

/**
 * The milestones a family is allowed to see, as event types so the page can translate them.
 * The event's own `message` is deliberately NOT carried across: those sentences name
 * coordinators, quote rejection reasons and count beds, all of which are staff business.
 */
export const FAMILY_MILESTONE_TYPES = [
  "CASE_CREATED",
  "HOSPITAL_ACCEPTED",
  "BLOOD_RESERVED",
  "BLOOD_FULFILLED",
  "AMBULANCE_EN_ROUTE",
  "ARRIVED",
  "HANDOVER_COMPLETED",
  "CASE_CANCELLED",
] as const;
export type FamilyMilestoneType = (typeof FAMILY_MILESTONE_TYPES)[number];

/** Neutral English wording for each milestone. States a fact; never reassures, never alarms. */
const MILESTONE_TEXT: Record<FamilyMilestoneType, string> = {
  CASE_CREATED: "The ambulance service opened this record.",
  HOSPITAL_ACCEPTED: "A hospital confirmed it can receive the patient.",
  BLOOD_RESERVED: "Blood of the needed group has been set aside.",
  BLOOD_FULFILLED: "The blood units have reached the hospital.",
  AMBULANCE_EN_ROUTE: "The ambulance is travelling to the hospital.",
  ARRIVED: "The ambulance reached the hospital.",
  HANDOVER_COMPLETED: "The hospital team has taken over care.",
  CASE_CANCELLED: "The ambulance service cancelled this record.",
};

/** Plain words for a status, written for a relative rather than for a control room. */
const STATUS_TEXT: Record<CaseStatus, string> = {
  CREATED: "Details are being recorded",
  REQUIREMENTS_EXTRACTED: "Details are being recorded",
  MATCHING: "A hospital is being chosen",
  HOSPITAL_REQUESTED: "Waiting for a hospital to confirm",
  ACCEPTED: "A hospital has confirmed",
  AMBULANCE_EN_ROUTE: "On the way to the hospital",
  ARRIVED: "At the hospital",
  HANDOVER_COMPLETED: "With the hospital team",
  CLOSED: "This record is closed",
  CANCELLED: "This record was cancelled",
};

const SEVERITY_TEXT: Record<CaseSeverity, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

/**
 * Whether blood has been arranged — and nothing more. Which bank, how many units and what is
 * left on anyone else's shelf are operational facts that belong to staff, not to this page.
 */
export type FamilyBloodState = "ARRANGED" | "BEING_ARRANGED" | "NOT_NEEDED";

export interface FamilyMilestone {
  type: FamilyMilestoneType;
  /** English wording; the page may translate from `type` instead. */
  text: string;
  at: string;
}

export interface FamilyHospitalContact {
  name: string;
  address: string;
  phone: string;
}

/**
 * Everything a family member may see, and nothing else.
 *
 * DELIBERATELY EXCLUDED — do not add these, and do not add a field that would carry them:
 *  - the clinical notes typed at the scene, and the patient's age, sex and blood group;
 *  - the extracted requirement list (which reads as a diagnosis to a frightened reader);
 *  - staff names: crew, coordinator, on-call specialist, blood-bank operator;
 *  - coordinator reasons, rejections, scores, rankings and every other hospital considered;
 *  - which blood bank, how many units, and any stock figure anywhere;
 *  - internal ids beyond the case reference — no hospital id, ambulance id, request id;
 *  - every other case, and anything at all about any other patient.
 */
export interface FamilyView {
  /** The case reference, so a relative can quote it on the phone. */
  caseReference: string;
  status: CaseStatus;
  statusText: string;
  severity: CaseSeverity;
  severityText: string;
  /** Null until a hospital has actually confirmed; a shortlist is not an answer. */
  hospital: FamilyHospitalContact | null;
  /** Minutes to the hospital while the run is live; null once it is over or not yet started. */
  etaMinutes: number | null;
  blood: FamilyBloodState;
  milestones: FamilyMilestone[];
  lastUpdatedAt: string;
  expiresAt: string;
}

// ---------- Tokens ----------

/**
 * 64 hex characters from two UUID v4s. Well past the 32-character floor, and the randomness
 * comes from the platform CSPRNG rather than Math.random, which is seeded and predictable.
 */
function newToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}

function isLive(link: FamilyAccessToken, now: number): boolean {
  return link.revokedAt === undefined && new Date(link.expiresAt).getTime() > now;
}

/** The links for a case that a relative could still open, newest first. */
export function activeFamilyLinks(caseId: string, now: number = Date.now()): FamilyAccessToken[] {
  return listFamilyTokens(caseId)
    .filter((link) => isLive(link, now))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Issues a link for one case.
 *
 * Re-issuing while a link is still live hands back the same one rather than minting a second:
 * a crew that taps the button twice should not leave a spare key in circulation that nobody
 * remembers to revoke.
 */
export function createFamilyLink(caseId: string, by: ActorRole): FamilyAccessToken {
  const emergencyCase = getCase(caseId);
  const existing = activeFamilyLinks(caseId)[0];
  if (existing) return existing;

  const createdAt = nowIso();
  const link: FamilyAccessToken = {
    token: newToken(),
    caseId: emergencyCase.id,
    createdAt,
    expiresAt: new Date(Date.now() + FAMILY_TOKEN_HOURS * 3600_000).toISOString(),
    viewCount: 0,
  };
  db().familyTokens[link.token] = link;

  // The token itself is never written into the audit message: the timeline is read on screens
  // that other people can see over a shoulder.
  addEvent({
    caseId: emergencyCase.id,
    type: "FAMILY_LINK_CREATED",
    actorRole: by,
    message: `A read-only family status link was created; it expires in ${FAMILY_TOKEN_HOURS} hours.`,
  });
  return link;
}

/** Turns a link off immediately. Revoking an already-revoked link is a no-op, not an error. */
export function revokeFamilyLink(token: string, by: ActorRole): FamilyAccessToken {
  const link = db().familyTokens[token];
  if (!link) throw new ApiError(404, "Family link not found");
  if (link.revokedAt !== undefined) return link;

  link.revokedAt = nowIso();
  addEvent({
    caseId: link.caseId,
    type: "FAMILY_LINK_REVOKED",
    actorRole: by,
    message: "The family status link was revoked; it no longer opens.",
  });
  return link;
}

// ---------- Reading ----------

function bloodState(emergencyCase: EmergencyCase): FamilyBloodState {
  const held = emergencyCase.reservations.some(
    (r) => r.resourceType === "BLOOD_UNITS" && (r.status === "ACTIVE" || r.status === "CONSUMED"),
  );
  const requests = listBloodRequests({ caseId: emergencyCase.id });
  const settled = requests.some((r) => r.status === "RESERVED" || r.status === "FULFILLED");
  if (held || settled) return "ARRANGED";

  const pending = requests.some((r) => r.status === "PENDING");
  const needed = (emergencyCase.bloodUnitsNeeded ?? 0) > 0 || emergencyCase.requirements.includes("BLOOD_BANK");
  return pending || needed ? "BEING_ARRANGED" : "NOT_NEEDED";
}

function isMilestone(type: EventType): type is FamilyMilestoneType {
  return (FAMILY_MILESTONE_TYPES as readonly EventType[]).includes(type);
}

function milestones(caseId: string): FamilyMilestone[] {
  return listEvents({ caseId, limit: 200 })
    .flatMap((event): FamilyMilestone[] =>
      isMilestone(event.type) ? [{ type: event.type, text: MILESTONE_TEXT[event.type], at: event.at }] : [],
    )
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** Statuses during which the patient is still travelling, so a remaining ETA means something. */
const TRAVELLING: readonly CaseStatus[] = ["ACCEPTED", "AMBULANCE_EN_ROUTE"];

function travelMinutes(emergencyCase: EmergencyCase): number | null {
  if (!TRAVELLING.includes(emergencyCase.status)) return null;
  const hospital = emergencyCase.hospitalId ? db().hospitals[emergencyCase.hospitalId] : undefined;
  if (!hospital) return null;
  // From the ambulance when one is assigned, otherwise from the incident location. Both are
  // estimates from a fixed average speed — the page says so, and never presents them as a promise.
  const ambulance = emergencyCase.ambulanceId ? db().ambulances[emergencyCase.ambulanceId] : undefined;
  const from = ambulance ?? { lat: emergencyCase.lat, lng: emergencyCase.lng };
  return etaMinutes({ lat: from.lat, lng: from.lng }, hospital);
}

/**
 * Resolves a token to the family view, or null.
 *
 * Null covers every failure — unknown token, expired token, revoked token, and a case that no
 * longer exists — on purpose. The caller answers all four the same way, so the page a guesser
 * lands on is identical to the page a relative with a stale link lands on.
 *
 * A successful read is a visit, so it bumps the counter the crew can see. That count is the
 * only thing the family side writes anywhere.
 */
export function readFamilyView(token: string, now: number = Date.now()): FamilyView | null {
  const link = db().familyTokens[token];
  if (!link || !isLive(link, now)) return null;

  const emergencyCase = db().cases[link.caseId];
  if (!emergencyCase) return null;

  link.viewCount += 1;
  link.lastViewedAt = nowIso();

  const hospital = emergencyCase.hospitalId ? db().hospitals[emergencyCase.hospitalId] : undefined;
  // A hospital is only named once it has actually accepted. Naming a shortlisted hospital would
  // send a family across Nagpur to a place that never agreed to receive the patient.
  const confirmed =
    hospital !== undefined &&
    emergencyCase.status !== "MATCHING" &&
    emergencyCase.status !== "HOSPITAL_REQUESTED";

  return {
    caseReference: emergencyCase.id,
    status: emergencyCase.status,
    statusText: STATUS_TEXT[emergencyCase.status],
    severity: emergencyCase.severity,
    severityText: SEVERITY_TEXT[emergencyCase.severity],
    hospital:
      confirmed && hospital
        ? { name: hospital.name, address: hospital.address, phone: hospital.phone }
        : null,
    etaMinutes: travelMinutes(emergencyCase),
    blood: bloodState(emergencyCase),
    milestones: milestones(emergencyCase.id),
    lastUpdatedAt: emergencyCase.updatedAt,
    expiresAt: link.expiresAt,
  };
}
