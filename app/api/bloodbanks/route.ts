/**
 * Blood bank directory — what each bank last reported it is holding.
 *
 * Every bank carries the age of its own figures and the groups it is running short of, so a
 * paramedic or a control-room operator can see at a glance both "who has O-" and "and when
 * did anyone last check". No feed from any refrigerator exists in this prototype: these are
 * numbers people typed, presented as such.
 */
import { handle, json } from "@/lib/api";
import { LOW_BLOOD_UNITS, STALE_AFTER_MINUTES } from "@/lib/services/overview";
import { expireReservations } from "@/lib/services/reservation";
import { listBloodBanks } from "@/lib/store";
import { BLOOD_GROUPS, type BloodBank, type BloodGroup } from "@/lib/types";

/** A blood bank as last reported, with the freshness and shortage facts a caller needs. */
export interface BloodBankWithFreshness extends BloodBank {
  /** Whole minutes since an operator last confirmed this stock. */
  dataAgeMinutes: number;
  /** True once the report is older than STALE_AFTER_MINUTES: call before promising units. */
  stale: boolean;
  /** Groups at or below LOW_BLOOD_UNITS units available at this bank. */
  lowGroups: BloodGroup[];
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

/** Attaches dataAgeMinutes, stale and lowGroups without mutating the stored record. */
function withFreshness(bank: BloodBank, now: number): BloodBankWithFreshness {
  const dataAgeMinutes = ageInMinutes(bank.lastUpdatedAt, now);
  return {
    ...bank,
    dataAgeMinutes,
    stale: dataAgeMinutes > STALE_AFTER_MINUTES,
    lowGroups: BLOOD_GROUPS.filter((group) => bank.inventory[group].available <= LOW_BLOOD_UNITS),
  };
}

/**
 * GET /api/bloodbanks — every bank, its inventory, the age of that inventory and its low groups.
 *
 * Sweeps lapsed reservations first so units held for a case that never arrived are shown as
 * available again instead of sitting invisibly in `reserved`. Sorted by name so a polling
 * dashboard never reshuffles between two identical reads.
 */
export function GET(): Promise<Response> {
  return handle(() => {
    const now = Date.now();
    expireReservations(now);
    const bloodBanks = listBloodBanks()
      .map((bank) => withFreshness(bank, now))
      .sort((a, b) => a.name.localeCompare(b.name));
    return json({ bloodBanks });
  });
}
