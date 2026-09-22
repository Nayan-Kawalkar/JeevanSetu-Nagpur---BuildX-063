/**
 * One blood bank — the endpoint behind the blood bank operator's screen.
 *
 * GET is the same record the directory returns, fetched on its own so a single bank's page
 * can poll cheaply. PATCH is an operator confirming what is actually in the refrigerator.
 *
 * Two floors protect the numbers. Stock can never go negative, and it can never be set below
 * the units this bank has already promised to a case: those units are held for an ambulance
 * that may already be moving, so they are released through the reservation service (by
 * rejecting or re-routing the case), never made to vanish by retyping a count. Whenever a
 * floor changes what the operator typed, the response says so instead of silently overruling.
 *
 * Coordination only: these are reported figures, stamped with who reported them and when.
 */
import { handle, json, parseBody } from "@/lib/api";
import { auditGuardedMutation, effectiveActorRole, requireBloodBank } from "@/lib/auth";
import { LOW_BLOOD_UNITS, STALE_AFTER_MINUTES } from "@/lib/services/overview";
import { expireReservations } from "@/lib/services/reservation";
import { addEvent, getBloodBank, nowIso } from "@/lib/store";
import { BLOOD_GROUPS, BLOOD_GROUP_LABEL, type BloodBank, type BloodGroup } from "@/lib/types";
import { UpdateBloodBankSchema } from "@/lib/validation";

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
 * GET /api/bloodbanks/:id — one bank with its inventory and the age of that inventory.
 *
 * Sweeps lapsed reservations first so units held for a case that never arrived show as
 * available again rather than sitting invisibly in `reserved`.
 */
export function GET(_request: Request, context: RouteContext<"/api/bloodbanks/[id]">): Promise<Response> {
  return handle(async () => {
    const { id } = await context.params;
    const bank = getBloodBank(id);
    const now = Date.now();
    expireReservations(now);
    return json({ bloodBank: withFreshness(bank, now) });
  });
}

/**
 * PATCH /api/bloodbanks/:id — an operator confirming the units on the shelf.
 *
 * Only the groups present in the body are touched, so a form that shows one group cannot
 * blank the other seven. Each new count is floored at the units already reserved for a case
 * and at zero; anything the floors changed comes back in `notes` so the operator sees that
 * their number was adjusted and why.
 *
 * Guarded by requireBloodBank: an operator signed in at one bank cannot retype another bank's
 * shelf. Control room and admin pass. With no role chosen the permissive demo session applies —
 * see lib/auth.ts.
 *
 * Stamped HIGH confidence because a human has just counted — that is the freshest source this
 * system has, and the matching score is meant to reward it.
 */
export function PATCH(request: Request, context: RouteContext<"/api/bloodbanks/[id]">): Promise<Response> {
  return handle(async () => {
    const { id } = await context.params;
    const session = await requireBloodBank(id);
    const bank = getBloodBank(id);
    const patch = await parseBody(request, UpdateBloodBankSchema);

    const changes: string[] = [];
    const notes: string[] = [];

    for (const group of BLOOD_GROUPS) {
      const entry = patch.inventory[group];
      if (!entry) continue;

      const stock = bank.inventory[group];
      const label = BLOOD_GROUP_LABEL[group];
      const requested = Math.max(0, entry.available);
      const available = Math.max(stock.reserved, requested);
      if (available !== requested) {
        notes.push(
          `${label}: ${requested} could not be recorded because ${stock.reserved} ${
            stock.reserved === 1 ? "unit is" : "units are"
          } already held for a case; ${available} recorded instead. Release the hold on the case to go lower.`,
        );
      }

      stock.available = available;
      changes.push(`${label} ${available} ${available === 1 ? "unit" : "units"}`);
    }

    bank.lastUpdatedAt = nowIso();
    bank.updatedBy = patch.updatedBy;
    bank.confidenceLevel = "HIGH";

    // An empty inventory patch is still a confirmation: the shelf was looked at and stands.
    const summary = changes.length > 0 ? changes.join(", ") : "no change to the counts already recorded";
    addEvent({
      bloodBankId: bank.id,
      type: "BLOOD_STOCK_UPDATED",
      // Server-decided author. With no role chosen the timeline keeps saying "blood bank".
      actorRole: effectiveActorRole(session, "BLOOD_BANK_OPERATOR"),
      message: `${bank.name} stock confirmed by ${patch.updatedBy}: ${summary}.${
        notes.length > 0 ? ` ${notes.join(" ")}` : ""
      }`,
    });

    auditGuardedMutation(session, {
      type: "BLOOD_STOCK_UPDATED",
      bloodBankId: bank.id,
      action: `updated stock at ${bank.name}`,
    });

    return json({ bloodBank: withFreshness(bank, Date.now()), notes });
  });
}
