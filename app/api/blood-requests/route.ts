/**
 * The blood request queue.
 *
 * A "blood request" is one hospital asking one named bank to hold named units for one named
 * case, with a clock on it. This route is what an operator's console polls (the asks they must
 * answer) and what a hospital coordinator posts to instead of forwarding a message into a
 * WhatsApp group and hoping.
 *
 * Coordination only: nothing here diagnoses or prescribes, no donor exists in this model, and
 * the numbers returned are the ones people typed, carrying the time they typed them.
 */
import { z } from "zod";
import { ApiError, handle, json, parseBody } from "@/lib/api";
import { auditGuardedMutation, requireHospital } from "@/lib/auth";
import { createBloodRequest, expireBloodRequests } from "@/lib/services/bloodRequests";
import { db, listBloodBanks, listBloodRequests, listHospitals } from "@/lib/store";
import {
  BLOOD_COMPONENTS,
  BLOOD_GROUPS,
  BLOOD_REQUEST_STATUSES,
  type BloodBank,
  type BloodRequest,
  type BloodRequestStatus,
  type EmergencyCase,
  type Hospital,
} from "@/lib/types";

export const CreateBloodRequestSchema = z.object({
  caseId: z.string().trim().min(1),
  hospitalId: z.string().trim().min(1),
  bloodBankId: z.string().trim().min(1),
  bloodGroup: z.enum(BLOOD_GROUPS),
  component: z.enum(BLOOD_COMPONENTS),
  units: z.number().int().min(1).max(20),
  requestedBy: z.string().trim().min(1).max(60).default("Hospital coordinator"),
  /** Client-generated idempotency key so a double tap never sends two asks. */
  idempotencyKey: z.string().min(4).max(80).optional(),
});
export type CreateBloodRequestBody = z.infer<typeof CreateBloodRequestSchema>;

/** What GET answers with: the queue plus everything needed to render a row by name. */
export interface BloodRequestsResponse {
  requests: BloodRequest[];
  cases: Record<string, EmergencyCase>;
  hospitals: Record<string, Hospital>;
  bloodBanks: Record<string, BloodBank>;
}

/** A blank or missing query param means "no filter"; anything else must be a real value. */
function optionalParam(raw: string | null): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Turns the `status` query param into a BloodRequestStatus, rejecting anything unknown.
 *
 * A typo must not quietly widen the filter: an operator asking for the unanswered queue and
 * silently being shown yesterday's fulfilled rows would answer the wrong one.
 */
function parseStatus(raw: string | null): BloodRequestStatus | undefined {
  const value = optionalParam(raw);
  if (!value) return undefined;
  const match = BLOOD_REQUEST_STATUSES.find((s) => s === value.toUpperCase());
  if (!match) {
    throw new ApiError(
      400,
      `Unknown blood request status "${value}". Expected one of: ${BLOOD_REQUEST_STATUSES.join(", ")}.`,
    );
  }
  return match;
}

/**
 * Queue order: unanswered first, then newest first.
 *
 * A PENDING ask is the only row anyone can still act on, so it sits above answered rows
 * however old they are. The id tiebreak keeps the order stable between 3 s polls, so a row
 * never swaps places under an operator's thumb mid-tap.
 */
function queueOrder(a: BloodRequest, b: BloodRequest): number {
  const pendingFirst = Number(b.status === "PENDING") - Number(a.status === "PENDING");
  if (pendingFirst !== 0) return pendingFirst;
  const newestFirst = b.createdAt.localeCompare(a.createdAt);
  return newestFirst !== 0 ? newestFirst : b.id.localeCompare(a.id);
}

/**
 * GET /api/blood-requests?caseId=&hospitalId=&bloodBankId=&status=
 *
 * Answers with the queue and the names behind it — the cases the rows refer to, and every
 * hospital and bank — so a console renders a row ("Orange City Hospital, 2 units O−, 40 s")
 * and a bank picker from one read instead of three that can disagree with each other.
 *
 * Lapsed requests are swept before reading, so an operator is never shown a Reserve button for
 * an ask whose clock ran out while the tab sat idle, and units held by a dead hold are back on
 * the shelf where the next caller can be given them.
 */
export function GET(request: Request): Promise<Response> {
  return handle(() => {
    expireBloodRequests();

    const params = new URL(request.url).searchParams;
    const requests = listBloodRequests({
      caseId: optionalParam(params.get("caseId")),
      hospitalId: optionalParam(params.get("hospitalId")),
      bloodBankId: optionalParam(params.get("bloodBankId")),
      status: parseStatus(params.get("status")),
    }).sort(queueOrder);

    const cases: Record<string, EmergencyCase> = {};
    for (const r of requests) {
      if (cases[r.caseId]) continue;
      // Read through the store map rather than getCase(): one dangling reference should leave
      // a gap, not fail the whole queue an operator is waiting on.
      const found = db().cases[r.caseId];
      if (found) cases[r.caseId] = found;
    }

    const hospitals: Record<string, Hospital> = {};
    for (const hospital of listHospitals()) hospitals[hospital.id] = hospital;
    const bloodBanks: Record<string, BloodBank> = {};
    for (const bank of listBloodBanks()) bloodBanks[bank.id] = bank;

    const body: BloodRequestsResponse = { requests, cases, hospitals, bloodBanks };
    return json(body);
  });
}

/**
 * POST /api/blood-requests — one hospital asks one bank to hold units for one case.
 *
 * Every domain rule lives in createBloodRequest(): the idempotency key that stops a double tap
 * creating two asks, and the refusal (409) of a second live ask for the same case and group.
 * Creating an ask holds nothing; only an operator's answer moves stock.
 *
 * Authorisation is the one thing the service cannot do, because it is about the caller rather
 * than the request. The body names the hospital doing the asking, so requireHospital checks
 * that the signed-in coordinator is actually at that hospital: asking a bank to hold four units
 * "for Orange City" from someone else's console is how a shelf empties for a patient who was
 * never coming. Control room and admin pass, and an unauthenticated demo caller rides the
 * permissive fallback so the scripted walkthrough keeps working.
 */
export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const input = await parseBody(request, CreateBloodRequestSchema);
    const session = await requireHospital(input.hospitalId);
    const created = createBloodRequest(input);
    auditGuardedMutation(session, {
      type: "BLOOD_REQUESTED",
      caseId: created.caseId,
      hospitalId: created.hospitalId,
      bloodBankId: created.bloodBankId,
      action: `asked for ${created.units} units of blood on request ${created.id}`,
    });
    return json({ request: created }, 201);
  });
}
