/**
 * The control room's single read model.
 *
 * One call to `buildOverview()` returns everything a wall display needs: case cards, hospital
 * capacity, blood stock, ambulances, alerts and the recent event feed. Keeping it in one
 * read model means the screen never has to fire a second request to answer "and is that
 * number still trustworthy?", and every derived flag (stale, capacityBand, alerts) is computed
 * from one consistent snapshot rather than from several requests taken seconds apart.
 *
 * This is coordination and decision support only. Nothing here diagnoses, prescribes or
 * invents a measurement: every number is something a human typed into the system, and every
 * alert carries the age of the data it was derived from so an operator can judge it.
 */
import { etaMinutes } from "@/lib/geo";
import {
  expirePendingRequests,
  isActive,
  listAmbulances,
  listBloodBanks,
  listCases,
  listEvents,
  listHospitals,
  listRequests,
} from "@/lib/store";
import {
  BLOOD_GROUPS,
  BLOOD_GROUP_LABEL,
  CASE_SEVERITIES,
  CASE_STATUSES,
  RESOURCE_LABEL,
  SPECIALIST_TYPES,
  type Ambulance,
  type BloodBank,
  type BloodGroup,
  type CaseSeverity,
  type CaseStatus,
  type ConfidenceLevel,
  type EmergencyCase,
  type EmergencyEvent,
  type Hospital,
  type IncidentType,
  type Reservation,
  type ResourceType,
  type SpecialistType,
} from "@/lib/types";

// ---------- Thresholds (exported so the UI can explain the rule it is showing) ----------

/** A hospital or blood bank not confirmed for this long is shown as stale, never as fact. */
export const STALE_AFTER_MINUTES = 30;
/** A hospital that has not answered a request for this long is blocking the case. */
export const UNANSWERED_AFTER_MINUTES = 2;
/** A reservation this close to expiry needs a human before the bed is silently released. */
export const RESERVATION_WARNING_MINUTES = 10;
/** At or below this many units a blood group counts as low at that bank. */
export const LOW_BLOOD_UNITS = 2;

/** Stand-in age for an unparsable timestamp: treated as maximally stale, still JSON-safe. */
const UNKNOWN_AGE_MINUTES = 99_999;

// ---------- Public shapes ----------

export type AlertLevel = "CRITICAL" | "WARNING" | "INFO";

export interface Alert {
  id: string;
  level: AlertLevel;
  kind: "STALE_DATA" | "BLOOD_SHORTAGE" | "UNANSWERED_REQUEST" | "NO_ICU" | "EXPIRING_RESERVATION";
  message: string;
  hospitalId?: string;
  bloodBankId?: string;
  caseId?: string;
}

export interface CapacitySnapshot {
  hospitalId: string;
  name: string;
  area: string;
  type: Hospital["type"];
  lat: number;
  lng: number;
  icuAvailable: number;
  icuTotal: number;
  edAvailable: number;
  edTotal: number;
  specialistsOnCall: SpecialistType[];
  dataAgeMinutes: number;
  stale: boolean;
  confidenceLevel: ConfidenceLevel;
  capacityBand: "GOOD" | "TIGHT" | "FULL";
}

/**
 * One active case as the wall display shows it.
 *
 * Deliberately excludes the free-text clinical notes. The control room coordinates beds,
 * blood and crews; it does not treat the patient, so the narrative description of the injury
 * has no operational use on a screen that several people can see from across a room.
 * Minimising patient data on a shared display is a design decision, not an oversight —
 * the notes stay on the case detail page, where the people who need them go looking.
 * Age and sex are left out for the same reason. Blood group and units are kept because the
 * control room is the desk that calls the blood bank.
 */
export interface CaseSummary {
  id: string;
  tempPatientId: string;
  severity: CaseSeverity;
  status: CaseStatus;
  incidentType: IncidentType;
  locationLabel: string;
  lat: number;
  lng: number;
  createdAt: string;
  updatedAt: string;
  minutesOpen: number;
  hospitalId?: string;
  hospitalName?: string;
  /** Estimated minutes to the assigned hospital; undefined until a hospital is chosen. */
  etaMinutes?: number;
  /** Where that estimate starts from, so the screen can label it honestly. */
  etaFrom?: "AMBULANCE" | "SCENE";
  ambulanceId?: string;
  ambulanceCallSign?: string;
  requirements: ResourceType[];
  bloodGroup?: BloodGroup;
  bloodUnitsNeeded?: number;
  activeReservationCount: number;
}

