/**
 * Hospital directory — the capacity board every screen reads from.
 *
 * Returns each hospital exactly as its coordinator last reported it, plus the two derived
 * facts no screen should have to guess at: how old that report is and whether it has gone
 * stale. This prototype coordinates, it does not sense: there is no live feed from any ward,
 * so the age of a number travels with the number and a dashboard can say "confirmed 4 minutes
 * ago" instead of implying a bed count is being measured right now.
 */
import { handle, json } from "@/lib/api";
import { STALE_AFTER_MINUTES } from "@/lib/services/overview";
import { expireReservations } from "@/lib/services/reservation";
import { listHospitals } from "@/lib/store";
import type { Hospital } from "@/lib/types";

/** A hospital as last reported, carrying the freshness facts needed to judge it. */
export interface HospitalWithFreshness extends Hospital {
  /** Whole minutes since a human last confirmed these numbers. */
  dataAgeMinutes: number;
  /** True once the report is older than STALE_AFTER_MINUTES: show it, but never as fact. */
  stale: boolean;
}

/** Stand-in age for an unparsable timestamp: treated as maximally old, never as fresh. */
const UNKNOWN_AGE_MINUTES = 99_999;

/**
 * Whole minutes since an ISO timestamp. A timestamp that cannot be parsed is reported as
 * maximally old rather than as "just now", because the failure mode of a wrong clock must be
 * "call and check", not "trust it".
 */
function ageInMinutes(iso: string, now: number): number {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return UNKNOWN_AGE_MINUTES;
  return Math.max(0, Math.round((now - at) / 60_000));
}

/** Attaches dataAgeMinutes and stale to a hospital without mutating the stored record. */
function withFreshness(hospital: Hospital, now: number): HospitalWithFreshness {
  const dataAgeMinutes = ageInMinutes(hospital.lastUpdatedAt, now);
  return { ...hospital, dataAgeMinutes, stale: dataAgeMinutes > STALE_AFTER_MINUTES };
}

/**
 * GET /api/hospitals — every hospital with its reported capacity and the age of that report.
 *
 * Sweeps lapsed reservations first so a bed held by a case that never arrived is shown as
 * free again; otherwise the board would hide capacity that the ward actually has. Sorted by
 * name so a polling dashboard never reshuffles between two identical reads.
 */
export function GET(): Promise<Response> {
  return handle(() => {
    const now = Date.now();
    expireReservations(now);
    const hospitals = listHospitals()
      .map((hospital) => withFreshness(hospital, now))
      .sort((a, b) => a.name.localeCompare(b.name));
    return json({ hospitals });
  });
}
