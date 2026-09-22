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
import { advanceStatus, type CaseAction } from "@/lib/services/cases";
import { listEvents } from "@/lib/store";
import { USER_ROLES } from "@/lib/types";

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

const StatusSchema = z.object({
  action: z.enum(CASE_ACTIONS),
  /**
   * Transitions are pressed on scene far more often than anywhere else, so the crew is the
   * default author. Any other role has to say so, because the timeline names whoever acted.
   */
  actorRole: z.enum(USER_ROLES).default("PARAMEDIC"),
});

/**
 * POST /api/cases/:id/status — advance one case through the lifecycle and return the case
 * with its refreshed timeline. 404 if the case is unknown, 400 on an unrecognised action,
 * 409 (service message preserved) when the step is not legal from the current status.
 */
export async function POST(request: Request, context: RouteContext<"/api/cases/[id]/status">): Promise<Response> {
  return handle(async () => {
    const { id } = await context.params;
    const { action, actorRole } = await parseBody(request, StatusSchema);
    const updatedCase = advanceStatus(id, action, actorRole);
    return json({ case: updatedCase, events: listEvents({ caseId: id, limit: TIMELINE_LIMIT }) });
  });
}
