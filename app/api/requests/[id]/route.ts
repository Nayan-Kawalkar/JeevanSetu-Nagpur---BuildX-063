/**
 * Answering one hospital request: Accept or Reject.
 *
 * This is the hinge of the whole coordination flow — an ambulance starts moving on the strength
 * of an Accept — so the handler stays thin and every rule lives in respondToRequest().
 *
 * Coordination only: nothing here diagnoses or prescribes, and no clinical judgement is implied
 * by either answer. A human coordinator decides; this records what they decided.
 */
import { handle, json, parseBody } from "@/lib/api";
import { auditGuardedMutation, requireHospital } from "@/lib/auth";
import { respondToRequest } from "@/lib/services/cases";
import { activeReservations } from "@/lib/services/reservation";
import { getRequest } from "@/lib/store";
import { RespondRequestSchema } from "@/lib/validation";

/**
 * PATCH /api/requests/:id — record a hospital's answer.
 *
 * On Accept the resources are held before the answer is written, so an accept whose reservation
 * failed is a real failure, not a warning: the request is still PENDING and the case is
 * untouched. That case is returned as 409 with the shortfall sentence the reservation service
 * produced ("2 units of O- short", not "error"), because the coordinator's next move — free a
 * bed, call the blood bank, or pass the case on — depends on knowing exactly what was missing.
 *
 * Only the hospital that was asked may answer. The request names that hospital, so the guard reads
 * the id off the stored request rather than off the body: a coordinator elsewhere accepting a
 * patient into someone else's beds is exactly the mistake this route must make impossible.
 *
 * On success the active holds are returned alongside, so the UI can show what is now being kept
 * for this patient without a second round trip.
 */
export async function PATCH(request: Request, context: RouteContext<"/api/requests/[id]">): Promise<Response> {
  return handle(async () => {
    const { id } = await context.params;
    const asked = getRequest(id);
    const session = await requireHospital(asked.hospitalId);
    const input = await parseBody(request, RespondRequestSchema);
    const outcome = respondToRequest(id, input);

    if (outcome.reservationError) {
      return json({ error: outcome.reservationError, request: outcome.request, case: outcome.case }, 409);
    }

    auditGuardedMutation(session, {
      type: input.action === "ACCEPT" ? "HOSPITAL_ACCEPTED" : "HOSPITAL_REJECTED",
      caseId: outcome.case.id,
      hospitalId: asked.hospitalId,
      action: `answered request ${asked.id} with ${input.action}`,
    });

    return json({
      request: outcome.request,
      case: outcome.case,
      reservations: activeReservations(outcome.case.id),
    });
  });
}
