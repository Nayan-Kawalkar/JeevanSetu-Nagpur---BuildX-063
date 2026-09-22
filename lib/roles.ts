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
