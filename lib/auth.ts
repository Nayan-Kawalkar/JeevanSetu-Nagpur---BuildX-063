/**
 * Server-side role enforcement for the demo build.
 *
 * The app already had role-based *navigation* — four dashboards behind four links — but no role
 * *enforcement*: anyone who could reach the box could PATCH any hospital's bed counts. The plan is
 * explicit that a client-supplied role value must never be what authorises a protected action, and
 * that without real sign-in credentials we ship a clearly labelled demo-mode selector instead. This
 * module is that enforcement point. Every guard runs on the server, reads the role from an httpOnly
 * cookie the server itself issued and signed, and never looks at anything the caller put in a body.
 *
 * WHY AN UNAUTHENTICATED CALLER IS STILL LET THROUGH
 * -------------------------------------------------
 * This is a demo. Judges click the story end to end without signing in, and `npm run smoke` drives
 * the same fourteen steps over plain fetch with no cookie jar at all. If "no cookie" meant 401, the
 * first click and the whole smoke test would fail, and the honest demonstration of authorisation
 * would be replaced by a login wall nobody asked for.
 *
 * So: when no session cookie is present we fall back to a permissive, clearly named built-in demo
 * session (role ADMIN, name "Demo user"). Enforcement only bites once somebody has *actively chosen*
 * a role on /demo-login — and then it bites for real: a coordinator at Orange City cannot touch
 * Alexis's beds, a blood-bank operator cannot answer a hospital request, and the refusal comes from
 * the server with a sentence an operator can read.
 *
 * That trade-off is stated plainly on the demo-login page too: leaving without choosing a role gives
 * full demo access. A deployment that wants the strict behaviour sets JEEVANSETU_REQUIRE_LOGIN=1 and
 * the fallback disappears, turning every unauthenticated mutation into a 401.
 *
 * The cookie is httpOnly, sameSite=lax and HMAC-signed, so it cannot be read or forged from page
 * scripts. It is still demo access, not authentication: it proves which demo role was chosen, not
 * who chose it. Production would replace `getSession` with a real session lookup and nothing above
 * it would have to change.
 *
 * Coordination and decision support only: nothing here diagnoses, treats, or guarantees anything.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { addEvent, getBloodBank, getHospital } from "@/lib/store";
import { USER_ROLES, type ActorRole, type EventType } from "@/lib/types";

/** Name of the cookie holding the chosen demo role. */
export const DEMO_SESSION_COOKIE = "jeevansetu.demo-session";

/** Who the server believes is acting, as decided by the server. */
export interface DemoSession {
  role: ActorRole;
  /** Hospital id for a coordinator, blood bank id for an operator. Absent for the other roles. */
  orgId?: string;
  name: string;
}

/**
 * Roles a judge can pick on /demo-login. SYSTEM is deliberately absent: it is the label the engine
 * writes on its own automatic timeline entries, and a human being able to impersonate it would make
 * the audit trail lie about which decisions a person made.
 */
export const SELECTABLE_DEMO_ROLES = USER_ROLES.filter((role) => role !== "SYSTEM");

/** Roles that may open, edit and move a case: the crew and the people coordinating them. */
export const CASE_ROLES: ActorRole[] = ["PARAMEDIC", "CONTROL_ROOM_OPERATOR", "ADMIN"];

/** Roles that see past every organisation boundary, because their whole job is the whole city. */
const SUPERVISORY_ROLES: ActorRole[] = ["CONTROL_ROOM_OPERATOR", "ADMIN"];

/**
 * The session an unauthenticated caller acts as. Frozen and exported as one shared object so
 * `isDemoFallbackSession` can recognise it by identity — a real chosen session is never this object,
 * even if a judge picks ADMIN and happens to be called "Demo user".
 */
export const ANONYMOUS_DEMO_SESSION: DemoSession = Object.freeze({ role: "ADMIN", name: "Demo user" });

/** True when this caller never chose a role and is riding the permissive demo fallback. */
export function isDemoFallbackSession(session: DemoSession): boolean {
  return session === ANONYMOUS_DEMO_SESSION;
}

/** Human wording for a role, for refusal sentences and audit lines an operator has to read. */
export function roleLabel(role: ActorRole): string {
  return role.toLowerCase().replace(/_/g, " ");
}

