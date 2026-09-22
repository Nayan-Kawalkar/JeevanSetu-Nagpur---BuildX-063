/**
 * Staff side of the family link: issue one, list the live ones, turn one off.
 *
 * The family-facing read lives at /api/family/[token] and needs no session. This file is the
 * opposite end — it is used from the crew's case screen — and it never returns anything about a
 * case beyond the links themselves.
 *
 * Coordination only: issuing a link shares status, not clinical advice.
 */
import { handle, json, parseBody } from "@/lib/api";
import { CASE_ROLES, auditGuardedMutation, effectiveActorRole, requireRole } from "@/lib/auth";
import { activeFamilyLinks, createFamilyLink, revokeFamilyLink } from "@/lib/services/family";
import { USER_ROLES } from "@/lib/types";
import { z } from "zod";

/**
 * `actorRole` is only ever an audit label here — it decides nothing and grants nothing. Once a
 * role has actually been chosen the server's own answer replaces it (effectiveActorRole), so a
 * client that lies about it changes nothing at all; without a chosen role the claimed value
 * stands, because the scripted demo posts "PARAMEDIC" from the paramedic screen and recording
 * that as "admin" would make the timeline read wrong on stage. It is validated against the enum
 * either way rather than trusted as a free string.
 */
const CreateFamilyLinkSchema = z.object({
  caseId: z.string().trim().min(3).max(40),
  actorRole: z.enum(USER_ROLES).default("PARAMEDIC"),
});

const RevokeFamilyLinkSchema = z.object({
  token: z.string().trim().min(32).max(128),
  actorRole: z.enum(USER_ROLES).default("PARAMEDIC"),
});

/** GET /api/family?caseId=JS-2026-0001 — the links for one case that still open. */
export async function GET(request: Request): Promise<Response> {
  return handle(() => {
    const caseId = new URL(request.url).searchParams.get("caseId");
    const parsed = z.string().trim().min(3).max(40).safeParse(caseId);
    if (!parsed.success) return json({ error: "A caseId query parameter is required" }, 400);
    return json({ links: activeFamilyLinks(parsed.data) });
  });
}

/**
 * POST /api/family — issue a read-only link for a case.
 *
 * Naturally idempotent: while a link is live, posting again returns that same link instead of
 * minting a second key nobody will remember to revoke.
 *
 * Guarded by the case roles, because a link is a key to a patient's status: the crew and the
 * people coordinating them hand it out, not a blood-bank operator who happens to have the tab
 * open. An unauthenticated demo caller rides the permissive fallback.
 */
export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const session = await requireRole(...CASE_ROLES);
    const input = await parseBody(request, CreateFamilyLinkSchema);
    const link = createFamilyLink(input.caseId, effectiveActorRole(session, input.actorRole));
    auditGuardedMutation(session, {
      type: "FAMILY_LINK_CREATED",
      caseId: link.caseId,
      action: `issued a family status link for case ${link.caseId}`,
    });
    return json({ link }, 201);
  });
}

/**
 * DELETE /api/family — revoke a link. From this moment its page reads as no longer active.
 *
 * Same guard as issuing one: turning a relative's link off is as much a decision about who can
 * see a patient's status as turning it on.
 */
export async function DELETE(request: Request): Promise<Response> {
  return handle(async () => {
    const session = await requireRole(...CASE_ROLES);
    const input = await parseBody(request, RevokeFamilyLinkSchema);
    const link = revokeFamilyLink(input.token, effectiveActorRole(session, input.actorRole));
    auditGuardedMutation(session, {
      type: "FAMILY_LINK_REVOKED",
      caseId: link.caseId,
      action: `revoked a family status link for case ${link.caseId}`,
    });
    return json({ link });
  });
}
