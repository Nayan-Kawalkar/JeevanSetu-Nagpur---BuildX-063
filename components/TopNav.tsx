"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEMO_ROLES } from "@/lib/roles";
import { cn } from "@/lib/utils";

export function TopNav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav aria-label="Primary" className="-mx-1 flex gap-1 overflow-x-auto">
      {DEMO_ROLES.map((r) => {
        const active = pathname === r.href || pathname.startsWith(r.href + "/");
        return (
          <Link
            key={r.href}
            href={r.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
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
