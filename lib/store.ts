/**
 * In-memory database for the hackathon build.
 *
 * Kept on globalThis so it survives Next.js hot reloads in dev. On serverless hosts each
 * cold start re-seeds; the demo reset button restores the scripted scenario in one click.
 * All mutations are synchronous, which gives reservation logic transaction-like atomicity
 * within a single request (Node runs one request handler at a time on the event loop).
 */
import { ApiError } from "@/lib/api";
import { buildSeed } from "@/lib/seed";
import {
  ACTIVE_STATUSES,
  type ActorRole,
  type Ambulance,
  type BloodBank,
  type CaseStatus,
  type EmergencyCase,
  type EmergencyEvent,
  type EventType,
  type Hospital,
  type HospitalRequest,
  type BloodRequest,
  type FamilyAccessToken,
  type MassCasualtyIncident,
} from "@/lib/types";

export interface Database {
  seededAt: string;
  counters: { case: number; event: number; request: number; reservation: number; bloodRequest: number; mci: number; facility: number };
  hospitals: Record<string, Hospital>;
  bloodBanks: Record<string, BloodBank>;
  ambulances: Record<string, Ambulance>;
  cases: Record<string, EmergencyCase>;
  requests: Record<string, HospitalRequest>;
  bloodRequests: Record<string, BloodRequest>;
  /** Keyed by the token itself; the token is the only credential a family link has. */
  familyTokens: Record<string, FamilyAccessToken>;
  /** Twist 1: declared mass-casualty incidents. */
  incidents: Record<string, MassCasualtyIncident>;
  events: EmergencyEvent[];
}

const globalRef = globalThis as unknown as { __jeevansetuDb?: Database };

function byId<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((i) => [i.id, i]));
}

function createDatabase(): Database {
  const seed = buildSeed();
  return {
    seededAt: new Date().toISOString(),
    counters: { case: 3, event: 1, request: 2, reservation: 2, bloodRequest: 1, mci: 1, facility: 1 },
    hospitals: byId(seed.hospitals),
    bloodBanks: byId(seed.bloodBanks),
    ambulances: byId(seed.ambulances),
    cases: byId(seed.cases),
    requests: byId(seed.requests),
    bloodRequests: {},
    familyTokens: {},
    incidents: {},
    events: seed.events,
  };
}

export function db(): Database {
  if (!globalRef.__jeevansetuDb) globalRef.__jeevansetuDb = createDatabase();
  return globalRef.__jeevansetuDb;
}

/** Restores the scripted demo. Returns the fresh database. */
export function resetDb(): Database {
  globalRef.__jeevansetuDb = createDatabase();
  addEvent({ type: "DEMO_RESET", actorRole: "ADMIN", message: "Demo data reset to the Rohan scenario." });
  return globalRef.__jeevansetuDb;
}

export const nowIso = () => new Date().toISOString();

export function nextId(kind: keyof Database["counters"]): string {
  const n = db().counters[kind]++;
  const padded = String(n).padStart(4, "0");
  switch (kind) {
    case "case":
      return `JS-${new Date().getFullYear()}-${padded}`;
    case "event":
      return `EVT-${padded}`;
    case "request":
      return `REQ-${padded}`;
    case "reservation":
      return `RSV-${padded}`;
    case "bloodRequest":
      return `BRQ-${padded}`;
    case "mci":
      return `MCI-${padded}`;
    case "facility":
      return `CAMP-${padded}`;
  }
}

export function addEvent(input: {
  caseId?: string;
  hospitalId?: string;
  bloodBankId?: string;
  type: EventType;
  actorRole: ActorRole;
  message: string;
}): EmergencyEvent {
  const event: EmergencyEvent = { id: nextId("event"), at: nowIso(), ...input };
  db().events.push(event);
  return event;
}

// ---------- Lookups (throw ApiError 404 so route handlers stay short) ----------

export function getCase(id: string): EmergencyCase {
  const c = db().cases[id];
  if (!c) throw new ApiError(404, `Case ${id} not found`);
  return c;
}

export function getHospital(id: string): Hospital {
  const h = db().hospitals[id];
  if (!h) throw new ApiError(404, `Hospital ${id} not found`);
  return h;
}

export function getBloodBank(id: string): BloodBank {
  const b = db().bloodBanks[id];
  if (!b) throw new ApiError(404, `Blood bank ${id} not found`);
  return b;
}

export function getAmbulance(id: string): Ambulance {
  const a = db().ambulances[id];
  if (!a) throw new ApiError(404, `Ambulance ${id} not found`);
  return a;
}

export function getRequest(id: string): HospitalRequest {
  const r = db().requests[id];
  if (!r) throw new ApiError(404, `Request ${id} not found`);
  return r;
}

