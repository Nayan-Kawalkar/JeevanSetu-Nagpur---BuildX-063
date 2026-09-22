/**
 * Case collection endpoint.
 *
 * Two jobs only: hand the dashboards the list of cases they are entitled to poll, and let a
 * paramedic open a new one. Every decision about what a case *means* — what the patient needs,
 * which hospital can take them, what is held for them — lives in `lib/services/cases`; this file
 * is transport, so the same lifecycle rules apply no matter who calls them.
 *
 * Coordination and decision support only: nothing here diagnoses, prescribes, or presents a
 * reported figure as a live measurement.
 */
import type { NextRequest } from "next/server";
import { ApiError, handle, json, parseBody } from "@/lib/api";
import { createCase } from "@/lib/services/cases";
import { expireReservations } from "@/lib/services/reservation";
import { expirePendingRequests, listCases } from "@/lib/store";
import { CASE_STATUSES, type CaseStatus } from "@/lib/types";
import { CreateCaseSchema } from "@/lib/validation";

/**
 * The store lives in memory and changes minute by minute, so a prerendered snapshot of this
 * route would show a control room a picture of the world taken at build time.
 */
export const dynamic = "force-dynamic";

/** Upper bound on `limit`, so one careless query cannot serialise the whole store into a poll. */
const MAX_LIMIT = 200;

/**
 * Reads `active=true|false`. A typo is rejected rather than ignored: silently dropping the filter
 * would show a control-room list of closed cases that looks exactly like a list of live ones.
 */
function readActive(raw: string | null): boolean | undefined {
  if (raw === null || raw === "") return undefined;
  const value = raw.toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ApiError(400, `Query parameter "active" must be true or false, not "${raw}".`);
}

/** Reads `status`, refusing anything outside the lifecycle so a filter never silently matches nothing. */
function readStatus(raw: string | null): CaseStatus | undefined {
  if (raw === null || raw === "") return undefined;
  const match = CASE_STATUSES.find((status) => status === raw);
  if (!match) {
    throw new ApiError(400, `Unknown status "${raw}". Expected one of: ${CASE_STATUSES.join(", ")}.`);
  }
  return match;
}

/** Reads `limit` as a whole number in 1..MAX_LIMIT; anything else is a caller bug worth reporting. */
function readLimit(raw: string | null): number | undefined {
  if (raw === null || raw === "") return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    throw new ApiError(400, `Query parameter "limit" must be a whole number between 1 and ${MAX_LIMIT}.`);
  }
  return value;
}

/**
 * GET /api/cases — the list every dashboard polls, newest first.
 *
 * Supports `active=true|false`, `status=<CaseStatus>` and `limit`. The lapsed-request and
 * lapsed-reservation sweeps run first so a list can never show a case as waiting on a hospital
 * that stopped answering, or a bed as held when the hold has already run out.
 */
export async function GET(request: NextRequest): Promise<Response> {
  return handle(() => {
    expirePendingRequests();
    expireReservations();

    const params = request.nextUrl.searchParams;
    const limit = readLimit(params.get("limit"));
    const cases = listCases({
      active: readActive(params.get("active")),
      status: readStatus(params.get("status")),
    });

    return json({ cases: limit === undefined ? cases : cases.slice(0, limit) });
  });
}

/**
 * POST /api/cases — opens a case from the paramedic's incident form.
 *
 * The body is validated before anything is written, because a half-filled case reaching the
 * matching engine would rank hospitals against requirements nobody actually confirmed. 201 with
 * the created case so the client can navigate straight to it without a second round trip.
 */
export async function POST(request: NextRequest): Promise<Response> {
  return handle(async () => {
    const input = await parseBody(request, CreateCaseSchema);
    const created = await createCase(input);
    return json({ case: created }, 201);
  });
}
