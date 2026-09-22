/**
 * The hospital request queue.
 *
 * A "request" is one case offered to one hospital with a clock on it. This route is what a
 * hospital coordinator's screen polls (the queue they must answer) and what a paramedic posts
 * to when they pick a hospital off the ranked list.
 *
 * Coordination only: nothing here diagnoses, prescribes or invents patient data. It moves a
 * request between people and reports exactly what the store holds.
 */
import { ApiError, handle, json, parseBody } from "@/lib/api";
import { CASE_ROLES, auditGuardedMutation, requireRole } from "@/lib/auth";
import { requestHospital } from "@/lib/services/cases";
import { db, expirePendingRequests, listRequests } from "@/lib/store";
import { REQUEST_STATUSES, type EmergencyCase, type HospitalRequest, type RequestStatus } from "@/lib/types";
import { CreateRequestSchema } from "@/lib/validation";

/** A blank or missing query param means "no filter"; anything else must be a real value. */
function optionalParam(raw: string | null): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Turns the `status` query param into a RequestStatus, rejecting anything unknown with a 400.
 *
 * A typo must not silently return the whole queue: a coordinator filtering for PENDING and
 * quietly being shown accepted and expired rows would mean answering the wrong request.
 */
function parseStatus(raw: string | null): RequestStatus | undefined {
  const value = optionalParam(raw);
  if (!value) return undefined;
  const match = REQUEST_STATUSES.find((s) => s === value.toUpperCase());
  if (!match) {
    throw new ApiError(400, `Unknown request status "${value}". Expected one of: ${REQUEST_STATUSES.join(", ")}.`);
  }
  return match;
}

/**
 * Queue order: unanswered first, then newest first.
 *
 * PENDING rows are the only ones anybody can still act on, so they sit at the top however old
 * the answered rows below them are. The id tiebreak keeps the order stable between polls when
 * two requests share a timestamp, so a row never swaps places under a coordinator's thumb.
 */
function queueOrder(a: HospitalRequest, b: HospitalRequest): number {
  const pendingFirst = Number(b.status === "PENDING") - Number(a.status === "PENDING");
  if (pendingFirst !== 0) return pendingFirst;
  const newestFirst = b.createdAt.localeCompare(a.createdAt);
  return newestFirst !== 0 ? newestFirst : b.id.localeCompare(a.id);
}

/**
 * GET /api/requests?caseId=&hospitalId=&status= — the queue plus every case it refers to.
 *
 * The cases map is bundled in deliberately: a hospital dashboard has to show who is coming
 * (severity, requirements, blood group, ETA) next to the Accept button, and a second round trip
 * per row would make that summary lag behind the 3 s poll it is rendered in.
 *
 * Expired requests are swept before reading, so a coordinator is never shown an Accept button
 * for a request whose clock ran out while the tab sat idle.
 */
export async function GET(request: Request): Promise<Response> {
  return handle(() => {
    expirePendingRequests();

    const params = new URL(request.url).searchParams;
    const requests = listRequests({
      caseId: optionalParam(params.get("caseId")),
      hospitalId: optionalParam(params.get("hospitalId")),
      status: parseStatus(params.get("status")),
    }).sort(queueOrder);

    const cases: Record<string, EmergencyCase> = {};
    for (const r of requests) {
      if (cases[r.caseId]) continue;
      // Read through the store map rather than getCase(): one dangling reference should leave a
      // gap in the map, not fail the whole queue a coordinator is waiting on.
      const found = db().cases[r.caseId];
      if (found) cases[r.caseId] = found;
    }

    return json({ requests, cases });
  });
}

/**
 * POST /api/requests — offer one case to one hospital and start its answer clock.
 *
 * Offering a case is the crew's move, so only a paramedic, the control room or an admin may post
 * here: a hospital coordinator must not be able to invite a patient to their own beds, and a blood
 * bank has no business in this queue at all.
 *
 * The rest of the guarding lives in requestHospital(): the idempotency key that stops a double tap
 * creating two requests, the one-pending-request-per-case rule, and the refusal (422) to offer
 * a critical patient to a hospital that cannot currently supply what the case needs.
 */
export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const session = await requireRole(...CASE_ROLES);
    const input = await parseBody(request, CreateRequestSchema);
    const created = requestHospital(input);
    auditGuardedMutation(session, {
      type: "HOSPITAL_REQUESTED",
      caseId: created.caseId,
      hospitalId: created.hospitalId,
      action: `offered case ${created.caseId} to a hospital`,
    });
    return json({ request: created }, 201);
  });
}
