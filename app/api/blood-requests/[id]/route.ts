/**
 * Answering one blood request: Reserve, Reject, Fulfil or Release.
 *
 * The handler stays thin; every rule lives in the bloodRequests service, so a route can never
 * invent a transition or move stock on its own.
 *
 * A failed reserve is a real failure, not a warning. It comes back as 409 carrying the
 * service's own sentence — "Cannot reserve: only 1 of 2 units of O− on the shelf." — because
 * the coordinator's next move depends on knowing exactly how short the bank is, and nothing at
 * all has been changed.
 *
 * Coordination only: nothing here diagnoses, prescribes, or guarantees availability.
 */
import { z } from "zod";
import { ApiError, handle, json, parseBody } from "@/lib/api";
import { auditGuardedMutation, requireBloodBank } from "@/lib/auth";
import {
  fulfilBloodRequest,
  releaseBloodRequest,
  respondToBloodRequest,
} from "@/lib/services/bloodRequests";
import { getBloodBank, getBloodRequest } from "@/lib/store";
import type { EventType } from "@/lib/types";

const RespondBloodRequestSchema = z.object({
  action: z.enum(["RESERVE", "REJECT", "FULFIL", "RELEASE"]),
  reason: z.string().trim().max(200).optional(),
  by: z.string().trim().min(1).max(60).default("Blood bank operator"),
});

type RespondAction = z.infer<typeof RespondBloodRequestSchema>["action"];

/**
 * The timeline type each answer belongs beside. The event vocabulary in lib/types.ts is a fixed
 * contract with no generic AUDIT member, so an audit line borrows the domain type of the thing
 * it authorised and spells the authorisation out in its message.
 */
const AUDIT_EVENT: Record<RespondAction, EventType> = {
  RESERVE: "BLOOD_RESERVED",
  REJECT: "BLOOD_REQUEST_REJECTED",
  FULFIL: "BLOOD_FULFILLED",
  RELEASE: "BLOOD_RELEASED",
};

/**
 * PATCH /api/blood-requests/:id — record the bank's answer, or close out a hold.
 *
 * The bank is returned alongside every success so the console's stock grid moves in the same
 * paint as the row it just answered, rather than one poll later.
 *
 * Only the bank that was asked may answer. The stored request names that bank, so the guard
 * reads the id off it rather than off the body — an operator standing at one shelf must not be
 * able to promise units from another, and must not be able to release a hold someone else's
 * theatre is counting on. Control room and admin pass; an unauthenticated demo caller rides the
 * permissive fallback.
 */
export async function PATCH(request: Request, context: RouteContext<"/api/blood-requests/[id]">): Promise<Response> {
  return handle(async () => {
    const { id } = await context.params;
    const asked = getBloodRequest(id);
    const session = await requireBloodBank(asked.bloodBankId);
    const input = await parseBody(request, RespondBloodRequestSchema);

    // Written before the branches so every path that mutates leaves the same line, and none of
    // them can be extended later without one.
    const audit = (): void =>
      auditGuardedMutation(session, {
        type: AUDIT_EVENT[input.action],
        caseId: asked.caseId,
        hospitalId: asked.hospitalId,
        bloodBankId: asked.bloodBankId,
        action: `answered blood request ${asked.id} with ${input.action}`,
      });

    if (input.action === "FULFIL") {
      const answered = fulfilBloodRequest(id, input.by);
      audit();
      return json({ request: answered, bloodBank: getBloodBank(answered.bloodBankId) });
    }

    if (input.action === "RELEASE") {
      const reason = input.reason ?? `released by ${input.by}`;
      const answered = releaseBloodRequest(id, reason);
      audit();
      return json({ request: answered, bloodBank: getBloodBank(answered.bloodBankId) });
    }

    if (input.action === "REJECT" && (input.reason === undefined || input.reason === "")) {
      throw new ApiError(400, "Say why the units cannot be supplied, so the hospital can try elsewhere.");
    }

    const outcome = respondToBloodRequest(id, {
      action: input.action,
      reason: input.reason,
      respondedBy: input.by,
    });

    if (outcome.error) {
      // Nothing moved, so nothing is recorded as authorised.
      return json({ error: outcome.error, request: outcome.request }, 409);
    }

    audit();
    return json({ request: outcome.request, bloodBank: getBloodBank(outcome.request.bloodBankId) });
  });
}
