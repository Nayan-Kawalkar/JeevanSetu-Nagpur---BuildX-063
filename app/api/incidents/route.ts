/**
 * Mass-casualty incident collection.
 *
 * Declaring an incident is the moment the system stops thinking about one patient at a time.
 * Everything downstream — the surge allocator, the camps ladder — keys off the incident this
 * route creates. Transport only; the rules live in `lib/services/surge`.
 *
 * Coordination and decision support only: nothing here diagnoses, prescribes or promises.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { CASE_ROLES, requireRole } from "@/lib/auth";
import { declareIncident } from "@/lib/services/surge";
import { listIncidents } from "@/lib/store";

/** In-memory store: a prerendered incident list would be a picture of a moving event. */
export const dynamic = "force-dynamic";

/** Nagpur and its ring road, generously bounded — a typo'd coordinate is a bug, not a location. */
const DeclareIncidentSchema = z.object({
  label: z.string().min(3).max(120),
  lat: z.number().min(20).max(22),
  lng: z.number().min(78).max(80),
});

/** GET /api/incidents — newest first. `open=true` hides incidents already closed out. */
export async function GET(request: NextRequest): Promise<Response> {
  return handle(() => {
    const openOnly = request.nextUrl.searchParams.get("open") === "true";
    return json({ incidents: listIncidents(openOnly) });
  });
}

/** POST /api/incidents — the control room declares a mass-casualty incident. */
export async function POST(request: NextRequest): Promise<Response> {
  return handle(async () => {
    const session = await requireRole(...CASE_ROLES);
    const input = await parseBody(request, DeclareIncidentSchema);
    const incident = declareIncident({
      label: input.label,
      lat: input.lat,
      lng: input.lng,
      declaredBy: session.name,
    });
    return json({ incident }, 201);
  });
}
