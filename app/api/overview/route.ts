/**
 * GET /api/overview — the single endpoint the control room polls every 3 seconds.
 *
 * One request returns the whole wall display: open cases, hospital capacity, blood stock,
 * ambulances, alerts and the recent timeline. It is one endpoint on purpose — if the board were
 * stitched together from five polls, the panels would drift out of step with each other and the
 * room would be looking at a case, a bed count and a blood level captured at three different
 * moments. Everything here is derived from a single `now`.
 *
 * Read-only from the caller's point of view: the two sweeps below only retire things that have
 * already run out of time. It reports coordination state and never claims the data is live —
 * staleness is carried per source inside the payload (`dataAgeMinutes`, `stale`, `confidenceLevel`).
 */
import { handle, json } from "@/lib/api";
import { buildOverview } from "@/lib/services/overview";
import { expireReservations } from "@/lib/services/reservation";
import { expirePendingRequests } from "@/lib/store";

/**
 * Builds and returns the control-room read model.
 *
 * Sweeps before it reads, and passes the same `now` to every step, so the board can never show a
 * hospital request whose deadline has passed as if someone might still answer it, nor an ICU bed
 * or blood unit still held by a reservation that has already lapsed. Doing the sweeps here rather
 * than on a timer keeps the prototype free of background jobs: the poll itself is the clock.
 */
export function GET(): Promise<Response> {
  return handle(() => {
    const now = Date.now();
    expirePendingRequests(now);
    expireReservations(now);
    return json(buildOverview(now));
  });
}
