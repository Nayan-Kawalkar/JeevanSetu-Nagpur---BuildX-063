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

/**
 * First word only, for phone widths. "Hospital coordinator" and "Control room" are what push the
 * nav from two rows to three on a 375 px screen, and the first word identifies each destination
 * unambiguously here. The full label is still rendered for anything wider, and both are real text
 * so a screen reader reads whichever one is actually displayed.
 */
function shortLabel(label: string): string {
  return label.split(" ")[0];
}

export function TopNav() {
  const pathname = usePathname() ?? "/";
  const t = useT();
  // Tabs, not pills. The nav now owns its own row directly under the brand, and a row of filled
  // pills there reads as a toolbar of buttons rather than as where-you-are. An underline sits on
  // the row's own edge, so the active destination is legible without a heavy block of colour.
  // min-h-11 is 44 px: a primary control on a phone held in one hand.
  const tab =
    "inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-2 text-sm font-medium sm:px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900";
  return (
    // Wrapping, not scrolling: a horizontal scroller pushed "Blood bank" off the right edge of a
    // 375 px screen with nothing to say it was there, and left a scrollbar across the header on
    // narrow desktop windows. Wrapping to a second line keeps every role visible and tappable.
    <nav aria-label="Primary" className="-mb-px flex flex-wrap items-center gap-x-1">
      {DEMO_ROLES.map((r) => {
        const active = pathname === r.href || pathname.startsWith(r.href + "/");
        const key = roleLabelKey(r.role);
        return (
          <Link
            key={r.href}
            href={r.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              tab,
              active
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900",
            )}
          >
            {(() => {
              const full = key === null ? r.label : t(key);
              const short = shortLabel(full);
              return short === full ? (
                full
              ) : (
                <>
                  <span className="sm:hidden">{short}</span>
                  <span className="hidden sm:inline">{full}</span>
                </>
              );
            })()}
          </Link>
        );
      })}
      {/*
        The twist screens are city-scale views, not roles, so they are a separate group with a
        rule between them. On a phone the rule disappears with the row break and the amber tint
        is what still separates them — colour is never the only signal, the group has its own
        accessible name too.
      */}
      <span aria-hidden className="mx-2 hidden h-5 w-px self-center bg-slate-200 sm:block" />
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
                tab,
                active
                  ? "border-amber-600 text-amber-800"
                  : "border-transparent text-amber-700 hover:border-amber-300 hover:text-amber-900",
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
