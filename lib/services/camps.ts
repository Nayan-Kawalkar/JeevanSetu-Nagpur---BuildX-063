/**
 * Twist 3 — overflow: tiers, camps and the honest admission that the city can be full.
 *
 * The matcher this app was built around optimises for ONE patient: it ranks the whole city and
 * hands back the best hospital. That is exactly the wrong instinct when every tertiary hospital is
 * saturated, because the best hospital for each patient considered alone is the same hospital for
 * all of them, and a system that keeps naming it is just reporting the problem in a nicer font.
 *
 * So this module does three things the per-patient matcher cannot:
 *  - it measures the city rather than a shortlist (`cityCapacity`, `isOverflowing`), tier by tier,
 *    so load is visible spreading down the ladder instead of stacking on the top rung;
 *  - it proposes where a new facility should go, sited at the centroid of the patients nobody
 *    could place, which is an aggregate decision no single-patient ranking can ever reach;
 *  - it stands that facility up as a real `Hospital`. That is the whole payoff of having modelled
 *    a camp as a hospital: `addHospital` puts it in the live pool and the existing matcher, the
 *    map, the capacity board and the overview pick it up with no further work.
 *
 * Coordination and decision support only. A camp is created, sited and folded by a human; nothing
 * here diagnoses, prescribes, or promises that a bed will be there when the ambulance arrives.
 */
import { ApiError } from "@/lib/api";
import { etaMinutes, haversineKm } from "@/lib/geo";
import {
  addEvent,
  addHospital,
  getCase,
  getHospital,
  listCases,
  listHospitals,
  nextId,
  nowIso,
  removeHospital,
} from "@/lib/store";
import {
  COUNTABLE_RESOURCES,
  FACILITY_TIERS,
  type ActorRole,
  type Availability,
  type CountableResource,
  type FacilityTier,
  type Hospital,
  type ResourceType,
  type SpecialistStatus,
  type SpecialistType,
} from "@/lib/types";

/** At or above this tertiary utilisation the city is treated as overflowing. */
export const OVERFLOW_UTILISATION_PERCENT = 90;

/**
 * A facility seeded before tiers existed is a tertiary hospital: those six were the whole model.
 * Reading it here rather than back-filling the seed keeps the seed a contract nobody has to edit.
 */
export function tierOf(hospital: Hospital): FacilityTier {
  return hospital.tier ?? "TERTIARY";
}

// ---------- Standing a camp up and folding it ----------

export interface StandUpCampInput {
  name: string;
  lat: number;
  lng: number;
  beds: number;
  capabilities: ResourceType[];
  standUpBy: string;
}

function emptyResources(): Record<CountableResource, Availability> {
  return Object.fromEntries(COUNTABLE_RESOURCES.map((r) => [r, { total: 0, available: 0 }])) as Record<
    CountableResource,
    Availability
  >;
}

/**
 * No specialist is on call at a tent. Saying so explicitly, rather than leaving the field blank,
 * is what makes the matcher rule a camp out for a patient who needs a neurosurgeon instead of
 * quietly ranking it as "unknown".
 */
function noSpecialists(): Record<SpecialistType, SpecialistStatus> {
  return {
    NEUROSURGEON: { onCall: false, note: "Temporary camp: no specialist on site" },
    ORTHOPEDIC_SURGEON: { onCall: false, note: "Temporary camp: no specialist on site" },
    TRAUMA_TEAM: { onCall: false, note: "Temporary camp: no specialist on site" },
  };
}

/**
 * Creates a camp and puts it straight into the live matching pool.
 *
 * It is a plain `Hospital` with tier CAMP and `temporary` set, carrying only the beds it was
 * actually stood up with. Confidence is HIGH and the timestamp is now because a human just stated
 * these numbers on the spot — that is the freshest kind of report this system ever gets.
 */