export interface BloodBankSnapshot {
  id: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  lastUpdatedAt: string;
  dataAgeMinutes: number;
  stale: boolean;
  confidenceLevel: ConfidenceLevel;
  inventory: Record<BloodGroup, { available: number; reserved: number }>;
  totalAvailable: number;
  /** Groups at or below LOW_BLOOD_UNITS units available at this bank. */
  lowGroups: BloodGroup[];
}

export interface OverviewCounts {
  active: number;
  critical: number;
  /** Every case ever created, by status, so closed and cancelled are visible too. */
  byStatus: Record<CaseStatus, number>;
  /** Active cases only, by severity. `bySeverity.CRITICAL` always equals `critical`. */
  bySeverity: Record<CaseSeverity, number>;
  unansweredRequests: number;
  closedToday: number;
  hospitals: number;
  bloodBanks: number;
  ambulancesAvailable: number;
  /** Hospitals plus blood banks whose numbers are older than STALE_AFTER_MINUTES. */
  staleSources: number;
}

export interface Overview {
  generatedAt: string;
  counts: OverviewCounts;
  cases: CaseSummary[];
  hospitals: CapacitySnapshot[];
  bloodBanks: BloodBankSnapshot[];
  ambulances: Ambulance[];
  alerts: Alert[];
  recentEvents: EmergencyEvent[];
}

// ---------- Small pure helpers ----------

const SEVERITY_RANK: Record<CaseSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const LEVEL_RANK: Record<AlertLevel, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
const KIND_RANK: Record<Alert["kind"], number> = {
  UNANSWERED_REQUEST: 0,
  BLOOD_SHORTAGE: 1,
  NO_ICU: 2,
  EXPIRING_RESERVATION: 3,
  STALE_DATA: 4,
};

function minutesSince(iso: string, now: number): number {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return UNKNOWN_AGE_MINUTES;
  return Math.max(0, Math.round((now - at) / 60_000));
}

function minutesUntil(iso: string, now: number): number {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return 0;
  return Math.round((at - now) / 60_000);
}

function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}

/** "58 minutes ago" / "2 hours ago" — plain words, no jargon, for alert sentences. */
function describeAge(minutes: number): string {
  if (minutes >= 90) return `${plural(Math.round(minutes / 60), "hour")} ago`;
  if (minutes <= 0) return "less than a minute ago";
  return `${plural(minutes, "minute")} ago`;
}

/** True when two timestamps fall on the same calendar day in the server's timezone. */
function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/**
 * FULL when neither an ICU bed nor an emergency bed is free, TIGHT when ICU is down to its
 * last bed, otherwise GOOD. A band is coarser than a number on purpose: it is readable from
 * across the room and it does not pretend the underlying count is live.
 */
function capacityBandOf(icuAvailable: number, edAvailable: number): CapacitySnapshot["capacityBand"] {
  if (icuAvailable <= 0 && edAvailable <= 0) return "FULL";
  if (icuAvailable <= 1) return "TIGHT";
  return "GOOD";
}

