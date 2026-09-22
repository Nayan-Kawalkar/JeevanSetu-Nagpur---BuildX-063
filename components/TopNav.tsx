"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEMO_ROLES } from "@/lib/roles";
import { cn } from "@/lib/utils";

export function TopNav() {
  const pathname = usePathname() ?? "/";
  return (
    // Wrapping, not scrolling: a horizontal scroller pushed "Blood bank" off the right edge of a
    // 375 px screen with nothing to say it was there, and left a scrollbar across the header on
    // narrow desktop windows. Wrapping to a second line keeps every role visible and tappable.
    <nav aria-label="Primary" className="-mx-1 flex flex-wrap gap-x-1 gap-y-0.5">
      {DEMO_ROLES.map((r) => {
        const active = pathname === r.href || pathname.startsWith(r.href + "/");
        return (
          <Link
            key={r.href}
            href={r.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              // min-h-11 is 44 px: this is a primary control on a phone held in one hand.
              "inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2",
              active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            {r.label}
          </Link>
        );
      })}
    </nav>
  );
}