/** Set JEEVANSETU_REQUIRE_LOGIN=1 to turn every unauthenticated mutation into a 401. */
function anonymousAccessAllowed(): boolean {
  return process.env.JEEVANSETU_REQUIRE_LOGIN !== "1";
}

// ---------- cookie encoding ----------

/**
 * How long a display name may be. Exported because the value is a round-trip constraint, not a
 * private detail: whatever composes a name has to respect the same limit the decoder enforces.
 */
export const SESSION_NAME_MAX_LENGTH = 60;

const SessionSchema = z.object({
  role: z.enum(USER_ROLES),
  orgId: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(1).max(SESSION_NAME_MAX_LENGTH),
});

/**
 * Composes "Demo hospital coordinator, Kamptee Road Civil Hospital" and guarantees it fits.
 *
 * This exists because it once did not. `Demo ${role}, ${orgName}` runs to 65 characters for
 * "Government Medical Hospital, Sitabuldi", the decoder's schema rejected it, and a rejected
 * cookie reads as "no session" — which in demo mode means the permissive ADMIN fallback. So
 * choosing coordinator at two of the six seeded hospitals silently handed out *more* access
 * than the role picker said it was granting, and the role badge showed nobody signed in. A
 * long organisation name must cost a few characters of label, never an authorisation boundary.
 */
export function sessionDisplayName(role: ActorRole, orgName?: string): string {
  const full = orgName ? `Demo ${roleLabel(role)}, ${orgName}` : `Demo ${roleLabel(role)}`;
  if (full.length <= SESSION_NAME_MAX_LENGTH) return full;
  // Ellipsis rather than a hard cut, so the name reads as shortened instead of mistyped.
  return `${full.slice(0, SESSION_NAME_MAX_LENGTH - 1).trimEnd()}…`;
}

/**
 * Signing key. A demo box has none configured, so a build-time constant is used and the cookie is
 * only tamper-evident against page scripts, not against whoever runs the server. That is the right
 * strength for a prototype and the wrong strength for production, which is why the value is named
 * for what it is.
 */
