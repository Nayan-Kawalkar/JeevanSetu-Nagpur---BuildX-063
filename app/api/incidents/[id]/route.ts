/**
 * One mass-casualty incident: read it, add casualties to it, close it.
 *
 * The GET returns the incident together with its cases, because the surge board needs the triage
 * counts and the case list in one consistent snapshot — two polls racing each other would show a
 * board that does not add up.
 *
 * Coordination and decision support only: nothing here diagnoses, prescribes or promises.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { CASE_ROLES, effectiveActorRole, requireRole } from "@/lib/auth";
import { MAX_GENERATED_CASUALTIES, closeIncident, generateCasualties } from "@/lib/services/surge";
import { db, getIncident } from "@/lib/store";
import type { EmergencyCase } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * `count` is capped hard. Eighty is the demo number; two hundred is the ceiling, because a judge
 * watching a machine grind through a typo'd twenty thousand is a lost pitch.
 */
const IncidentActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("GENERATE"), count: z.number().int().min(1).max(MAX_GENERATED_CASUALTIES) }),
  z.object({ action: z.literal("CLOSE") }),
]);

/** GET /api/incidents/:id — the incident plus every case logged against it. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/incidents/[id]">): Promise<Response> {
  return handle(async () => {
    const { id } = await ctx.params;
    const incident = getIncident(id);
    const cases = incident.caseIds
      .map((caseId) => db().cases[caseId])
      .filter((c): c is EmergencyCase => Boolean(c));
    return json({ incident, cases });
  });
}

/**
 * POST /api/incidents/:id — `{ action: "GENERATE", count }` logs casualties against the incident,
 * `{ action: "CLOSE" }` closes it out.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/incidents/[id]">): Promise<Response> {
  return handle(async () => {
    const session = await requireRole(...CASE_ROLES);
    const { id } = await ctx.params;
    const input = await parseBody(request, IncidentActionSchema);

    if (input.action === "CLOSE") {
      const incident = closeIncident(id, effectiveActorRole(session, "CONTROL_ROOM_OPERATOR"));
      return json({ incident });
    }

    const cases = generateCasualties(id, input.count);
    return json({ incident: getIncident(id), created: cases.length, cases }, 201);
  });
}
