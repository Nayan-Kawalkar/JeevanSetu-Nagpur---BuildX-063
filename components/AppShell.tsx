import Link from "next/link";
import type { ReactNode } from "react";
import { DemoBanner } from "@/components/DemoBanner";
import { DemoReset } from "@/components/DemoReset";
import { EmergencyIndicator } from "@/components/EmergencyIndicator";
import { RoleBadge } from "@/components/RoleBadge";
import { TopNav } from "@/components/TopNav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <DemoBanner />
      <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2" aria-label="JeevanSetu 360 home">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-sm font-black text-white">
              JS
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-bold tracking-tight text-slate-900">JeevanSetu 360</span>
              <span className="block text-[11px] text-muted">Nagpur emergency coordination</span>
            </span>
          </Link>
          <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
            <TopNav />
          </div>
          {/*
            flex-wrap: the reset button is a third item here and 375 px cannot hold all three on
            one line. The role badge is the one that gives way on a phone — the nav below already
            marks the current role with aria-current and a filled pill, so on a small screen it is
            a duplicate that costs a whole sticky row. This header is fixed to the top of a 375 ×
            812 screen a paramedic is working one-handed; every row it keeps is a row of the case
            they cannot see.
          */}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <span className="hidden sm:inline-flex">
              <RoleBadge />
            </span>
            <EmergencyIndicator />
            <DemoReset />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-border px-4 py-3 text-center text-xs text-muted">
        Build-X hackathon prototype · Healthcare &amp; Emergency Services track · Fictional demo data
      </footer>
    </div>
  );
}
