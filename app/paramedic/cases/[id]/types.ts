/**
 * The exact shapes the two endpoints this screen lives on return.
 *
 * Every entity type is imported from `lib/types`; nothing is re-declared here, so a field that
 * changes in the domain model breaks this screen at compile time instead of at the demo.
 */
import type {
  Ambulance,
  BloodBank,
  EmergencyCase,
  EmergencyEvent,
  Hospital,
  HospitalRequest,
  MatchResult,
} from "@/lib/types";

/** GET /api/cases/:id */
export interface CaseDetail {
  case: EmergencyCase;
  events: EmergencyEvent[];
  requests: HospitalRequest[];
  hospital?: Hospital;
  backupHospital?: Hospital;
  ambulance?: Ambulance;
}

/** GET (preview) and POST (decision) /api/cases/:id/match — same shape from both verbs. */
export interface MatchPayload {
  match: MatchResult;
  /** Every hospital the ranking names, keyed by id, so no follow-up call is needed. */
  hospitals: Record<string, Hospital>;
}

/** POST /api/requests */
export interface CreateRequestResponse {
  request: HospitalRequest;
}

/** GET /api/bloodbanks — only the names are used here, to turn a bank id into words. */
export interface BloodBankList {
  bloodBanks: BloodBank[];
}
