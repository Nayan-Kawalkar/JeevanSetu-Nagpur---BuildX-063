/**
 * Twist 1 — the surge allocator.
 *
 * THE PROBLEM THIS SERVICE EXISTS TO FIX.
 * `rankHospitals` in lib/services/matching.ts ranks hospitals for ONE patient. That is the right
 * answer to the question it was asked, and it is the wrong answer here. Call it eighty times for
 * eighty casualties from one highway pile-up and it returns the same answer eighty times: "Wardha
 * Road Trauma is best." That hospital has two ICU beds. Per-patient greedy matching in a surge is
 * not merely suboptimal, it is actively harmful — it converges every ambulance in the district on
 * one saturated door while beds sit empty four kilometres away.
 *
 * So this module does not rank. It ALLOCATES: one global pass over all patients at once, in
 * triage order, against a mutable capacity ledger that decrements as each patient is placed.
 * Patient eleven sees the beds patients one to ten already took. That single difference is the
 * whole point of the feature.
 *
 * Safety boundary, unchanged. This is coordination and decision support only. Nothing here
 * diagnoses, prescribes or promises. Triage tags are set or confirmed by a human; the system
 * never assigns or infers BLACK/EXPECTANT on its own — see `triageOf` below. Every assignment
 * carries a plain-language reason, and a person presses the button that applies the plan.
 */
import { etaMinutes, haversineKm, type LatLng } from "@/lib/geo";
import { extractByKeyword } from "@/lib/services/extraction";
import {
  addEvent,
  db,
  getCase,
  getIncident,
  listAmbulances,
  listCases,
  listHospitals,
  nextId,
  nowIso,
  touchCase,
} from "@/lib/store";
import { ApiError } from "@/lib/api";
import {
  COUNTABLE_RESOURCES,
  TRIAGE_ORDER,
  TRIAGE_TAGS,
  triageFromSeverity,
  type ActorRole,
  type Ambulance,
  type BloodGroup,
  type CaseSeverity,
  type CountableResource,
  type EmergencyCase,
  type FacilityTier,
  type Hospital,
  type IncidentType,
  type MassCasualtyIncident,
  type ResourceType,
  type TriageTag,
} from "@/lib/types";

// ---------- Public shapes (the surge screen depends on these exactly) ----------

export interface SurgeAssignment {
  caseId: string;
  triage: TriageTag;
  hospitalId?: string;
  facilityName?: string;
  etaMinutes?: number;
  /** Which rung of the escalation ladder this placement came from, for the "why" column. */
  rung?: string;
  reason: string;
  unassignedReason?: string;
}

export interface FacilityLoad {
  hospitalId: string;
  name: string;
  tier: FacilityTier;
  assigned: number;
  icuUsed: number;
  icuTotal: number;
  bedsUsed: number;
  bedsTotal: number;
  utilisationPercent: number;
}

export interface AmbulanceRun {
  ambulanceId: string;
  callSign: string;
  trips: {
    caseId: string;
    triage: TriageTag;
    hospitalId?: string;
    departAtMinute: number;
    returnAtMinute: number;
  }[];
  totalMinutes: number;
}

export interface SurgePlan {
  at: string;
  incidentId?: string;
  totals: Record<TriageTag, number>;
  assignments: SurgeAssignment[];
  loads: FacilityLoad[];
  unassigned: SurgeAssignment[];
  ambulanceRuns: AmbulanceRun[];
  narrative: string;
}

// ---------- Tunables ----------

/** Minutes a crew spends loading a patient at the scene. Planning allowance, not a measurement. */
const LOAD_MINUTES = 5;
/** Minutes a crew spends on handover before it is free for the next run. */
const HANDOVER_MINUTES = 5;
/** Ceiling on generated casualties, so nobody wedges the demo machine mid-pitch. */
export const MAX_GENERATED_CASUALTIES = 200;

/** Facilities with no tier recorded are the six standing hospitals we seeded: tertiary. */
function tierOf(h: Hospital): FacilityTier {
  return h.tier ?? "TERTIARY";
}

