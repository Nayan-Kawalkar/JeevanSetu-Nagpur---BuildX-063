"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT, type TranslationKey } from "@/lib/i18n";
import { DEMO_ROLES, TWIST_LINKS, type UserRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * The role names in lib/roles.ts are English constants shared with the API layer, so the nav
 * translates them through the dictionary instead of reading `label`. A role with no key (ADMIN)
 * falls back to the English label rather than rendering a raw key.
 */
const ROLE_LABEL_KEY: Record<UserRole, TranslationKey | null> = {
  PARAMEDIC: "role.paramedic",
  HOSPITAL_COORDINATOR: "role.hospitalCoordinator",
  CONTROL_ROOM_OPERATOR: "role.controlRoom",
  BLOOD_BANK_OPERATOR: "role.bloodBank",
  FAMILY_MEMBER: "role.family",
  ADMIN: null,
};

export function roleLabelKey(role: UserRole): TranslationKey | null {
  return ROLE_LABEL_KEY[role];
}

export function TopNav() {
  const pathname = usePathname() ?? "/";
  const t = useT();
  const pill =
    // min-h-11 is 44 px: this is a primary control on a phone held in one hand.
    "inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2";
  return (
    // Wrapping, not scrolling: a horizontal scroller pushed "Blood bank" off the right edge of a
    // 375 px screen with nothing to say it was there, and left a scrollbar across the header on
    // narrow desktop windows. Wrapping to a second line keeps every role visible and tappable.
    <nav aria-label="Primary" className="-mx-1 flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {DEMO_ROLES.map((r) => {
        const active = pathname === r.href || pathname.startsWith(r.href + "/");
        const key = roleLabelKey(r.role);
        return (
          <Link
            key={r.href}
            href={r.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              pill,
              active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            {key === null ? r.label : t(key)}
          </Link>
        );
      })}
      {/*
        The twist screens are city-scale views, not roles, so they are a separate group with a
        rule between them. On a phone the rule disappears with the row break and the amber tint
        is what still separates them — colour is never the only signal, the group has its own
        accessible name too.
      */}
      <span aria-hidden className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
      <span className="contents" role="group" aria-label="Twist screens">
        {TWIST_LINKS.map((twist) => {
          const active = pathname === twist.href || pathname.startsWith(twist.href + "/");
          return (
            <Link
              key={twist.href}
              href={twist.href}
              // No `title` here: a title attribute becomes the link's accessible name, so a
              // screen reader would announce the whole sentence instead of "Surge" and the
              // visible text would no longer match the spoken one.
              aria-current={active ? "page" : undefined}
              className={cn(
                pill,
                active ? "bg-amber-600 text-white" : "text-amber-800 hover:bg-amber-50 hover:text-amber-900",
              )}
            >
              {twist.label}
            </Link>
          );
        })}
      </span>
    </nav>
  );
}