function signingKey(): string {
  const configured = process.env.DEMO_SESSION_SECRET?.trim();
  return configured && configured.length > 0 ? configured : "jeevansetu-demo-only-unconfigured-key";
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

/** Constant-time compare that never leaks how many characters matched. */
function signatureMatches(expected: string, supplied: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Encodes a session into the signed cookie value the browser will carry back.
 *
 * The session is put through the very schema that will decode it, so a cookie this function
 * returns is a cookie `decodeSessionCookie` accepts. A session that cannot survive the round
 * trip now throws here, at the one call site that mints cookies, instead of being handed to a
 * browser that will carry it back to a guard which quietly treats it as nobody at all.
 */
export function encodeSessionCookie(session: DemoSession): string {
  const round = SessionSchema.parse(session);
  const payload = Buffer.from(JSON.stringify(round), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Cookie attributes used both when setting and when clearing, so the two always match. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: process.env.NODE_ENV === "production",
  /** Eight hours: longer than any demo session, short enough that a shared laptop forgets. */
  maxAge: 60 * 60 * 8,
} as const;

/** Decodes and verifies a cookie value. Anything unexpected is treated as "no session". */
function decodeSessionCookie(raw: string): DemoSession | null {
  const dot = raw.indexOf(".");
  if (dot <= 0) return null;

  const payload = raw.slice(0, dot);
  if (!signatureMatches(sign(payload), raw.slice(dot + 1))) return null;

  try {
    const parsed = SessionSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ---------- reading the session ----------

/**
 * The session this request actually carries, or null when it carries none.
 *
 * Never falls back: callers that want the permissive demo behaviour go through the guards below, and
 * the UI uses the plain null to say honestly "no role chosen".
 */
export async function getSession(): Promise<DemoSession | null> {
  const raw = (await cookies()).get(DEMO_SESSION_COOKIE)?.value;
  return raw ? decodeSessionCookie(raw) : null;
}

/** The session a guard will judge: the chosen one, or the permissive fallback when allowed. */
async function resolveSession(): Promise<DemoSession | null> {
  const chosen = await getSession();
  if (chosen) return chosen;
  return anonymousAccessAllowed() ? ANONYMOUS_DEMO_SESSION : null;
}

// ---------- guards ----------

/**
 * Requires one of `allowed`. Throws 401 when there is no session at all (only possible with
 * JEEVANSETU_REQUIRE_LOGIN=1) and 403 when a role was chosen that may not do this.
 *
 * Both messages name the role and the way out, because the person reading them is standing in front
 * of a judge, not in a stack trace.
 */
export async function requireRole(...allowed: ActorRole[]): Promise<DemoSession> {
  const session = await resolveSession();
  if (!session) {
    throw new ApiError(401, "No role is signed in. Open /demo-login and choose a demo role to continue.");
  }
  if (!allowed.includes(session.role)) {
    throw new ApiError(
      403,
      `You are signed in as ${roleLabel(session.role)}, and this action is only for ${allowed
        .map(roleLabel)
        .join(", ")}. Change role at /demo-login.`,
    );
  }
  return session;
}

/**
 * Requires the caller to be able to act for one named hospital.
 *
 * A hospital coordinator is pinned to their own hospital: editing another hospital's beds is exactly
 * the failure this guard exists to stop, because those numbers decide where an ambulance is sent.
 * Control room and admin pass, since coordinating across every hospital is their job.
 */
export async function requireHospital(hospitalId: string): Promise<DemoSession> {
  const session = await requireRole("HOSPITAL_COORDINATOR", ...SUPERVISORY_ROLES);
  if (session.role === "HOSPITAL_COORDINATOR" && session.orgId !== hospitalId) {
    const own = session.orgId ? safeHospitalName(session.orgId) : "no hospital";
    throw new ApiError(
      403,
      `You are signed in as coordinator for ${own}, so you cannot act for ${safeHospitalName(hospitalId)}. Change role at /demo-login.`,
    );
  }
  return session;
}

/** The same rule for blood banks: an operator answers only for the shelf they are standing at. */
export async function requireBloodBank(bankId: string): Promise<DemoSession> {
  const session = await requireRole("BLOOD_BANK_OPERATOR", ...SUPERVISORY_ROLES);
  if (session.role === "BLOOD_BANK_OPERATOR" && session.orgId !== bankId) {
    const own = session.orgId ? safeBankName(session.orgId) : "no blood bank";
    throw new ApiError(
      403,
      `You are signed in as operator for ${own}, so you cannot act for ${safeBankName(bankId)}. Change role at /demo-login.`,
    );
  }
  return session;
}

/**
 * Names used only inside refusal sentences. A lookup that fails falls back to the id rather than
 * throwing: the caller is already being refused, and turning a 403 into a 404 would tell them the
 * wrong thing about why.
 */
function safeHospitalName(id: string): string {
  try {
    return getHospital(id).name;
  } catch {
    return id;
  }
}

function safeBankName(id: string): string {
  try {
    return getBloodBank(id).name;
  } catch {
    return id;
  }
}

// ---------- audit ----------

/**
 * Records that an authorised role performed a mutation.
 *
 * Written only for a session somebody actually chose. The permissive fallback covers every click of
 * the scripted demo and every step of the smoke test, and stamping "Demo user (admin) authorised…"
 * beside each of those would bury the clinical story the timeline exists to tell. Once a judge picks
 * a role, every mutation they make leaves this line next to the domain event it caused.
 *
 * The event vocabulary in lib/types.ts is a fixed contract with no generic AUDIT type, so each
 * caller passes the closest existing type and the authorisation is spelled out in the message.
 */
export function auditGuardedMutation(
  session: DemoSession,
  entry: { type: EventType; action: string; caseId?: string; hospitalId?: string; bloodBankId?: string },
): void {
  if (isDemoFallbackSession(session)) return;
  addEvent({
    caseId: entry.caseId,
    hospitalId: entry.hospitalId,
    bloodBankId: entry.bloodBankId,
    type: entry.type,
    actorRole: session.role,
    message: `Authorised: ${session.name} (${roleLabel(session.role)}) ${entry.action}.`,
  });
}

/**
 * The role to record as the author of a change.
 *
 * With a chosen session the server's own answer wins over anything the client claimed. Without one
 * the client's stated role stands, because the scripted demo posts "PARAMEDIC" from the paramedic
 * screen and recording those steps as "admin" would make the timeline read wrong on stage.
 */
export function effectiveActorRole(session: DemoSession, claimed: ActorRole): ActorRole {
  return isDemoFallbackSession(session) ? claimed : session.role;
}
