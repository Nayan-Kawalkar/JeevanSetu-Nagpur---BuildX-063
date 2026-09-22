/**
 * POST /api/surge/allocate — commits a surge plan a human has looked at.
 *
 * The client does NOT post the plan back. It posts the scope, and the server recomputes the plan
 * against the capacity that exists at this instant and applies that. A plan is a statement about
 * beds, beds move, and replaying a five-minute-old plan would hand out beds that were taken while
 * the operator was reading. The recomputed plan is returned so the screen can show exactly what
 * was committed rather than what was previewed.
 *
 * Coordination and decision support only: a person presses this, nothing here diagnoses,
 * prescribes or promises, and every assignment states its reason.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { CASE_ROLES, effectiveActorRole, requireRole } from "@/lib/auth";
import { applySurge, planSurge, surgeCaseIds } from "@/lib/services/surge";
import { getIncident } from "@/lib/store";

export const dynamic = "force-dynamic";

const AllocateSchema = z.object({
  incidentId: z.string().min(1).optional(),
  /** An explicit subset, when the lead wants to release only part of the board. */
  caseIds: z.array(z.string().min(1)).max(500).optional(),
});

export async function POST(request: NextRequest): Promise<Response> {
  return handle(async () => {
    const session = await requireRole(...CASE_ROLES);
    const input = await parseBody(request, AllocateSchema);
    if (input.incidentId) getIncident(input.incidentId); // 404 on an unknown incident.

    const caseIds = input.caseIds ?? surgeCaseIds(input.incidentId);
    const plan = planSurge(caseIds);
    const result = applySurge(plan, effectiveActorRole(session, "CONTROL_ROOM_OPERATOR"));

    return json({ plan, applied: result.applied, failed: result.failed });
  });
}