export function standUpCamp(input: StandUpCampInput): Hospital {
  const resources = emptyResources();
  resources.EMERGENCY_BED = { total: input.beds, available: input.beds };

  // EMERGENCY_BED is implied by having beds; de-duplicated so the chip list cannot repeat it.
  const capabilities = Array.from(new Set<ResourceType>([...input.capabilities, "EMERGENCY_BED"]));

  const camp: Hospital = {
    id: nextId("facility"),
    name: input.name,
    type: "GOVERNMENT",
    tier: "CAMP",
    temporary: true,
    area: nearestAreaTo({ lat: input.lat, lng: input.lng }) ?? "Nagpur",
    address: `Temporary emergency camp at ${input.lat.toFixed(4)}, ${input.lng.toFixed(4)}`,
    phone: "112",
    lat: input.lat,
    lng: input.lng,
    capabilities,
    resources,
    specialists: noSpecialists(),
    lastUpdatedAt: nowIso(),
    updatedBy: input.standUpBy,
    sourceType: "MANUAL",
    confidenceLevel: "HIGH",
  };

  addHospital(camp);
  addEvent({
    hospitalId: camp.id,
    type: "RESOURCE_UPDATED",
    actorRole: "CONTROL_ROOM_OPERATOR",
    message: `Emergency camp ${camp.name} (${camp.id}) stood up by ${input.standUpBy} with ${input.beds} bed${
      input.beds === 1 ? "" : "s"
    }. It is now in the matching pool.`,
  });
  return camp;
}

/** Active cases routed to this facility, as primary or as the named backup. */
function casesRoutedTo(id: string): string[] {
  return listCases({ active: true })
    .filter((c) => c.hospitalId === id || c.backupHospitalId === id)
    .map((c) => c.id);
}

/**
 * Folds a camp. Refuses if anyone is still routed there: a facility cannot be made to vanish from
 * under a patient, and the 409 names the cases so the operator knows what to move first.
 *
 * Guarded twice over on `temporary`, because the one genuinely dangerous thing this file can do is
 * delete a real hospital from the city's capacity board mid-incident.
 */
export function standDownCamp(id: string, by: ActorRole): void {
  const facility = getHospital(id);
  if (facility.temporary !== true) {
    throw new ApiError(400, `${facility.name} is a standing facility, not a temporary camp, and cannot be stood down.`);
  }

  const routed = casesRoutedTo(id);
  if (routed.length > 0) {
    throw new ApiError(
      409,
      `${facility.name} still has ${routed.length} active case${routed.length === 1 ? "" : "s"} routed to it. Move them before standing it down.`,
      { caseIds: routed },
    );
  }

  removeHospital(id);
  addEvent({
    hospitalId: id,
    type: "RESOURCE_UPDATED",
    actorRole: by,
    message: `Emergency camp ${facility.name} (${id}) stood down and removed from the matching pool.`,
  });
}

