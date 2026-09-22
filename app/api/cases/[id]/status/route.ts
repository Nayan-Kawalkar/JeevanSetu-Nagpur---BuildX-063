/**
 * Case lifecycle transitions — the "on the move", "arrived", "handed over" buttons.
 *
 * The state machine and everything it implies (ambulance status, held beds released or
 * consumed, one readable timeline entry) lives in the case service. This route only names the
 * action and the human behind it, then hands over. A route handler must never be able to
 * invent a transition, because a transition here moves a real ambulance.
 *
 * An illegal step is the service's ApiError 409 and reaches the client with its sentence
 * intact — "this case is CREATED, and this step is only possible from ACCEPTED" tells a crew
 * what to do next; a 500 tells them the software broke.
 *
 * The refreshed timeline travels back with the case so the screen that pressed the button
 * shows the consequence immediately, without a second request from a moving vehicle.
 */
import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { CASE_ROLES, auditGuardedMutation, effectiveActorRole, requireRole } from "@/lib/auth";
import { advanceStatus, type CaseAction } from "@/lib/services/cases";
import { listEvents } from "@/lib/store";
import { USER_ROLES, type EventType } from "@/lib/types";

/** How much of the case timeline comes back with a transition. */
const TIMELINE_LIMIT = 50;

/**
 * Every action the case service accepts, written out so `satisfies` breaks the build if the
 * service ever gains, drops or renames one. A transition that exists in the engine but is
 * silently unreachable over the API is a step a crew cannot take.
 */
const CASE_ACTIONS = {
  START_JOURNEY: "START_JOURNEY",
  ARRIVED: "ARRIVED",
  COMPLETE_HANDOVER: "COMPLETE_HANDOVER",
  CLOSE: "CLOSE",
  CANCEL: "CANCEL",
} as const satisfies Record<CaseAction, CaseAction>;

/**
 * The timeline type each transition's authorisation line is filed under. The event vocabulary is a
 * fixed contract with no generic AUDIT type, so the audit borrows the type of the move it allowed
 * and says in words that it is an authorisation.
 */
const ACTION_EVENT: Record<CaseAction, EventType> = {
  START_JOURNEY: "AMBULANCE_EN_ROUTE",
  ARRIVED: "ARRIVED",
  COMPLETE_HANDOVER: "HANDOVER_COMPLETED",
  CLOSE: "CASE_CLOSED",
  CANCEL: "CASE_CANCELLED",
};

const StatusSchema = z.object({
  action: z.enum(CASE_ACTIONS),
  /**
   * Transitions are pressed on scene far more often than anywhere else, so the crew is the
   * default author. Any other role has to say so, because the timeline names whoever acted.
   */
  actorRole: z.enum(USER_ROLES).default("PARAMEDIC"),
});

/**
 * Guarded to the crew, the control room and admin, and the role written on the timeline is the
 * server's, not the one in the body, whenever a role has actually been chosen.
 *
 * POST /api/cases/:id/status — advance one case through the lifecycle and return the case
 * with its refreshed timeline. 404 if the case is unknown, 400 on an unrecognised action,
 * 409 (service message preserved) when the step is not legal from the current status.
 */
export async function POST(request: Request, context: RouteContext<"/api/cases/[id]/status">): Promise<Response> {
  return handle(async () => {
    const { id } = await context.params;
    const session = await requireRole(...CASE_ROLES);
    const { action, actorRole } = await parseBody(request, StatusSchema);
    const updatedCase = advanceStatus(id, action, effectiveActorRole(session, actorRole));
    auditGuardedMutation(session, {
      type: ACTION_EVENT[action],
      caseId: id,
      action: `moved case ${id} with ${action}`,
    });
    return json({ case: updatedCase, events: listEvents({ caseId: id, limit: TIMELINE_LIMIT }) });
  });
}
