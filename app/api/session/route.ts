/**
 * The demo session endpoint: choose a role, read the current one, leave it.
 *
 * This is the only way a session cookie is ever created, which is the point. The browser cannot
 * write the cookie itself (it is httpOnly and signed here), so a page script cannot promote itself
 * to admin, and every guard in lib/auth.ts is judging a value the server minted.
 *
 * What the client may ask for is narrow and all of it is re-checked: the role must be one of the
 * selectable demo roles, and a hospital coordinator or blood-bank operator must name an
 * organisation that actually exists in the store — that organisation is what scopes their
 * permissions, so an unchecked id here would undo requireHospital/requireBloodBank entirely.
 *
 * Demo access, not authentication: it records which role a judge chose, never who they are.
 */
import { cookies } from "next/headers";
import { z } from "zod";
import { ApiError, handle, json } from "@/lib/api";
import {
  DEMO_SESSION_COOKIE,
  SELECTABLE_DEMO_ROLES,
  SESSION_COOKIE_OPTIONS,
  SESSION_NAME_MAX_LENGTH,
  encodeSessionCookie,
  getSession,
  roleLabel,
  sessionDisplayName,
  type DemoSession,
} from "@/lib/auth";
import { getBloodBank, getHospital } from "@/lib/store";
import type { ActorRole } from "@/lib/types";

/** A session read from a cookie must never be cached by anything between here and the browser. */
export const dynamic = "force-dynamic";

/** Where each role's work actually happens, so choosing a role can land on the right screen. */
const ROLE_HOME: Record<ActorRole, string> = {
  PARAMEDIC: "/paramedic",
  HOSPITAL_COORDINATOR: "/hospital",
  BLOOD_BANK_OPERATOR: "/blood-bank",
  CONTROL_ROOM_OPERATOR: "/control-room",
  // A family member reaches a case through the link they were given, not through a dashboard.
  FAMILY_MEMBER: "/",
  ADMIN: "/control-room",
  SYSTEM: "/",
};

const ChooseRoleSchema = z.object({
  role: z.enum(SELECTABLE_DEMO_ROLES),
  /** Which hospital or blood bank this person works at. Required for those two roles. */
  orgId: z.string().trim().min(1).max(40).optional(),
  /**
   * Display name only; it appears in the timeline beside what the role did. Bounded by the same
   * constant the cookie decoder uses, so the two limits cannot drift apart.
   */
  name: z.string().trim().min(1).max(SESSION_NAME_MAX_LENGTH).optional(),
});

/** The organisation-scoped roles, and the store lookup that proves the id is real. */
const SCOPED_ROLES: Partial<Record<ActorRole, { what: string; name: (id: string) => string }>> = {
  HOSPITAL_COORDINATOR: { what: "hospital", name: (id) => getHospital(id).name },
  BLOOD_BANK_OPERATOR: { what: "blood bank", name: (id) => getBloodBank(id).name },
};

/**
 * Builds the session the server is willing to issue.
 *
 * A scoped role without a real organisation is refused rather than downgraded: silently issuing a
 * coordinator with no orgId would produce a role that can edit nothing and explain nothing, which
 * reads as a broken demo instead of a rejected choice.
 */
function buildSession(input: z.infer<typeof ChooseRoleSchema>): DemoSession {
  const scope = SCOPED_ROLES[input.role];
  if (!scope) {
    return { role: input.role, name: input.name ?? sessionDisplayName(input.role) };
  }

  if (!input.orgId) {
    throw new ApiError(400, `Choose which ${scope.what} you are before entering as ${roleLabel(input.role)}.`);
  }

  let orgName: string;
  try {
    orgName = scope.name(input.orgId);
  } catch {
    throw new ApiError(400, `No ${scope.what} with id "${input.orgId}" exists in this demo.`);
  }

  // sessionDisplayName, not a template string: the composed label has to fit the length the
  // cookie decoder enforces, and the longest seeded hospital names do not.
  return { role: input.role, orgId: input.orgId, name: input.name ?? sessionDisplayName(input.role, orgName) };
}

/** Where this session should land after choosing: a scoped role goes straight to its own console. */
function homeFor(session: DemoSession): string {
  const base = ROLE_HOME[session.role];
  return session.orgId && (base === "/hospital" || base === "/blood-bank") ? `${base}/${session.orgId}` : base;
}

/**
 * GET /api/session — the role currently chosen, or null.
 *
 * `null` is the honest answer for the permissive fallback: nobody chose anything, and the UI must
 * be able to say so rather than showing a phantom admin the judge never picked.
 */
export function GET(): Promise<Response> {
  return handle(async () => {
    const session = await getSession();
    return json({ session, home: session ? homeFor(session) : null });
  });
}

/** POST /api/session — choose a demo role and receive the signed httpOnly cookie. */
export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      throw new ApiError(400, "Request body must be valid JSON");
    }
    const parsed = ChooseRoleSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError(
        400,
        "Validation failed",
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }

    const session = buildSession(parsed.data);
    (await cookies()).set(DEMO_SESSION_COOKIE, encodeSessionCookie(session), SESSION_COOKIE_OPTIONS);
    return json({ session, home: homeFor(session) });
  });
}

/** DELETE /api/session — leave the role and go back to open demo access. */
export function DELETE(): Promise<Response> {
  return handle(async () => {
    (await cookies()).delete({ name: DEMO_SESSION_COOKIE, path: SESSION_COOKIE_OPTIONS.path });
    return json({ session: null, home: "/demo-login" });
  });
}
