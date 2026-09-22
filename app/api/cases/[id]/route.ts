/**
 * Single-case endpoint: everything one screen needs about one patient, in one response.
 *
 * The case detail view has to answer "where is this patient going, who is carrying them, who has
 * been asked, and what happened so far" without four polls racing each other into an inconsistent
 * picture. So the timeline, the hospital requests and the referenced hospital/ambulance records
 * are read from the same synchronous snapshot as the case itself.
 *
 * Transport only — the lifecycle rules stay in `lib/services/cases`. Coordination and decision
 * support: nothing here diagnoses, prescribes, or presents a reported figure as a live reading.
 */
import type { NextRequest } from "next/server";
import { handle, json, parseBody } from "@/lib/api";
import { updateCase } from "@/lib/services/cases";
import { expireReservations } from "@/lib/services/reservation";
import {
  expirePendingRequests,
  getCase,
  listAmbulances,
  listEvents,
  listHospitals,
  listRequests,
} from "@/lib/store";
import type { Ambulance, Hospital } from "@/lib/types";
import { UpdateCaseSchema } from "@/lib/validation";

/** In-memory store: a prerendered case detail would be a frozen picture of a moving incident. */
export const dynamic = "force-dynamic";

/**
 * Resolves an optional hospital reference without throwing. A case may name a hospital that is no
 * longer in the store (a demo reset, a removed facility); that is worth rendering as "unknown"
 * rather than turning the whole case detail into a 404 the crew cannot get past.
 */
function findHospital(id: string | undefined): Hospital | undefined {
  return id === undefined ? undefined : listHospitals().find((hospital) => hospital.id === id);
}

/** Same forgiving lookup for the assigned crew, for the same reason. */
function findAmbulance(id: string | undefined): Ambulance | undefined {
  return id === undefined ? undefined : listAmbulances().find((ambulance) => ambulance.id === id);
}

/**
 * GET /api/cases/:id — the case plus its timeline, its hospital requests, and the full records for
 * any hospital, backup hospital and ambulance it references.
 *
 * The sweeps run before the case is read so the response can never show a request still counting
 * down after its deadline, or a reservation still held after it lapsed.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/cases/[id]">): Promise<Response> {
  return handle(async () => {
    const { id } = await ctx.params;

    expirePendingRequests();
    expireReservations();

    const emergencyCase = getCase(id);
    return json({
      case: emergencyCase,
      events: listEvents({ caseId: id }),
      requests: listRequests({ caseId: id }),
      hospital: findHospital(emergencyCase.hospitalId),
      backupHospital: findHospital(emergencyCase.backupHospitalId),
      ambulance: findAmbulance(emergencyCase.ambulanceId),
    });
  });
}

/**
 * PATCH /api/cases/:id — a human correcting the record: requirements, blood group and units,
 * severity, or a status move the lifecycle allows.
 *
 * The service decides what is legal and writes the audit event; refusing an impossible move here
 * as well would duplicate the state machine and let the two copies drift apart.
 */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/cases/[id]">): Promise<Response> {
  return handle(async () => {
    const { id } = await ctx.params;
    const patch = await parseBody(request, UpdateCaseSchema);
    return json({ case: updateCase(id, patch) });
  });
}
