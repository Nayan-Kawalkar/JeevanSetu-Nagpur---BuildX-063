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
