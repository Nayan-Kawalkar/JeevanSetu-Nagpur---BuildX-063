/**
 * Hospital matching for one case.
 *
 * POST asks the engine to decide now and records that decision; GET recomputes the same ranking
 * on the same live figures but records nothing. A paramedic who pulls to refresh on the roadside
 * must be looking at the beds that exist at that moment, not at a ranking frozen when the case
 * was opened — a bed counted five minutes ago may already have someone in it — but a refresh is
 * not a decision and must not appear in the case history as one.
 *
 * Both answers carry the hospital records the ranking names, because the ranking itself holds
 * only ids and the crew needs a name, an area and a phone number. On a weak mobile link the
 * second request is the one that fails, so there is no second request.
 *
 * Coordination and decision support only. The ranking is a recommendation that always states
 * its reason; it is never a clinical judgement and never an instruction.
 */
import { handle, json } from "@/lib/api";
import { matchCase, previewMatch } from "@/lib/services/cases";
import { listHospitals } from "@/lib/store";
import type { Hospital, MatchResult } from "@/lib/types";

interface MatchResponse {
  match: MatchResult;
  /** Every hospital named by the ranking, keyed by id, so the client needs no follow-up call. */
  hospitals: Record<string, Hospital>;
}

/**
 * Collects the hospital records a ranking refers to, keyed by id.
 * Missing ids are skipped rather than thrown on: a hospital vanishing from the store between
 * ranking and lookup is a reason to show a slightly thinner list, not to deny the crew the
 * whole ranking mid-emergency.
 */
function hospitalsFor(match: MatchResult): Record<string, Hospital> {
  const byId = new Map(listHospitals().map((hospital) => [hospital.id, hospital]));
  const wanted = [
    ...match.ranked.map((ranked) => ranked.hospitalId),
    ...(match.primaryHospitalId ? [match.primaryHospitalId] : []),
    ...(match.backupHospitalId ? [match.backupHospitalId] : []),
  ];

  const hospitals: Record<string, Hospital> = {};
  for (const id of wanted) {
    const hospital = byId.get(id);
    if (hospital) hospitals[id] = hospital;
  }
  return hospitals;
}

/**
 * Packages a ranking with the hospitals it names.
 * One helper for both verbs so a GET can never drift into showing a different shape — or
 * staler numbers — than the POST the crew acted on.
 */
function matchResponse(match: MatchResult): MatchResponse {
  return { match, hospitals: hospitalsFor(match) };
}

/**
 * POST /api/cases/:id/match — rank the hospitals for this case and record the decision.
 * Returns 404 if the case is unknown and 409 (from the case service, message intact) if the
 * case is already closed or cancelled and there is nothing left to match.
 */
export async function POST(_request: Request, context: RouteContext<"/api/cases/[id]/match">): Promise<Response> {
  return handle(async () => {
    const { id } = await context.params;
    return json(matchResponse(matchCase(id)));
  });
}

/**
 * GET /api/cases/:id/match — the same shape, recomputed live on every read.
 * Deliberately not a cached snapshot: refreshing is how a paramedic checks whether the bed they
 * were promised is still free. It goes through `previewMatch`, which recomputes on the current
 * bed counts but records nothing, so a screen polling every three seconds cannot fill the case
 * timeline with matching events nobody asked for or keep marking the case as just updated.
 */
export async function GET(_request: Request, context: RouteContext<"/api/cases/[id]/match">): Promise<Response> {
  return handle(async () => {
    const { id } = await context.params;
    return json(matchResponse(previewMatch(id)));
  });
}
