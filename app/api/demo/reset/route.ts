/**
 * POST /api/demo/reset — restores the scripted Rohan demo scenario.
 *
 * The whole prototype lives in one in-memory store, so a judge clicking through the flow leaves it
 * mid-scenario. This endpoint puts it back to the seeded starting state in one call.
 *
 * Two guards, because this wipes everything:
 *   - It is POST-only. A GET returns 405 with a hint, so a stray browser visit, a link preview or a
 *     crawler cannot reset the demo while it is on screen.
 *   - When DEMO_RESET_SECRET is set (a deployed build), the caller must send a matching
 *     `x-demo-secret` header. When it is unset (local dev) reset is open, so the demo needs zero
 *     configuration to run.
 */
import { ApiError, handle, json } from "@/lib/api";
import { resetDb, type Database } from "@/lib/store";

/** Header carrying the shared secret. Lower-case: `Headers.get` is case-insensitive anyway. */
const SECRET_HEADER = "x-demo-secret";

/**
 * Returns the configured reset secret, or null when reset should be open.
 *
 * Reads `process.env` directly rather than the validated env helper, and treats a blank value as
 * unset, because `DEMO_RESET_SECRET=` with nothing after it is exactly what you get from copying
 * `.env.example`. Treating that as "protected by the empty string" would lock the demo out of its
 * own reset button at the worst possible moment.
 */
function configuredSecret(): string | null {
  const raw = process.env.DEMO_RESET_SECRET;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Compares the supplied header against the expected secret in time independent of how much of it
 * matched, so repeated attempts cannot be used to recover the secret one character at a time.
 * Every position is examined even after a mismatch is found.
 */
function secretMatches(expected: string, supplied: string | null): boolean {
  if (supplied === null) return false;
  const length = Math.max(expected.length, supplied.length);
  let diff = expected.length ^ supplied.length;
  for (let i = 0; i < length; i++) {
    const a = i < expected.length ? expected.charCodeAt(i) : 0;
    const b = i < supplied.length ? supplied.charCodeAt(i) : 0;
    diff |= a ^ b;
  }
  return diff === 0;
}

/**
 * Counts what the fresh database contains, so the caller can show "demo restored: 6 hospitals,
 * 3 blood banks…" and see at a glance that the reset actually took effect.
 */
function seedCounts(fresh: Database) {
  return {
    hospitals: Object.keys(fresh.hospitals).length,
    bloodBanks: Object.keys(fresh.bloodBanks).length,
    ambulances: Object.keys(fresh.ambulances).length,
    cases: Object.keys(fresh.cases).length,
    requests: Object.keys(fresh.requests).length,
    events: fresh.events.length,
  };
}

/**
 * Rebuilds the seeded demo database and reports what was restored.
 *
 * Authorises first and never partially resets: either the secret check passes and the store is
 * replaced wholesale, or nothing is touched. `resetDb` records its own DEMO_RESET event, so the
 * reset is visible in the timeline like any other action rather than looking like data that
 * silently changed by itself.
 */
export function POST(request: Request): Promise<Response> {
  return handle(() => {
    const expected = configuredSecret();
    if (expected !== null && !secretMatches(expected, request.headers.get(SECRET_HEADER))) {
      throw new ApiError(401, `Demo reset is protected. Send a matching ${SECRET_HEADER} header.`);
    }
    const fresh = resetDb();
    return json({ ok: true, seededAt: fresh.seededAt, counts: seedCounts(fresh) });
  });
}

/**
 * Refuses a browser visit with 405 and an explanation.
 *
 * Without this, opening /api/demo/reset in a tab during the presentation would wipe the scenario
 * being demonstrated. Defining GET explicitly also stops Next.js from advertising it as allowed.
 */
export function GET(): Promise<Response> {
  return handle(() =>
    json(
      {
        error: "Method not allowed",
        hint: "Demo reset is POST-only so a stray browser visit cannot wipe the demo mid-presentation. Send POST /api/demo/reset.",
      },
      { status: 405, headers: { Allow: "POST" } },
    ),
  );
}