/**
 * A facility is trauma-capable if it can actually run a major trauma resuscitation, not merely
 * if it is large. Capability, not tier, because a camp stood up with a theatre counts and a
 * tertiary hospital with no surgical cover does not.
 */
function isTraumaCapable(h: Hospital): boolean {
  return (
    h.capabilities.includes("TRAUMA_TEAM") ||
    (h.capabilities.includes("OPERATING_ROOM") && h.capabilities.includes("ICU"))
  );
}

/**
 * The triage tag we act on.
 *
 * A tag a human set wins. Where none is set we fall back to the severity the crew already chose,
 * via `triageFromSeverity`, which by construction returns RED, YELLOW or GREEN and never BLACK.
 * The system does not infer expectant. That is a clinical judgement and it is outside our
 * boundary — permanently, not until we get better at it.
 */
function triageOf(c: EmergencyCase): TriageTag {
  return c.triage ?? triageFromSeverity(c.severity);
}

/** When this patient's clock started — the golden hour origin, falling back to case creation. */
function waitingSince(c: EmergencyCase): number {
  const raw = c.incidentAt ?? c.createdAt;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

// ---------- The capacity ledger ----------

/**
 * THE LEDGER. This is the single difference between this module and calling `rankHospitals` in a
 * loop, and it is the entire argument of Twist 1.
 *
 * It is a WORKING COPY of every facility's countable resources. Nothing in the store is touched
 * while planning — `planSurge` is a pure preview. But as each patient is placed we DECREMENT the
 * copy, so the next patient is matched against what is genuinely left rather than against the
 * same snapshot everyone else already spent. Eleventh patient, two ICU beds, ten patients ahead:
 * the ledger is what makes them see zero instead of two.
 */
interface LedgerEntry {
  hospital: Hospital;
  tier: FacilityTier;
  traumaCapable: boolean;
  free: Record<CountableResource, number>;
  total: Record<CountableResource, number>;
  assigned: number;
}

function buildLedger(hospitals: Hospital[]): Map<string, LedgerEntry> {
  const ledger = new Map<string, LedgerEntry>();
  for (const hospital of hospitals) {
    const free = {} as Record<CountableResource, number>;
    const total = {} as Record<CountableResource, number>;
    for (const resource of COUNTABLE_RESOURCES) {
      const availability = hospital.resources[resource];
      free[resource] = Math.max(0, availability?.available ?? 0);
      total[resource] = Math.max(0, availability?.total ?? 0);
    }
    ledger.set(hospital.id, {
      hospital,
      tier: tierOf(hospital),
      traumaCapable: isTraumaCapable(hospital),
      free,
      total,
      assigned: 0,
    });
  }
  return ledger;
}

/** The bed a patient of this tag needs first, and what we will settle for. */
function bedPreference(triage: TriageTag, requirements: ResourceType[]): CountableResource[] {
  const needsIntensive = triage === "RED" || requirements.includes("ICU") || requirements.includes("VENTILATOR");
  return needsIntensive ? ["ICU", "EMERGENCY_BED"] : ["EMERGENCY_BED", "ICU"];
}

/**
 * Tier order per triage tag — the escalation ladder, and the place where mass-casualty doctrine
 * and a nearest-hospital app part company.
 *
 * GREEN is deliberately steered DOWN-TIER: camps, then primary, then secondary, and only a
 * tertiary hospital as a last resort. A minor casualty occupying a trauma bay is a RED casualty
 * with nowhere to go an hour from now. Holding trauma capacity back is real doctrine and it is
 * the exact opposite of what "send everyone to the nearest big hospital" produces.
 */
const TIER_LADDER: Record<TriageTag, FacilityTier[]> = {
  RED: ["TERTIARY", "SECONDARY"],
  YELLOW: ["SECONDARY", "TERTIARY", "PRIMARY"],
  GREEN: ["CAMP", "PRIMARY", "SECONDARY", "TERTIARY"],
  // BLACK never walks this ladder; it is never auto-assigned. Present for exhaustiveness only.
  BLACK: [],
};

const RUNG_NOTE: Partial<Record<TriageTag, Partial<Record<FacilityTier, string>>>> = {
  RED: {
    TERTIARY: "trauma-capable tertiary with capacity",
    SECONDARY: "secondary centre — no trauma bed left, stabilise and forward",
  },
  YELLOW: {
    SECONDARY: "secondary centre, keeping trauma beds free",
    TERTIARY: "tertiary — no secondary capacity left",
    PRIMARY: "primary centre for observation",
  },
  GREEN: {
    CAMP: "emergency camp, deliberately down-tier to preserve trauma capacity",
    PRIMARY: "primary centre, deliberately down-tier to preserve trauma capacity",
    SECONDARY: "secondary centre, still keeping tertiary trauma beds free",
    TERTIARY: "tertiary as a last resort — every lower-tier facility is full",
  },
};

/**
 * Best fit for one patient on one rung of the ladder, against the CURRENT state of the ledger.
 *
 * "Best" is not "nearest". It is a small explicit cost: travel time, plus how long until the
 * resource is actually usable (Twist 4's readiness delay — a hospital five minutes further that
 * is ready now beats a closer one that is not), plus a penalty for each capability the patient
 * needs and this facility does not have, plus a mild penalty for facilities this plan has already
 * loaded up, which is what spreads the casualties instead of stacking them.
 */
function bestFit(
  entries: LedgerEntry[],
  scene: LatLng,
  beds: CountableResource[],
  requirements: ResourceType[],
): { entry: LedgerEntry; bed: CountableResource; eta: number } | undefined {
  let best: { entry: LedgerEntry; bed: CountableResource; eta: number; cost: number } | undefined;
  for (const entry of entries) {
    const bed = beds.find((b) => entry.free[b] > 0);
    if (bed === undefined) continue;

    const eta = etaMinutes(scene, entry.hospital);
    const readiness = entry.hospital.readinessMinutes?.[bed] ?? 0;
    const missing = requirements.filter((r) => !entry.hospital.capabilities.includes(r)).length;
    const cost = eta + readiness + missing * 8 + entry.assigned * 2;
    if (!best || cost < best.cost) best = { entry, bed, eta, cost };
  }
  return best ? { entry: best.entry, bed: best.bed, eta: best.eta } : undefined;
}

// ---------- Planning ----------

/**
 * Builds a whole-incident allocation. PURE PREVIEW: reads the store, writes nothing. The control
 * room looks at it, argues with it, and only then presses apply.
 */
export function planSurge(caseIds: string[], now: number = Date.now()): SurgePlan {
  const cases = caseIds
    .map((id) => db().cases[id])
    .filter((c): c is EmergencyCase => Boolean(c) && c.status !== "CLOSED" && c.status !== "CANCELLED");

  const hospitals = listHospitals();
  const ledger = buildLedger(hospitals);

  const totals: Record<TriageTag, number> = { RED: 0, YELLOW: 0, GREEN: 0, BLACK: 0 };
  for (const c of cases) totals[triageOf(c)] += 1;

  /**
   * STEP 1 — order. Triage tag first, then longest waiting. NEVER arrival order, and never
   * match score: a high-scoring GREEN must not take the bed a RED is waiting for.
   */
  const ordered = cases.slice().sort((a, b) => {
    const byTriage = TRIAGE_ORDER[triageOf(a)] - TRIAGE_ORDER[triageOf(b)];
    if (byTriage !== 0) return byTriage;
    return waitingSince(a) - waitingSince(b);
  });

  const assignments: SurgeAssignment[] = [];
  const unassigned: SurgeAssignment[] = [];

  /**
   * STEP 2 — passes. RED first against trauma-capable facilities, then YELLOW, then GREEN. The
   * passes matter because the ledger is shared: everything RED takes is genuinely gone before a
   * single GREEN is looked at.
   */
  for (const tag of TRIAGE_TAGS) {
    for (const c of ordered.filter((x) => triageOf(x) === tag)) {
      const scene: LatLng = { lat: c.lat, lng: c.lng };

      // STEP 4 — BLACK is never auto-assigned to a trauma bed. It is listed for a human.
      if (tag === "BLACK") {
        unassigned.push({
          caseId: c.id,
          triage: tag,
          reason: "Held for the triage officer.",
          unassignedReason:
            "Tagged expectant by a human at the scene. The system does not allocate or re-tag expectant patients — a clinician decides.",
        });
        continue;
      }

      const beds = bedPreference(tag, c.requirements);
      let placed = false;

      for (const tier of TIER_LADDER[tag]) {
        const candidates = Array.from(ledger.values()).filter((e) => {
          if (e.tier !== tier) return false;
          // RED only goes somewhere that can actually run the resuscitation.
          if (tag === "RED" && tier === "TERTIARY" && !e.traumaCapable) return false;
          return true;
        });
        const fit = bestFit(candidates, scene, beds, c.requirements);
        if (!fit) continue;

        // STEP 3 — SPEND IT. The ledger decrements here, so the next patient in this very loop
        // sees one fewer bed. This is the line that per-patient ranking can never have.
        fit.entry.free[fit.bed] -= 1;
        if (c.requirements.includes("VENTILATOR") && fit.entry.free.VENTILATOR > 0) {
          fit.entry.free.VENTILATOR -= 1;
        }
        fit.entry.assigned += 1;

        const bedWord = fit.bed === "ICU" ? "ICU bed" : "emergency bed";
        const rung = RUNG_NOTE[tag]?.[tier] ?? `${tier.toLowerCase()} facility`;
        assignments.push({
          caseId: c.id,
          triage: tag,
          hospitalId: fit.entry.hospital.id,
          facilityName: fit.entry.hospital.name,
          etaMinutes: fit.eta,
          rung,
          reason: `${bedWord} still free after ${fit.entry.assigned - 1} earlier placement${
            fit.entry.assigned - 1 === 1 ? "" : "s"
          } here, about ${fit.eta} min away — ${rung}.`,
        });
        placed = true;
        break;
      }

      // STEP 5 — anything unplaceable is stated plainly. This list is the handover to the
      // overflow/camps feature: it is exactly the set a camp would be stood up to hold.
      if (!placed) {
        unassigned.push({
          caseId: c.id,
          triage: tag,
          reason: "No facility left with a bed this patient can use.",
          unassignedReason:
            tag === "RED"
              ? "Every trauma-capable facility is out of ICU and emergency beds in this plan."
              : "Every facility on this patient's tier ladder is out of beds in this plan.",
        });
      }
    }
  }

  const loads: FacilityLoad[] = Array.from(ledger.values())
    .map((e) => {
      const icuTotal = e.total.ICU;
      const bedsTotal = e.total.EMERGENCY_BED;
      // Used = occupancy the facility already reported, plus what this plan would add.
      const icuUsed = Math.min(icuTotal, icuTotal - e.free.ICU);
      const bedsUsed = Math.min(bedsTotal, bedsTotal - e.free.EMERGENCY_BED);
      const capacity = icuTotal + bedsTotal;
      return {
        hospitalId: e.hospital.id,
        name: e.hospital.name,
        tier: e.tier,
        assigned: e.assigned,
        icuUsed,
        icuTotal,
        bedsUsed,
        bedsTotal,
        utilisationPercent: capacity === 0 ? 100 : Math.round(((icuUsed + bedsUsed) / capacity) * 100),
      };
    })
    .sort((a, b) => b.assigned - a.assigned || b.utilisationPercent - a.utilisationPercent);

  const ambulanceRuns = planAmbulanceRuns(assignments, cases, listAmbulances());

  return {
    at: new Date(now).toISOString(),
    incidentId: cases.find((c) => c.mciId)?.mciId,
    totals,
    assignments,
    loads,
    unassigned,
    ambulanceRuns,
    narrative: buildNarrative(totals, assignments, unassigned, loads),
  };
}

/**
 * Two or three plain sentences a control-room lead can read aloud without translating first.
 * No jargon, no scores, no percentages — counts and facility names only.
 */
function buildNarrative(
  totals: Record<TriageTag, number>,
  assignments: SurgeAssignment[],
  unassigned: SurgeAssignment[],
  loads: FacilityLoad[],
): string {
  const count = totals.RED + totals.YELLOW + totals.GREEN + totals.BLACK;
  if (count === 0) return "No casualties selected, so there is nothing to allocate yet.";

  const head = `${count} casualt${count === 1 ? "y" : "ies"}: ${totals.RED} immediate, ${
    totals.YELLOW
  } delayed, ${totals.GREEN} minor${totals.BLACK > 0 ? `, ${totals.BLACK} expectant` : ""}.`;

  const redSites = new Set(assignments.filter((a) => a.triage === "RED").map((a) => a.hospitalId));
  const greenSites = new Set(
    assignments.filter((a) => a.triage === "GREEN" && a.rung?.includes("down-tier")).map((a) => a.hospitalId),
  );
  const parts: string[] = [];
  if (redSites.size > 0) {
    parts.push(`Immediate cases went to the ${redSites.size} trauma-capable facilit${
      redSites.size === 1 ? "y" : "ies"
    } with capacity`);
  }
  if (greenSites.size > 0) {
    parts.push(
      `minor cases were sent to ${greenSites.size} lower-tier facilit${
        greenSites.size === 1 ? "y" : "ies"
      } to keep trauma beds free`,
    );
  }
  const body = parts.length > 0 ? `${parts.join("; ")}.` : "Nothing could be placed against current capacity.";

  const busiest = loads.find((l) => l.assigned > 0);
  const tail =
    unassigned.length > 0
      ? `${unassigned.length} remain unplaced and need a camp or an out-of-district facility.`
      : busiest
        ? `Heaviest load is ${busiest.name} at ${busiest.utilisationPercent}% of its beds.`
        : "";

  return [head, body, tail].filter(Boolean).join(" ");
}

// ---------- Ambulance shuttle runs ----------

/**
 * Four vehicles and eighty patients is a shuttle problem, not an assignment problem.
 *
 * Greedy: every time a vehicle comes free, give it the nearest unserved patient of the highest
 * triage tag still waiting, estimate the round trip as (travel to scene + load + travel to the
 * receiving hospital + handover), and queue the next. The vehicle's next trip starts from the
 * hospital it just handed over at, which is what makes later trips in a run realistic.
 *
 * HONEST ABOUT WHAT THIS IS: a planning estimate produced from straight-line distance and a fixed
 * average speed. It is not live tracking, it does not know about the level crossing on Kamptee
 * Road, and no crew should be told these minutes as a promise.
 */
function planAmbulanceRuns(
  assignments: SurgeAssignment[],
  cases: EmergencyCase[],
  ambulances: Ambulance[],
): AmbulanceRun[] {
  if (ambulances.length === 0) return [];
  const caseById = new Map(cases.map((c) => [c.id, c]));

  const queue = assignments
    .filter((a) => caseById.has(a.caseId))
    .slice()
    .sort((a, b) => TRIAGE_ORDER[a.triage] - TRIAGE_ORDER[b.triage]);

  const fleet = ambulances.map((a) => ({
    ambulanceId: a.id,
    callSign: a.callSign,
    at: { lat: a.lat, lng: a.lng } as LatLng,
    freeAtMinute: 0,
    trips: [] as AmbulanceRun["trips"],
  }));

  const served = new Set<string>();
  while (served.size < queue.length) {
    const vehicle = fleet.reduce((soonest, v) => (v.freeAtMinute < soonest.freeAtMinute ? v : soonest), fleet[0]);

    // Highest triage tag still waiting, then nearest to this vehicle.
    const waiting = queue.filter((a) => !served.has(a.caseId));
    const topTag = waiting.reduce(
      (best, a) => (TRIAGE_ORDER[a.triage] < TRIAGE_ORDER[best] ? a.triage : best),
      waiting[0].triage,
    );
    const pool = waiting.filter((a) => a.triage === topTag);
    let pick = pool[0];
    let pickKm = Infinity;
    for (const candidate of pool) {
      const scene = caseById.get(candidate.caseId);
      if (!scene) continue;
      const km = haversineKm(vehicle.at, scene);
      if (km < pickKm) {
        pickKm = km;
        pick = candidate;
      }
    }

    const scene = caseById.get(pick.caseId);
    served.add(pick.caseId);
    if (!scene) continue;

    const destination = pick.hospitalId ? db().hospitals[pick.hospitalId] : undefined;
    const toScene = etaMinutes(vehicle.at, scene);
    const toHospital = destination ? etaMinutes(scene, destination) : 0;
    const departAtMinute = vehicle.freeAtMinute;
    const returnAtMinute = departAtMinute + toScene + LOAD_MINUTES + toHospital + HANDOVER_MINUTES;

    vehicle.trips.push({
      caseId: pick.caseId,
      triage: pick.triage,
      hospitalId: pick.hospitalId,
      departAtMinute,
      returnAtMinute,
    });
    vehicle.freeAtMinute = returnAtMinute;
    if (destination) vehicle.at = { lat: destination.lat, lng: destination.lng };
  }

  return fleet.map((v) => ({
    ambulanceId: v.ambulanceId,
    callSign: v.callSign,
    trips: v.trips,
    totalMinutes: v.freeAtMinute,
  }));
}

// ---------- Applying a plan ----------

/**
 * Commits a plan a human has looked at and accepted.
 *
 * The bed count on each facility is decremented for real here: the plan promised those beds, and
 * a utilisation bar that does not move is a lie told to the next person who looks at the board.
 * Cases already routed somewhere are skipped rather than double-booked, and every skip is
 * returned in `failed` so the operator sees what did not take.
 */
export function applySurge(plan: SurgePlan, by: ActorRole): { applied: number; failed: string[] } {
  const failed: string[] = [];
  let applied = 0;

  for (const assignment of plan.assignments) {
    if (!assignment.hospitalId) continue;
    const emergencyCase = db().cases[assignment.caseId];
    const hospital = db().hospitals[assignment.hospitalId];
    if (!emergencyCase) {
      failed.push(`${assignment.caseId}: case no longer exists`);
      continue;
    }
    if (!hospital) {
      failed.push(`${assignment.caseId}: ${assignment.hospitalId} is no longer in the facility pool`);
      continue;
    }
    if (emergencyCase.hospitalId && emergencyCase.hospitalId !== assignment.hospitalId) {
      failed.push(`${assignment.caseId}: already routed to ${emergencyCase.hospitalId}`);
      continue;
    }

    const bed: CountableResource =
      assignment.triage === "RED" && hospital.resources.ICU.available > 0 ? "ICU" : "EMERGENCY_BED";
    if (hospital.resources[bed].available > 0) hospital.resources[bed].available -= 1;
    hospital.lastUpdatedAt = nowIso();
    hospital.updatedBy = "Surge allocation";

    emergencyCase.hospitalId = assignment.hospitalId;
    emergencyCase.triage = assignment.triage;
    emergencyCase.status = "ACCEPTED";
    touchCase(emergencyCase);
    applied += 1;

    addEvent({
      caseId: emergencyCase.id,
      hospitalId: hospital.id,
      type: "MATCHING_COMPLETED",
      actorRole: by,
      message: `Surge allocation: directed to ${hospital.name}. ${assignment.reason}`,
    });
  }

  addEvent({
    type: "MATCHING_COMPLETED",
    actorRole: by,
    message: `Surge plan applied — ${applied} casualt${applied === 1 ? "y" : "ies"} allocated, ${
      plan.unassigned.length
    } left unplaced.`,
  });

  return { applied, failed };
}

// ---------- Incidents ----------

export function declareIncident(input: {
  label: string;
  lat: number;
  lng: number;
  declaredBy: string;
}): MassCasualtyIncident {
  const incident: MassCasualtyIncident = {
    id: nextId("mci"),
    label: input.label,
    lat: input.lat,
    lng: input.lng,
    declaredAt: nowIso(),
    declaredBy: input.declaredBy,
    caseIds: [],
  };
  db().incidents[incident.id] = incident;
  addEvent({
    type: "RESOURCE_UPDATED",
    actorRole: "CONTROL_ROOM_OPERATOR",
    message: `Mass-casualty incident ${incident.id} declared: ${incident.label}.`,
  });
  return incident;
}

export function closeIncident(id: string, by: ActorRole): MassCasualtyIncident {
  const incident = getIncident(id);
  if (incident.closedAt) throw new ApiError(409, `Incident ${id} is already closed.`);
  incident.closedAt = nowIso();
  addEvent({
    type: "RESOURCE_UPDATED",
    actorRole: by,
    message: `Mass-casualty incident ${incident.id} closed after ${incident.caseIds.length} casualties.`,
  });
  return incident;
}

// ---------- The demo engine ----------

/**
 * A believable highway pile-up, generated fast.
 *
 * Deliberately NOT routed through `createCase`: that awaits the AI extraction layer and assigns a
 * crew per patient, which is right for one patient off a paramedic's form and wrong eighty times
 * over while a judge watches a spinner. Instead each casualty is built directly and passed
 * through `extractByKeyword`, which is pure, synchronous and the same floor the AI path is only
 * allowed to add to — so the requirements these patients carry are the real ones the matcher uses.
 *
 * On triage tags: these stand in for what the triage officers tagged at the scene during the
 * drill. They are simulated HUMAN input, including the small expectant group, which is why they
 * appear here in a data generator and nowhere in the allocator. The allocator still never infers
 * a BLACK tag for itself.
 */
export function generateCasualties(incidentId: string, count: number): EmergencyCase[] {
  const incident = getIncident(incidentId);
  if (incident.closedAt) throw new ApiError(409, `Incident ${incidentId} is closed.`);
  const total = Math.max(1, Math.min(MAX_GENERATED_CASUALTIES, Math.trunc(count)));

  // Seeded from the incident id so a rehearsal and the live run look the same.
  const random = seededRandom(incident.id.length * 7919 + total);
  const created: EmergencyCase[] = [];
  const at = nowIso();

  for (let i = 0; i < total; i++) {
    const tag = pickTriage(random());
    const pattern = PATTERNS[tag][Math.floor(random() * PATTERNS[tag].length)];
    const severity: CaseSeverity = SEVERITY_FOR[tag];
    const bloodGroup = BLOOD_MIX[Math.floor(random() * BLOOD_MIX.length)];
    const age = 8 + Math.floor(random() * 62);
    const sex: EmergencyCase["sex"] = random() < 0.62 ? "M" : "F";

    // Scattered within roughly a kilometre of the incident: one degree of latitude is about
    // 111 km, so +/- 0.009 deg is the box we want.
    const lat = incident.lat + (random() - 0.5) * 0.018;
    const lng = incident.lng + (random() - 0.5) * 0.018;

    const notes = `${pattern.notes} Casualty ${i + 1} of ${total} from ${incident.label}.`;
    const extraction = extractByKeyword({ notes, incidentType: INCIDENT_TYPE, severity, bloodGroup, age });

    const id = nextId("case");
    const emergencyCase: EmergencyCase = {
      id,
      tempPatientId: `MCI-${incident.id.slice(-4)}-${String(i + 1).padStart(3, "0")}`,
      age,
      sex,
      incidentType: INCIDENT_TYPE,
      notes,
      severity: extraction.priority,
      bloodGroup,
      bloodUnitsNeeded: tag === "RED" ? 2 : undefined,
      lat,
      lng,
      locationLabel: `${incident.label} — casualty ${i + 1}`,
      requirements: extraction.requirements,
      requirementSource: "KEYWORD",
      incidentAt: at,
      triage: tag,
      mciId: incident.id,
      missingInformation: extraction.missingInformation,
      status: "REQUIREMENTS_EXTRACTED",
      reservations: [],
      createdAt: at,
      updatedAt: at,
    };
    db().cases[id] = emergencyCase;
    incident.caseIds.push(id);
    created.push(emergencyCase);
  }

  // One event for the batch, not eighty: a control-room feed drowned in identical lines is a
  // feed nobody reads.
  addEvent({
    type: "CASE_CREATED",
    actorRole: "PARAMEDIC",
    message: `${created.length} casualties logged against ${incident.id} (${incident.label}), triage tags as recorded at the scene.`,
  });

  return created;
}

const INCIDENT_TYPE: IncidentType = "ROAD_ACCIDENT";

const SEVERITY_FOR: Record<TriageTag, CaseSeverity> = {
  RED: "CRITICAL",
  YELLOW: "HIGH",
  GREEN: "LOW",
  BLACK: "CRITICAL",
};

/** Roughly 15% immediate, 35% delayed, 48% minor, 2% expectant — a realistic pile-up mix. */
function pickTriage(r: number): TriageTag {
  if (r < 0.15) return "RED";
  if (r < 0.5) return "YELLOW";
  if (r < 0.98) return "GREEN";
  return "BLACK";
}

/** Injury patterns written so the existing keyword extractor maps them to sensible requirements. */
const PATTERNS: Record<TriageTag, { notes: string }[]> = {
  RED: [
    { notes: "Head injury, unconscious at scene, GCS 7, pupils unequal. Intubation support in progress." },
    { notes: "Crushed chest, difficulty breathing, oxygen saturation 84, needs ventilator support." },
    { notes: "Open femur fracture with heavy bleeding, pressure dressing applied, pulse 132, BP 80/50." },
    { notes: "Abdominal injury, rigid abdomen, internal bleeding suspected, BP 84/54, needs surgery." },
  ],
  YELLOW: [
    { notes: "Closed femur fracture, deformed right thigh, stable, pulse 96, pain severe." },
    { notes: "Head injury with brief loss of consciousness, now GCS 14, vomiting once, needs CT scan." },
    { notes: "Fractured forearm and collarbone, bleeding controlled, BP 118/76, alert." },
    { notes: "Burn to left arm and chest, about 12 percent, conscious, pulse 104." },
    { notes: "Suspected spinal injury, immobilised on board, sensation intact, BP 120/80." },
  ],
  GREEN: [
    { notes: "Walking wounded, minor lacerations to forearm, fully alert, BP 124/78." },
    { notes: "Abrasions and bruising, no loss of consciousness, walking unaided." },
    { notes: "Sprained ankle and grazes, alert and oriented, pulse 88." },
    { notes: "Glass cuts to face, bleeding stopped with dressing, alert, BP 118/74." },
    { notes: "Shaken, no visible injury, complains of neck stiffness, alert, pulse 92." },
  ],
  BLACK: [
    { notes: "No signs of life on arrival of first crew. Tagged expectant by the triage officer at the scene." },
  ],
};

/** Roughly the Indian distribution, so the blood module has something realistic to chew on. */
const BLOOD_MIX: BloodGroup[] = [
  "O_POS",
  "O_POS",
  "O_POS",
  "B_POS",
  "B_POS",
  "B_POS",
  "A_POS",
  "A_POS",
  "AB_POS",
  "O_NEG",
  "B_NEG",
  "A_NEG",
];

/** Small deterministic PRNG (mulberry32) so the demo is reproducible run to run. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cases belonging to one incident, or every open surge case when no incident is named. */
export function surgeCaseIds(incidentId?: string): string[] {
  if (incidentId) return getIncident(incidentId).caseIds.filter((id) => Boolean(db().cases[id]));
  return listCases({ active: true })
    .filter((c) => Boolean(c.mciId))
    .map((c) => c.id);
}

/** Re-exported so routes can 404 on an unknown case id without importing the store directly. */
export const assertCase = getCase;