export function listCamps(): Hospital[] {
  return listHospitals()
    .filter((h) => h.temporary === true)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- Siting the next camp ----------

export interface CampSiteSuggestion {
  lat: number;
  lng: number;
  nearestArea: string;
  patientsServed: number;
  averageEtaMinutes: number;
}

/** Name of the area whose nearest existing facility sits closest to a point. */
function nearestAreaTo(point: { lat: number; lng: number }): string | undefined {
  let best: Hospital | undefined;
  let bestKm = Infinity;
  for (const h of listHospitals()) {
    const km = haversineKm(point, h);
    if (km < bestKm) {
      bestKm = km;
      best = h;
    }
  }
  return best?.area;
}

/**
 * Where to put a camp for the patients nobody could place.
 *
 * The centroid minimises aggregate travel, which is a decision about a GROUP — the per-patient
 * matcher has no way to express it, since every patient alone would rather the camp were on top
 * of them. Empty list returns null rather than the origin: a point derived from no patients is
 * not a cautious answer, it is a wrong one.
 */
export function suggestCampSite(unplacedCaseIds: string[]): CampSiteSuggestion | null {
  const cases = unplacedCaseIds.map((id) => getCase(id));
  if (cases.length === 0) return null;

  const lat = cases.reduce((sum, c) => sum + c.lat, 0) / cases.length;
  const lng = cases.reduce((sum, c) => sum + c.lng, 0) / cases.length;
  const site = { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };

  const totalEta = cases.reduce((sum, c) => sum + etaMinutes(c, site), 0);
  return {
    ...site,
    nearestArea: nearestAreaTo(site) ?? "Nagpur",
    patientsServed: cases.length,
    averageEtaMinutes: Math.round(totalEta / cases.length),
  };
}

// ---------- Measuring the city ----------

export interface TierCapacity {
  tier: FacilityTier;
  facilities: number;
  icuFree: number;
  icuTotal: number;
  bedsFree: number;
  bedsTotal: number;
  utilisationPercent: number;
}

/**
 * Capacity per rung of the escalation ladder. Every tier is returned, including empty ones, so a
 * board can show "CAMP: 0 facilities" — the absence of camps is information during an overflow,
 * and a row that appears and disappears between polls is a board nobody can read.
 */
export function cityCapacity(): TierCapacity[] {
  const hospitals = listHospitals();
  return FACILITY_TIERS.map((tier) => {
    const inTier = hospitals.filter((h) => tierOf(h) === tier);
    const sum = (pick: (h: Hospital) => number) => inTier.reduce((total, h) => total + pick(h), 0);

    const icuFree = sum((h) => h.resources.ICU.available);
    const icuTotal = sum((h) => h.resources.ICU.total);
    const bedsFree = sum((h) => h.resources.EMERGENCY_BED.available);
    const bedsTotal = sum((h) => h.resources.EMERGENCY_BED.total);

    const capacity = icuTotal + bedsTotal;
    const occupied = capacity - (icuFree + bedsFree);
    return {
      tier,
      facilities: inTier.length,
      icuFree,
      icuTotal,
      bedsFree,
      bedsTotal,
      utilisationPercent: capacity === 0 ? 0 : Math.round((occupied / capacity) * 100),
    };
  });
}

export interface OverflowState {
  overflowing: boolean;
  reason: string;
  tertiaryUtilisation: number;
}

/**
 * Is the top of the ladder full?
 *
 * Two independent triggers, because a percentage hides the case that matters most: a city can sit
 * at 70% overall while every single ICU bed in every tertiary hospital is taken, and an ICU patient
 * does not care about the free general beds that number is averaging over.
 */
export function isOverflowing(): OverflowState {
  const tertiary = cityCapacity().find((t) => t.tier === "TERTIARY");
  const utilisation = tertiary?.utilisationPercent ?? 0;

  const tertiaryFacilities = listHospitals().filter((h) => tierOf(h) === "TERTIARY");
  const withFreeIcu = tertiaryFacilities.filter((h) => h.resources.ICU.available > 0);

  if (tertiaryFacilities.length === 0) {
    return { overflowing: true, reason: "No tertiary hospital is registered in the city.", tertiaryUtilisation: 0 };
  }
  if (withFreeIcu.length === 0) {
    return {
      overflowing: true,
      reason: `None of the ${tertiaryFacilities.length} tertiary hospitals has a free ICU bed; tertiary capacity is ${utilisation}% used.`,
      tertiaryUtilisation: utilisation,
    };
  }
  if (utilisation >= OVERFLOW_UTILISATION_PERCENT) {
    return {
      overflowing: true,
      reason: `Tertiary capacity is ${utilisation}% used across ${tertiaryFacilities.length} hospitals, with ${
        tertiary?.icuFree ?? 0
      } ICU beds and ${tertiary?.bedsFree ?? 0} emergency beds left.`,
      tertiaryUtilisation: utilisation,
    };
  }
  return {
    overflowing: false,
    reason: `Tertiary capacity is ${utilisation}% used, with free ICU beds at ${withFreeIcu.length} of ${tertiaryFacilities.length} hospitals.`,
    tertiaryUtilisation: utilisation,
  };
}
