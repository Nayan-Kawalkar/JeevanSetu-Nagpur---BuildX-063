/**
 * Domain model for JeevanSetu 360 (hackathon build).
 * Names mirror the JeevanSetu plan so a later Prisma migration is a rename-free move.
 */

// ---------- Enums (kept as const arrays so Zod and UI can iterate them) ----------

export const USER_ROLES = [
  "PARAMEDIC",
  "HOSPITAL_COORDINATOR",
  "BLOOD_BANK_OPERATOR",
  "CONTROL_ROOM_OPERATOR",
  "FAMILY_MEMBER",
  "ADMIN",
  "SYSTEM",
] as const;
export type ActorRole = (typeof USER_ROLES)[number];

export const CASE_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type CaseSeverity = (typeof CASE_SEVERITIES)[number];

export const CASE_STATUSES = [
  "CREATED",
  "REQUIREMENTS_EXTRACTED",
  "MATCHING",
  "HOSPITAL_REQUESTED",
  "ACCEPTED",
  "AMBULANCE_EN_ROUTE",
  "ARRIVED",
  "HANDOVER_COMPLETED",
  "CLOSED",
  "CANCELLED",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/** Statuses that count as "active" on dashboards. */
export const ACTIVE_STATUSES: readonly CaseStatus[] = [
  "CREATED",
  "REQUIREMENTS_EXTRACTED",
  "MATCHING",
  "HOSPITAL_REQUESTED",
  "ACCEPTED",
  "AMBULANCE_EN_ROUTE",
  "ARRIVED",
];

export const REQUEST_STATUSES = ["PENDING", "ACCEPTED", "REJECTED", "EXPIRED"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const RESERVATION_STATUSES = ["ACTIVE", "RELEASED", "EXPIRED", "CONSUMED"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const CONFIDENCE_LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const INCIDENT_TYPES = ["ROAD_ACCIDENT", "CARDIAC", "BURN", "FALL", "ASSAULT", "OTHER"] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const INCIDENT_LABEL: Record<IncidentType, string> = {
  ROAD_ACCIDENT: "Road accident",
  CARDIAC: "Cardiac",
  BURN: "Burn",
  FALL: "Fall",
  ASSAULT: "Assault",
  OTHER: "Other",
};

export const BLOOD_GROUPS = ["A_POS", "A_NEG", "B_POS", "B_NEG", "AB_POS", "AB_NEG", "O_POS", "O_NEG"] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const BLOOD_GROUP_LABEL: Record<BloodGroup, string> = {
  A_POS: "A+",
  A_NEG: "A-",
  B_POS: "B+",
  B_NEG: "B-",
  AB_POS: "AB+",
  AB_NEG: "AB-",
  O_POS: "O+",
  O_NEG: "O-",
};

/** Controlled list of coordination requirements a case can need. */
export const RESOURCE_TYPES = [
  "ICU",
  "EMERGENCY_BED",
  "NEUROSURGEON",
  "ORTHOPEDIC_SURGEON",
  "TRAUMA_TEAM",
  "CT_SCAN",
  "VENTILATOR",
  "BLOOD_BANK",
  "OPERATING_ROOM",
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

/** Countable things a hospital tracks as total/available. */
export const COUNTABLE_RESOURCES = ["ICU", "EMERGENCY_BED", "VENTILATOR", "CT_SCAN", "OPERATING_ROOM"] as const;
export type CountableResource = (typeof COUNTABLE_RESOURCES)[number];

/** People/teams a hospital tracks as on-call yes/no. */
export const SPECIALIST_TYPES = ["NEUROSURGEON", "ORTHOPEDIC_SURGEON", "TRAUMA_TEAM"] as const;
export type SpecialistType = (typeof SPECIALIST_TYPES)[number];

/** Requirements whose absence makes a hospital UNSUITABLE (not merely lower-scored). */
export const CRITICAL_RESOURCES: readonly ResourceType[] = ["ICU", "NEUROSURGEON", "VENTILATOR", "OPERATING_ROOM"];

export const RESOURCE_LABEL: Record<ResourceType, string> = {
  ICU: "ICU bed",
  EMERGENCY_BED: "Emergency bed",
  NEUROSURGEON: "Neurosurgeon",
  ORTHOPEDIC_SURGEON: "Orthopaedic surgeon",
  TRAUMA_TEAM: "Trauma team",
  CT_SCAN: "CT scan",
  VENTILATOR: "Ventilator",
  BLOOD_BANK: "Blood (matched group)",
  OPERATING_ROOM: "Operating room",
};

export const EVENT_TYPES = [
  "CASE_CREATED",
  "REQUIREMENTS_EXTRACTED",
  "REQUIREMENTS_EDITED",
  "MATCHING_COMPLETED",
  "HOSPITAL_REQUESTED",
  "HOSPITAL_ACCEPTED",
  "HOSPITAL_REJECTED",
  "REQUEST_EXPIRED",
  "RESOURCES_RESERVED",
  "RESERVATION_FAILED",
  "RESERVATION_RELEASED",
  "AMBULANCE_EN_ROUTE",
  "ARRIVED",
  "HANDOVER_COMPLETED",
  "CASE_CLOSED",
  "CASE_CANCELLED",
  "RESOURCE_UPDATED",
  "BLOOD_STOCK_UPDATED",
  "BLOOD_REQUESTED",
  "BLOOD_RESERVED",
  "BLOOD_REQUEST_REJECTED",
  "BLOOD_FULFILLED",
  "BLOOD_RELEASED",
  "FAMILY_LINK_CREATED",
  "FAMILY_LINK_REVOKED",
  "DEMO_RESET",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// ---------- Entities ----------

export interface Availability {
  total: number;
  available: number;
}

export interface SpecialistStatus {
  onCall: boolean;
  /** Fictional name for display only. */
  name?: string;
  /** When not on call: free-text note such as "Available 08:00 tomorrow". */
  note?: string;
}

export interface Hospital {
  id: string;
  name: string;
  type: "GOVERNMENT" | "PRIVATE";
  /** Twist 3: which rung of the escalation ladder this facility sits on. */
  tier?: FacilityTier;
  /** Twist 3: a camp stood up during an incident, rather than a standing facility. */
  temporary?: boolean;
  /**
   * Twist 4: minutes until the things this hospital offers are actually usable —
   * the specialist is paged but travelling, the CT has a queue, the theatre is mid-case.
   * Ranking on travel time alone ignores this and picks hospitals that are not ready.
   */
  readinessMinutes?: Partial<Record<ResourceType, number>>;
  area: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
  /** What the hospital can provide at all (department/equipment exists). */
  capabilities: ResourceType[];
  resources: Record<CountableResource, Availability>;
  specialists: Record<SpecialistType, SpecialistStatus>;
  lastUpdatedAt: string;
  updatedBy: string;
  sourceType: "MANUAL" | "SEED" | "SYSTEM";
  confidenceLevel: ConfidenceLevel;
}

export interface BloodStock {
  available: number;
  reserved: number;
}

export interface BloodBank {
  id: string;
  name: string;
  area: string;
  phone: string;
  lat: number;
  lng: number;
  inventory: Record<BloodGroup, BloodStock>;
  lastUpdatedAt: string;
  updatedBy: string;
  confidenceLevel: ConfidenceLevel;
}

export const AMBULANCE_STATUSES = ["AVAILABLE", "ASSIGNED", "EN_ROUTE", "AT_HOSPITAL"] as const;
export type AmbulanceStatus = (typeof AMBULANCE_STATUSES)[number];

export interface Ambulance {
  id: string;
  callSign: string;
  crew: string;
  lat: number;
  lng: number;
  status: AmbulanceStatus;
  caseId?: string;
}

export interface Reservation {
  id: string;
  caseId: string;
  /** Exactly one of hospitalId / bloodBankId is set. */
  hospitalId?: string;
  bloodBankId?: string;
  resourceType: ResourceType | "BLOOD_UNITS";
  bloodGroup?: BloodGroup;
  quantity: number;
  status: ReservationStatus;
  createdAt: string;
  expiresAt: string;
}

export interface HospitalRequest {
  id: string;
  caseId: string;
  hospitalId: string;
  status: RequestStatus;
  /** Optional coordinator reason on rejection. */
  reason?: string;
  idempotencyKey?: string;
  createdAt: string;
  expiresAt: string;
  respondedAt?: string;
  respondedBy?: string;
}

/** One ranked hospital as produced by the matching service (Phase 3). */
export interface RankedHospital {
  hospitalId: string;
  rank: number;
  /** 0..100, higher is better. */
  score: number;
  suitability: "SUITABLE" | "PARTIAL" | "UNSUITABLE";
  distanceKm: number;
  etaMinutes: number;
  matched: ResourceType[];
  missing: ResourceType[];
  missingCritical: ResourceType[];
  bloodBankId?: string;
  bloodDistanceKm?: number;
  bloodUnitsAvailable?: number;
  dataAgeMinutes: number;
  stale: boolean;
  breakdown: {
    capability: number;
    availability: number;
    specialists: number;
    travel: number;
    freshness: number;
  };
  explanation: string;
}

export interface MatchResult {
  at: string;
  primaryHospitalId?: string;
  backupHospitalId?: string;
  ranked: RankedHospital[];
}

export interface EmergencyCase {
  id: string;
  tempPatientId: string;
  age?: number;
  sex?: "M" | "F" | "OTHER";
  incidentType: IncidentType;
  notes: string;
  severity: CaseSeverity;
  bloodGroup?: BloodGroup;
  bloodUnitsNeeded?: number;
  lat: number;
  lng: number;
  locationLabel: string;
  requirements: ResourceType[];
  requirementSource?: "KEYWORD" | "AI" | "MANUAL";
  /** Twist 4: when the injury happened, which starts the golden hour. Defaults to createdAt. */
  incidentAt?: string;
  /** Twist 1: triage colour, set or confirmed by a human. */
  triage?: TriageTag;
  /** Twist 1: the mass-casualty incident this patient came from, if any. */
  mciId?: string;
  missingInformation: string[];
  status: CaseStatus;
  ambulanceId?: string;
  hospitalId?: string;
  backupHospitalId?: string;
  lastMatch?: MatchResult;
  reservations: Reservation[];
  createdAt: string;
  updatedAt: string;
}

export interface EmergencyEvent {
  id: string;
  /** Undefined for system-wide events such as a hospital resource update. */
  caseId?: string;
  hospitalId?: string;
  bloodBankId?: string;
  type: EventType;
  actorRole: ActorRole;
  message: string;
  at: string;
}

// ---------- Phase 9: explicit blood requests ----------

export const BLOOD_COMPONENTS = ["WHOLE_BLOOD", "PACKED_RED_CELLS", "PLASMA", "PLATELETS"] as const;
export type BloodComponent = (typeof BLOOD_COMPONENTS)[number];

export const BLOOD_COMPONENT_LABEL: Record<BloodComponent, string> = {
  WHOLE_BLOOD: "Whole blood",
  PACKED_RED_CELLS: "Packed red cells",
  PLASMA: "Plasma",
  PLATELETS: "Platelets",
};

/**
 * A hospital asking a named blood bank to hold units for a named case.
 * Accepting goes straight to RESERVED: an operator saying yes without holding the
 * units is the WhatsApp-group failure this whole module exists to replace.
 */
export const BLOOD_REQUEST_STATUSES = ["PENDING", "RESERVED", "REJECTED", "FULFILLED", "RELEASED", "EXPIRED"] as const;
export type BloodRequestStatus = (typeof BLOOD_REQUEST_STATUSES)[number];

export interface BloodRequest {
  id: string;
  caseId: string;
  hospitalId: string;
  bloodBankId: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  units: number;
  status: BloodRequestStatus;
  /** Operator's reason when rejecting. */
  reason?: string;
  requestedBy: string;
  respondedBy?: string;
  createdAt: string;
  expiresAt: string;
  respondedAt?: string;
}

// ---------- Phase 10: family access ----------

/**
 * A read-only, expiring link for one case. The token is the only credential, so it is
 * long and random, it is never shown on any staff screen beyond the copy control, and
 * the page it opens carries no clinical notes and no staff commentary.
 */
export interface FamilyAccessToken {
  token: string;
  caseId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  lastViewedAt?: string;
  viewCount: number;
}

// ---------- Phase 10: language ----------

export const LOCALES = ["en", "mr", "hi"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  mr: "मराठी",
  hi: "हिंदी",
};

// ---------- Twist 1: mass-casualty surge ----------

/**
 * START triage colours, the vocabulary responders already use.
 * A human always sets or confirms these. The system never assigns EXPECTANT on its own —
 * that is a clinical judgement and outside this tool's safety boundary.
 */
export const TRIAGE_TAGS = ["RED", "YELLOW", "GREEN", "BLACK"] as const;
export type TriageTag = (typeof TRIAGE_TAGS)[number];

export const TRIAGE_LABEL: Record<TriageTag, string> = {
  RED: "Immediate",
  YELLOW: "Delayed",
  GREEN: "Minor",
  BLACK: "Expectant",
};

export const TRIAGE_ORDER: Record<TriageTag, number> = { RED: 0, YELLOW: 1, GREEN: 2, BLACK: 3 };

/** Default tag from the severity the crew already chose; always overridable by a human. */
export function triageFromSeverity(severity: CaseSeverity): TriageTag {
  if (severity === "CRITICAL") return "RED";
  if (severity === "HIGH") return "YELLOW";
  return "GREEN";
}

export interface MassCasualtyIncident {
  id: string;
  label: string;
  lat: number;
  lng: number;
  declaredAt: string;
  declaredBy: string;
  caseIds: string[];
  closedAt?: string;
}

// ---------- Twist 3: facility tiers and overflow ----------

export const FACILITY_TIERS = ["TERTIARY", "SECONDARY", "PRIMARY", "CAMP"] as const;
export type FacilityTier = (typeof FACILITY_TIERS)[number];

export const FACILITY_TIER_LABEL: Record<FacilityTier, string> = {
  TERTIARY: "Tertiary hospital",
  SECONDARY: "Secondary centre",
  PRIMARY: "Primary health centre",
  CAMP: "Emergency camp",
};

// ---------- Twist 4: golden hour ----------

export const GOLDEN_HOUR_MINUTES = 60;

/** Where the hour actually goes. Most of it is usually coordination, not driving. */
export const CARE_PHASES = ["DETECTION", "DISPATCH", "TO_SCENE", "ON_SCENE", "TO_HOSPITAL", "HANDOVER"] as const;
export type CarePhase = (typeof CARE_PHASES)[number];

export const CARE_PHASE_LABEL: Record<CarePhase, string> = {
  DETECTION: "Call received",
  DISPATCH: "Finding a hospital",
  TO_SCENE: "Travel to scene",
  ON_SCENE: "On scene",
  TO_HOSPITAL: "Travel to hospital",
  HANDOVER: "Handover",
};