/** Lowercases a resource label for use mid-sentence, but leaves acronyms like "ICU bed" alone. */
function midSentence(label: string): string {
  return /^[A-Z]{2}/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

/** Human phrase for what a reservation is holding, e.g. "1 emergency bed" or "2 units of O-". */
function describeReservation(reservation: Reservation): string {
  if (reservation.resourceType === "BLOOD_UNITS") {
    const group = reservation.bloodGroup ? ` of ${BLOOD_GROUP_LABEL[reservation.bloodGroup]}` : "";
    return `${plural(reservation.quantity, "unit")}${group}`;
  }
  const label = midSentence(RESOURCE_LABEL[reservation.resourceType]);
  if (reservation.quantity === 1) return `1 ${label}`;
  // Labels that end in a bracket, such as "blood (matched group)", do not take a plural "s".
  return `${reservation.quantity} ${/[a-z]$/.test(label) ? `${label}s` : label}`;
}

// ---------- Builders ----------

function buildHospitalSnapshot(hospital: Hospital, now: number): CapacitySnapshot {
  const dataAgeMinutes = minutesSince(hospital.lastUpdatedAt, now);
  const icu = hospital.resources.ICU;
  const ed = hospital.resources.EMERGENCY_BED;
  return {
    hospitalId: hospital.id,
    name: hospital.name,
    area: hospital.area,
    type: hospital.type,
    lat: hospital.lat,
    lng: hospital.lng,
    icuAvailable: icu.available,
    icuTotal: icu.total,
    edAvailable: ed.available,
    edTotal: ed.total,
    specialistsOnCall: SPECIALIST_TYPES.filter((s) => hospital.specialists[s].onCall),
    dataAgeMinutes,
    stale: dataAgeMinutes > STALE_AFTER_MINUTES,
    confidenceLevel: hospital.confidenceLevel,
    capacityBand: capacityBandOf(icu.available, ed.available),
  };
}

function buildBloodBankSnapshot(bank: BloodBank, now: number): BloodBankSnapshot {
  const dataAgeMinutes = minutesSince(bank.lastUpdatedAt, now);
  const inventory = Object.fromEntries(
    BLOOD_GROUPS.map((g) => [
      g,
      { available: bank.inventory[g].available, reserved: bank.inventory[g].reserved },
    ]),
  ) as Record<BloodGroup, { available: number; reserved: number }>;
  return {
    id: bank.id,
    name: bank.name,
    area: bank.area,
    lat: bank.lat,
    lng: bank.lng,
    lastUpdatedAt: bank.lastUpdatedAt,
    dataAgeMinutes,
    stale: dataAgeMinutes > STALE_AFTER_MINUTES,
    confidenceLevel: bank.confidenceLevel,
    inventory,
    totalAvailable: BLOOD_GROUPS.reduce((sum, g) => sum + bank.inventory[g].available, 0),
    lowGroups: BLOOD_GROUPS.filter((g) => bank.inventory[g].available <= LOW_BLOOD_UNITS),
  };
}

function buildCaseSummary(
  emergencyCase: EmergencyCase,
  hospitals: Map<string, Hospital>,
  ambulances: Map<string, Ambulance>,
  now: number,
): CaseSummary {
  const hospital = emergencyCase.hospitalId ? hospitals.get(emergencyCase.hospitalId) : undefined;
  const ambulance = emergencyCase.ambulanceId ? ambulances.get(emergencyCase.ambulanceId) : undefined;

  // The ETA starts wherever the crew actually is; if no ambulance is assigned yet the only
  // honest origin is the incident location, and the screen says which one was used.
  const origin = ambulance ?? { lat: emergencyCase.lat, lng: emergencyCase.lng };
  const etaFrom: CaseSummary["etaFrom"] = ambulance ? "AMBULANCE" : "SCENE";

  return {
    id: emergencyCase.id,
    tempPatientId: emergencyCase.tempPatientId,
    severity: emergencyCase.severity,
    status: emergencyCase.status,
    incidentType: emergencyCase.incidentType,
    locationLabel: emergencyCase.locationLabel,
    lat: emergencyCase.lat,
    lng: emergencyCase.lng,
    createdAt: emergencyCase.createdAt,
    updatedAt: emergencyCase.updatedAt,
    minutesOpen: minutesSince(emergencyCase.createdAt, now),
    hospitalId: emergencyCase.hospitalId,
    hospitalName: hospital?.name,
    etaMinutes: hospital ? etaMinutes(origin, hospital) : undefined,
    etaFrom: hospital ? etaFrom : undefined,
    ambulanceId: emergencyCase.ambulanceId,
    ambulanceCallSign: ambulance?.callSign,
    requirements: [...emergencyCase.requirements],
    bloodGroup: emergencyCase.bloodGroup,
    bloodUnitsNeeded: emergencyCase.bloodUnitsNeeded,
    activeReservationCount: emergencyCase.reservations.filter((r) => r.status === "ACTIVE").length,
  };
}

function collectAlerts(input: {
  hospitals: Hospital[];
  hospitalSnapshots: CapacitySnapshot[];
  bloodBanks: BloodBank[];
  bankSnapshots: BloodBankSnapshot[];
  cases: EmergencyCase[];
  now: number;
}): Alert[] {
  const { hospitals, hospitalSnapshots, bloodBanks, bankSnapshots, cases, now } = input;
  const alerts: Alert[] = [];
  const hospitalName = new Map(hospitals.map((h) => [h.id, h.name]));
  const bankName = new Map(bloodBanks.map((b) => [b.id, b.name]));

  // Stale data: a number nobody has confirmed for half an hour is a guess, and the room
  // should be told that before it routes an ambulance on the strength of it.
  for (const snapshot of hospitalSnapshots) {
    if (!snapshot.stale) continue;
    alerts.push({
      id: `STALE_DATA:${snapshot.hospitalId}`,
      level: "WARNING",
      kind: "STALE_DATA",
      message: `${snapshot.name} last confirmed its bed numbers ${describeAge(snapshot.dataAgeMinutes)}. Call before sending a case there.`,
      hospitalId: snapshot.hospitalId,
    });
  }
  for (const snapshot of bankSnapshots) {
    if (!snapshot.stale) continue;
    alerts.push({
      id: `STALE_DATA:${snapshot.id}`,
      level: "WARNING",
      kind: "STALE_DATA",
      message: `${snapshot.name} last confirmed its stock ${describeAge(snapshot.dataAgeMinutes)}. Call before promising units.`,
      bloodBankId: snapshot.id,
    });
  }

  // Blood: nothing left in the whole city is a different problem from one bank running low.
  for (const group of BLOOD_GROUPS) {
    const label = BLOOD_GROUP_LABEL[group];
    const cityTotal = bloodBanks.reduce((sum, b) => sum + b.inventory[group].available, 0);
    if (cityTotal === 0) {
      alerts.push({
        id: `BLOOD_SHORTAGE:CITY:${group}`,
        level: "CRITICAL",
        kind: "BLOOD_SHORTAGE",
        message: `No ${label} blood is recorded at any of the ${bloodBanks.length} blood banks in the city. Arrange a transfer or a donor before a case needs it.`,
      });
      continue;
    }
    for (const bank of bloodBanks) {
      const units = bank.inventory[group].available;
      if (units < 1 || units > LOW_BLOOD_UNITS) continue;
      const cityContext =
        cityTotal === units
          ? `, the only ${units === 1 ? "one" : `${units}`} recorded in the city`
          : `, out of ${cityTotal} in the city`;
      alerts.push({
        id: `BLOOD_SHORTAGE:${bank.id}:${group}`,
        level: "WARNING",
        kind: "BLOOD_SHORTAGE",
        message: `${bank.name} is down to ${plural(units, "unit")} of ${label}${cityContext}.`,
        bloodBankId: bank.id,
      });
    }
  }

  // Unanswered requests: a case with nobody replying is a case standing still at the roadside.
  for (const request of listRequests({ status: "PENDING" })) {
    const waiting = minutesSince(request.createdAt, now);
    if (waiting < UNANSWERED_AFTER_MINUTES) continue;
    const name = hospitalName.get(request.hospitalId) ?? request.hospitalId;
    alerts.push({
      id: `UNANSWERED_REQUEST:${request.id}`,
      level: "CRITICAL",
      kind: "UNANSWERED_REQUEST",
      message: `${name} has not answered the request for case ${request.caseId} for ${plural(waiting, "minute")}. Phone the coordinator or try the backup hospital.`,
      hospitalId: request.hospitalId,
      caseId: request.caseId,
    });
  }

  // No ICU: only meaningful where an ICU exists at all, otherwise it is not news.
  for (const snapshot of hospitalSnapshots) {
    if (snapshot.icuTotal <= 0 || snapshot.icuAvailable > 0) continue;
    alerts.push({
      id: `NO_ICU:${snapshot.hospitalId}`,
      level: "WARNING",
      kind: "NO_ICU",
      message: `${snapshot.name} has no free ICU bed; all ${plural(snapshot.icuTotal, "bed")} are occupied.`,
      hospitalId: snapshot.hospitalId,
    });
  }

  // Expiring reservations: a hold that lapses quietly gives the bed away mid-journey.
  for (const emergencyCase of cases) {
    for (const reservation of emergencyCase.reservations) {
      if (reservation.status !== "ACTIVE") continue;
      const remaining = minutesUntil(reservation.expiresAt, now);
      if (remaining > RESERVATION_WARNING_MINUTES) continue;
      const place =
        (reservation.hospitalId ? hospitalName.get(reservation.hospitalId) : undefined) ??
        (reservation.bloodBankId ? bankName.get(reservation.bloodBankId) : undefined) ??
        "the holding facility";
      const what = describeReservation(reservation);
      const message =
        remaining <= 0
          ? `The hold on ${what} at ${place} for case ${emergencyCase.id} has run out. Confirm it again or the place is given away.`
          : `The hold on ${what} at ${place} for case ${emergencyCase.id} runs out in ${plural(remaining, "minute")}.`;
      alerts.push({
        id: `EXPIRING_RESERVATION:${reservation.id}`,
        level: "WARNING",
        kind: "EXPIRING_RESERVATION",
        message,
        hospitalId: reservation.hospitalId,
        bloodBankId: reservation.bloodBankId,
        caseId: emergencyCase.id,
      });
    }
  }

  // Worst first, then a fixed order within a level, then by id, so the list never reshuffles
  // between two polls that saw the same data.
  return alerts.sort(
    (a, b) =>
      LEVEL_RANK[a.level] - LEVEL_RANK[b.level] ||
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Builds the whole control-room read model from the in-memory store in one pass.
 *
 * Sweeps timed-out hospital requests first (the one impure step) so the screen can never show
 * a request that has already expired as if someone might still answer it; everything after
 * that is a pure derivation of the store at the instant `now`. Pass `now` to make the output
 * deterministic in tests or in a scripted demo.
 */
export function buildOverview(now: number = Date.now()): Overview {
  expirePendingRequests(now);

  const hospitals = listHospitals();
  const bloodBanks = listBloodBanks();
  const ambulances = listAmbulances();
  const allCases = listCases();
  // "Active" uses the store's shared definition (ACTIVE_STATUSES) so the wall display and
  // /api/health can never disagree about how many cases are open.
  const activeCases = allCases.filter((c) => isActive(c));

  const hospitalById = new Map(hospitals.map((h) => [h.id, h]));
  const ambulanceById = new Map(ambulances.map((a) => [a.id, a]));

  const hospitalSnapshots = hospitals
    .map((h) => buildHospitalSnapshot(h, now))
    .sort((a, b) => a.name.localeCompare(b.name));
  const bankSnapshots = bloodBanks
    .map((b) => buildBloodBankSnapshot(b, now))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Worst and oldest first: that is the order the room works the board in.
  const caseSummaries = activeCases
    .map((c) => buildCaseSummary(c, hospitalById, ambulanceById, now))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.minutesOpen - a.minutesOpen);

  const byStatus = Object.fromEntries(CASE_STATUSES.map((s) => [s, 0])) as Record<CaseStatus, number>;
  for (const c of allCases) byStatus[c.status] += 1;

  const bySeverity = Object.fromEntries(CASE_SEVERITIES.map((s) => [s, 0])) as Record<CaseSeverity, number>;
  for (const c of activeCases) bySeverity[c.severity] += 1;

  const today = new Date(now);
  const closedToday = allCases.filter(
    (c) => c.status === "CLOSED" && sameLocalDay(new Date(c.updatedAt), today),
  ).length;

  const counts: OverviewCounts = {
    active: activeCases.length,
    critical: bySeverity.CRITICAL,
    byStatus,
    bySeverity,
    unansweredRequests: listRequests({ status: "PENDING" }).length,
    closedToday,
    hospitals: hospitals.length,
    bloodBanks: bloodBanks.length,
    ambulancesAvailable: ambulances.filter((a) => a.status === "AVAILABLE").length,
    staleSources:
      hospitalSnapshots.filter((h) => h.stale).length + bankSnapshots.filter((b) => b.stale).length,
  };

  return {
    generatedAt: new Date(now).toISOString(),
    counts,
    cases: caseSummaries,
    hospitals: hospitalSnapshots,
    bloodBanks: bankSnapshots,
    // Copied, not handed out by reference, so a consumer of the read model cannot edit the store.
    ambulances: ambulances.map((a) => ({ ...a })),
    alerts: collectAlerts({ hospitals, hospitalSnapshots, bloodBanks, bankSnapshots, cases: allCases, now }),
    recentEvents: listEvents({ limit: 25 }),
  };
}
