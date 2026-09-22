/**
 * GET /api/health — liveness plus the small status summary behind the header indicator.
 *
 * Cheap enough to poll every 3 seconds from every screen, so it does no derivation of its own: it
 * returns `healthSummary()` from the store, which counts active cases using the same ACTIVE_STATUSES
 * definition as the control room. The pill in the header and the board therefore can never disagree
 * about how many emergencies are open.
 *
 * It also reports whether AI-assisted requirement extraction is configured, so a demo audience can
 * see which path produced a suggestion. It reports only the boolean and the provider's constant
 * name — never the API key, never a prefix, suffix, length or hash of it.
 */
import { handle, json } from "@/lib/api";
import { getAiProvider } from "@/lib/services/ai";
import { healthSummary } from "@/lib/store";

/**
 * Returns the store's health summary plus the AI configuration flag.
 *
 * `aiConfigured` is false in the normal zero-configuration demo; extraction then falls back to the
 * deterministic keyword rules, which is a supported mode rather than a failure, so `ok` stays true.
 * The provider object is discarded immediately after the null check so no key material can reach
 * the response body.
 */
export function GET(): Promise<Response> {
  return handle(() => {
    const provider = getAiProvider();
    return json({
      ...healthSummary(),
      aiConfigured: provider !== null,
      aiProvider: provider === null ? null : provider.name,
    });
  });
}