export const listHospitals = (): Hospital[] => Object.values(db().hospitals);
export const listBloodBanks = (): BloodBank[] => Object.values(db().bloodBanks);
export const listAmbulances = (): Ambulance[] => Object.values(db().ambulances);

export function isActive(c: EmergencyCase): boolean {
  return ACTIVE_STATUSES.includes(c.status);
}

export function listCases(filter: { status?: CaseStatus; active?: boolean } = {}): EmergencyCase[] {
  return Object.values(db().cases)
    .filter((c) => (filter.status ? c.status === filter.status : true))
    .filter((c) => (filter.active === undefined ? true : isActive(c) === filter.active))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listRequests(filter: { caseId?: string; hospitalId?: string; status?: HospitalRequest["status"] } = {}) {
  return Object.values(db().requests)
    .filter((r) => (filter.caseId ? r.caseId === filter.caseId : true))
    .filter((r) => (filter.hospitalId ? r.hospitalId === filter.hospitalId : true))
    .filter((r) => (filter.status ? r.status === filter.status : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getIncident(id: string): MassCasualtyIncident {
  const i = db().incidents[id];
  if (!i) throw new ApiError(404, `Incident ${id} not found`);
  return i;
}

export function listIncidents(openOnly = false): MassCasualtyIncident[] {
  return Object.values(db().incidents)
    .filter((i) => (openOnly ? !i.closedAt : true))
    .sort((a, b) => b.declaredAt.localeCompare(a.declaredAt));
}

/** Adds a facility (a stood-up camp) to the live matching pool. */
export function addHospital(h: Hospital): Hospital {
  db().hospitals[h.id] = h;
  return h;
}

export function removeHospital(id: string): boolean {
  if (!db().hospitals[id]) return false;
  delete db().hospitals[id];
  return true;
}

export function getBloodRequest(id: string): BloodRequest {
  const r = db().bloodRequests[id];
  if (!r) throw new ApiError(404, `Blood request ${id} not found`);
  return r;
}

export function listBloodRequests(
  filter: { caseId?: string; hospitalId?: string; bloodBankId?: string; status?: BloodRequest["status"] } = {},
): BloodRequest[] {
  return Object.values(db().bloodRequests)
    .filter((r) => (filter.caseId ? r.caseId === filter.caseId : true))
    .filter((r) => (filter.hospitalId ? r.hospitalId === filter.hospitalId : true))
    .filter((r) => (filter.bloodBankId ? r.bloodBankId === filter.bloodBankId : true))
    .filter((r) => (filter.status ? r.status === filter.status : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Looks a family link up by its token. Returns undefined rather than throwing: an
 *  unknown, expired or revoked token must all look identical to whoever holds it. */
export function getFamilyToken(token: string): FamilyAccessToken | undefined {
  return db().familyTokens[token];
}

export function listFamilyTokens(caseId: string): FamilyAccessToken[] {
  return Object.values(db().familyTokens).filter((t) => t.caseId === caseId);
}

export function listEvents(filter: { caseId?: string; hospitalId?: string; limit?: number } = {}): EmergencyEvent[] {
  const limit = filter.limit ?? 50;
  return db()
    .events.filter((e) => (filter.caseId ? e.caseId === filter.caseId : true))
    .filter((e) => (filter.hospitalId ? e.hospitalId === filter.hospitalId : true))
    .slice()
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

/** Marks a case as modified. Call after every mutation. */
export function touchCase(c: EmergencyCase): EmergencyCase {
  c.updatedAt = nowIso();
  return c;
}

/** Sweeps PENDING hospital requests past their expiry. Cheap; call on reads. */
export function expirePendingRequests(now: number = Date.now()): number {
  let expired = 0;
  for (const r of Object.values(db().requests)) {
    if (r.status === "PENDING" && new Date(r.expiresAt).getTime() < now) {
      r.status = "EXPIRED";
      r.respondedAt = nowIso();
      expired++;
      const c = db().cases[r.caseId];
      addEvent({
        caseId: r.caseId,
        hospitalId: r.hospitalId,
        type: "REQUEST_EXPIRED",
        actorRole: "SYSTEM",
        message: `Request to ${db().hospitals[r.hospitalId]?.name ?? r.hospitalId} expired without a response.`,
      });
      if (c && c.status === "HOSPITAL_REQUESTED") {
        c.status = "MATCHING";
        touchCase(c);
      }
    }
  }
  return expired;
}

export function healthSummary() {
  const active = listCases({ active: true });
  return {
    ok: true,
    service: "jeevansetu-360",
    activeCases: active.length,
    criticalCases: active.filter((c) => c.severity === "CRITICAL").length,
    hospitals: listHospitals().length,
    seededAt: db().seededAt,
    serverTime: nowIso(),
  };
}
