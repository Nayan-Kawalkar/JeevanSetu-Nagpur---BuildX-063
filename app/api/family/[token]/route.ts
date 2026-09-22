/**
 * GET /api/family/:token — the family status read.
 *
 * This is the only endpoint in JeevanSetu 360 meant to be opened by someone with no session and
 * no account. That is the whole point: a relative gets a link in a message and it works on the
 * first tap, on a cheap phone, with no sign-up in the way.
 *
 * Three deliberate properties:
 *  - the token is validated for shape only; nothing about the caller is trusted or recorded;
 *  - unknown, expired and revoked tokens produce the identical 404 body, so probing tokens
 *    reveals nothing — not even whether a case with that link ever existed;
 *  - the response is FamilyView and nothing else. See lib/services/family.ts for the list of
 *    fields excluded from it on purpose.
 *
 * Coordination information only: no diagnosis, no treatment, no promise about an outcome.
 */
import { handle, json } from "@/lib/api";
import { readFamilyView } from "@/lib/services/family";

/** One neutral sentence for every failure, so the four cases are indistinguishable. */
const NOT_ACTIVE = "This link is no longer active.";

export async function GET(_request: Request, context: RouteContext<"/api/family/[token]">): Promise<Response> {
  return handle(async () => {
    const { token } = await context.params;
    // A malformed token is answered exactly like a wrong one, not with a validation error.
    if (token.length < 32 || token.length > 128) return json({ error: NOT_ACTIVE }, 404);

    const view = readFamilyView(token);
    if (!view) return json({ error: NOT_ACTIVE }, 404);

    return json({ view });
  });
}
