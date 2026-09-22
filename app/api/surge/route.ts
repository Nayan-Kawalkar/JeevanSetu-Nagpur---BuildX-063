/**
 * GET /api/surge — a PREVIEW allocation. Reads everything, writes nothing.
 *
 * This is the endpoint the surge board polls while the control-room lead argues with the plan.
 * Applying it is a separate, deliberate POST to /api/surge/allocate, because a plan that commits
 * itself the moment someone opens a screen is not decision support, it is an autopilot.
 *
 * Coordination and decision support only: nothing here diagnoses, prescribes or promises, and
 * every assignment in the response carries the reason it was made.
 */
import type { NextRequest } from "next/server";
import { ApiError, handle, json } from "@/lib/api";
import { planSurge, surgeCaseIds } from "@/lib/services/surge";
import { getIncident } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * `incidentId` scopes the plan to one incident. Without it the plan covers every active case
 * already tagged to some incident, which is what the district-wide view wants.
 */
export async function GET(request: NextRequest): Promise<Response> {
  return handle(() => {
    const incidentId = request.nextUrl.searchParams.get("incidentId") ?? undefined;
    if (incidentId !== undefined && incidentId.trim() === "") {
      throw new ApiError(400, 'Query parameter "incidentId" cannot be blank.');
    }
    // Throws 404 for an unknown id rather than quietly planning the whole district instead.
    const incident = incidentId ? getIncident(incidentId) : undefined;

    const plan = planSurge(surgeCaseIds(incidentId));
    return json({ plan: { ...plan, incidentId: incident?.id ?? plan.incidentId }, incident });
  });
}
