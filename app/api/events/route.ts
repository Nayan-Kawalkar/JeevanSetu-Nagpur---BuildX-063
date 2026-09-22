/**
 * GET /api/events — the shared audit timeline.
 *
 * Every screen in JeevanSetu 360 shows the same trail of who did what and when, because in a real
 * emergency the argument afterwards is always "nobody told us". This endpoint is the read side of
 * that trail: it never mutates a case, it only reports what the store already recorded.
 *
 * Query parameters (all optional):
 *   caseId      — only events attached to this case (the paramedic and hospital case views)
 *   hospitalId  — only events attached to this hospital (the hospital coordinator's own feed)
 *   limit       — how many of the most recent events to return; default 50, hard ceiling 200
 *
 * Responds with { events } — newest first, as `listEvents` orders them.
 */
import { ApiError, handle, json } from "@/lib/api";
import { expirePendingRequests, listEvents } from "@/lib/store";
import type { EmergencyEvent } from "@/lib/types";

/** Returned when the caller does not ask for a specific page size. Enough to fill a timeline panel. */
const DEFAULT_LIMIT = 50;

/**
 * Hard ceiling on the page size. The store keeps every event for the life of the process, so an
 * unbounded `limit` would let one polling dashboard serialise the whole demo history every 3 s.
 */
const MAX_LIMIT = 200;

/**
 * Normalises a query-string value to `undefined` when it is absent or blank.
 *
 * A blank `?caseId=` is a UI that has not chosen a case yet, not a request for events whose caseId
 * is the empty string; treating the two the same would silently return an empty timeline.
 */
function optionalParam(raw: string | null): string | undefined {
  if (raw === null) return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Parses the `limit` query parameter into a safe page size.
 *
 * A malformed limit is a caller bug and is rejected with 400 so it is noticed in development; a
 * limit that is merely too large is clamped to MAX_LIMIT rather than rejected, because the intent
 * is unambiguous and a live dashboard should degrade, never go blank, mid-demo.
 */
function parseLimit(raw: string | null): number {
  const value = optionalParam(raw);
  if (value === undefined) return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiError(400, `limit must be a whole number of at least 1 (maximum ${MAX_LIMIT})`);
  }
  return Math.min(parsed, MAX_LIMIT);
}

/**
 * Returns the most recent events, optionally narrowed to one case or one hospital.
 *
 * Sweeps timed-out hospital requests first. `expirePendingRequests` is documented as cheap and safe
 * to call on reads, and doing it here means a timeline can never show a request sitting at PENDING
 * long after its deadline with no REQUEST_EXPIRED entry explaining why nobody is coming.
 */
export function GET(request: Request): Promise<Response> {
  return handle(() => {
    const params = new URL(request.url).searchParams;
    const caseId = optionalParam(params.get("caseId"));
    const hospitalId = optionalParam(params.get("hospitalId"));
    const limit = parseLimit(params.get("limit"));

    expirePendingRequests();

    const events: EmergencyEvent[] = listEvents({ caseId, hospitalId, limit });
    return json({ events });
  });
}
