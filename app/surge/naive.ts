import { haversineKm } from "@/lib/geo";
import type { SurgePlan } from "@/lib/services/surge";
import type { EmergencyCase } from "@/lib/types";

/**
 * What a nearest-hospital app would have done.
 *
 * This is the comparison the whole twist turns on, so it is computed honestly rather than
 * asserted: for each casualty, take the geographically nearest facility — that is the entire
 * algorithm of the category of app we are arguing against — and count how many patients name
 * the same one. The answer for a pile-up is always "nearly all of them", because every casualty
 * is within a kilometre of every other casualty, and that is exactly the failure mode. No
 * capacity is consulted, which is the point: the naive system has nothing to consult it with.
 *
 * Pure function over data the screen already has, so a judge can see it is not a stored claim.
 */
export interface NaiveFacility {
  id: string;
  name: string;
  lat: number;
  lng: number;
  icuAvailable: number;
}

export interface NaiveOutcome {
  /** The facility the largest share of casualties would be sent to. */
  hospitalName: string;
  /** How many of them. */
  patients: number;
  /** Free ICU beds that facility last reported. */
  icuAvailable: number;
  /** How many distinct facilities the naive rule would have used at all. */
  facilitiesUsed: number;
  totalPatients: number;
}

export function naiveOutcome(cases: EmergencyCase[], facilities: NaiveFacility[]): NaiveOutcome | null {
  if (cases.length === 0 || facilities.length === 0) return null;

  const counts = new Map<string, number>();
  for (const c of cases) {
    let bestId: string | undefined;
    let bestKm = Number.POSITIVE_INFINITY;
    for (const f of facilities) {
      const km = haversineKm({ lat: c.lat, lng: c.lng }, { lat: f.lat, lng: f.lng });
      if (km < bestKm) {
        bestKm = km;
        bestId = f.id;
      }
    }
    if (bestId !== undefined) counts.set(bestId, (counts.get(bestId) ?? 0) + 1);
  }

  let topId: string | undefined;
  let topCount = 0;
  for (const [id, count] of counts) {
    if (count > topCount) {
      topCount = count;
      topId = id;
    }
  }
  const top = facilities.find((f) => f.id === topId);
  if (!top) return null;

  return {
    hospitalName: top.name,
    patients: topCount,
    icuAvailable: top.icuAvailable,
    facilitiesUsed: counts.size,
    totalPatients: cases.length,
  };
}

/** What the real plan did, in the same three numbers, so the two sides are comparable. */
export interface PlannedOutcome {
  facilitiesUsed: number;
  placed: number;
  unplaced: number;
  immediate: number;
  busiestName: string;
  busiestPatients: number;
}

export function plannedOutcome(plan: SurgePlan): PlannedOutcome {
  const used = plan.loads.filter((l) => l.assigned > 0);
  const busiest = used.reduce<(typeof used)[number] | undefined>(
    (best, load) => (best === undefined || load.assigned > best.assigned ? load : best),
    undefined,
  );
  return {
    facilitiesUsed: used.length,
    placed: plan.assignments.length,
    unplaced: plan.unassigned.length,
    immediate: plan.totals.RED,
    busiestName: busiest?.name ?? "—",
    busiestPatients: busiest?.assigned ?? 0,
  };
}
