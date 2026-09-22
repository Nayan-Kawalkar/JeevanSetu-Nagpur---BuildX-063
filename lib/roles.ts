export type UserRole =
  | "PARAMEDIC"
  | "HOSPITAL_COORDINATOR"
  | "BLOOD_BANK_OPERATOR"
  | "CONTROL_ROOM_OPERATOR"
  | "FAMILY_MEMBER"
  | "ADMIN";

export interface RoleInfo {
  role: UserRole;
  label: string;
  href: string;
  description: string;
}

/** Demo roles judges can enter with one click. Order = display order on the landing page. */
export const DEMO_ROLES: RoleInfo[] = [
  {
    role: "PARAMEDIC",
    label: "Paramedic",
    href: "/paramedic",
    description: "Create an emergency case and get an explainable hospital recommendation.",
  },
  {
    role: "HOSPITAL_COORDINATOR",
    label: "Hospital coordinator",
    href: "/hospital",
    description: "Keep ICU, specialist and equipment status current. Accept or reject incoming cases.",
  },
  {
    role: "CONTROL_ROOM_OPERATOR",
    label: "Control room",
    href: "/control-room",
    description: "Watch every active incident, hospital capacity, stale data and blood alerts on one map.",
  },
  {
    role: "BLOOD_BANK_OPERATOR",
    label: "Blood bank",
    href: "/blood-bank",
    description: "Update unit stock by group and see emergency reservations.",
  },
];

/** Derives the demo role from the current URL path. */
export function roleFromPath(pathname: string): RoleInfo | null {
  return DEMO_ROLES.find((r) => pathname === r.href || pathname.startsWith(r.href + "/")) ?? null;
}

/**
 * The twist screens.
 *
 * These are not roles — they are city-scale views that cut across all four dashboards, which is
 * exactly the point they make: the role consoles each serve one patient at a time, and each of
 * these screens exists because a twist breaks that assumption. They are listed separately in the
 * nav so nobody reads "Surge" as a fifth job title.
 *
 * Labels are deliberately one short word. The header already wraps to two lines at 375 px with
 * four role pills in it; "Mass-casualty surge board" would push it to three.
 */
export interface TwistLink {
  href: string;
  label: string;
  description: string;
}

export const TWIST_LINKS: TwistLink[] = [
  {
    href: "/surge",
    label: "Surge",
    description: "Mass-casualty incident: allocate every casualty at once against live capacity.",
  },
  {
    href: "/camps",
    label: "Camps",
    description: "City capacity by tier, and standing up a temporary camp when it runs out.",
  },
  {
    href: "/relay",
    label: "Relay",
    description: "Blackout working: encode a whole case into one SMS and decode it back.",
  },
];

/** Matches a twist screen from the current URL path, for nav highlighting. */
export function twistFromPath(pathname: string): TwistLink | null {
  return TWIST_LINKS.find((t) => pathname === t.href || pathname.startsWith(t.href + "/")) ?? null;
}
