"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DemoBanner } from "@/components/DemoBanner";
import { DemoReset } from "@/components/DemoReset";
import { EmergencyIndicator } from "@/components/EmergencyIndicator";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { RoleBadge } from "@/components/RoleBadge";
import { TopNav } from "@/components/TopNav";
import { useT } from "@/lib/i18n";

/** The brand mark, identical in both shells so the two never drift apart. */
function Brand({ label }: { label: string }) {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-sm font-black text-white">
      {label}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname() ?? "/";

  /*
    A relative opening a status link is not staff, and until now they were handed the whole
    staff console around their one page: the role nav, the live city-wide emergency counter, a
    "Reset demo" button that wipes the very case they are watching, and a second language
    switcher. None of it is theirs, and the reset button is actively dangerous in their hands.

    The condition lives here rather than in an app/family/layout.tsx because the root layout is
    what mounts this shell; a nested layout renders inside it and cannot remove it.
  */
  if (pathname.startsWith("/family")) {
    return (
      <div className="flex min-h-full flex-col">
        {/* The demo notice stays: whoever reads this page must know the data is fictional. */}
        <DemoBanner />
        {/*
          No language switcher here: the family page puts one beside its own heading, where a
          relative is already looking. Two of them in one short page is a puzzle, not a choice.
        */}
        <header className="border-b border-border bg-white">
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2.5">
            <Brand label="JS" />
            <span className="text-sm font-bold tracking-tight text-slate-900">{t("app.name")}</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-border px-4 py-3 text-center text-xs text-muted">
          {t("app.name")} · {t("shell.subtitle")}
        </footer>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <DemoBanner />
      <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2" aria-label={`${t("app.name")} · ${t("nav.home")}`}>
            <Brand label="JS" />
            <span className="leading-tight">
              <span className="block text-sm font-bold tracking-tight text-slate-900">{t("app.name")}</span>
              {/*
                The subtitle is the next thing to give way after the role badge. The language
                switcher is a third block in this row and 375 px cannot hold brand + switcher +
                live indicator + reset without a fourth sticky line; the subtitle only restates
                what the banner above and the nav below already say.
              */}
              <span className="hidden text-[11px] text-muted sm:block">{t("shell.subtitle")}</span>
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

            The language switcher never hides. Someone who cannot read this header in English is
            precisely the person who needs it, and it is useless to them behind a menu.
          */}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <LanguageSwitcher />
            {/*
              The way in to role enforcement. Until this link existed /demo-login was reachable
              only by typing the URL, so the guards were invisible unless somebody already knew
              they were there. It sits beside the role badge because that badge is what changes
              when you use it.
            */}
            <Link
              href="/demo-login"
              title={t("demoLogin.linkTitle")}
              className="inline-flex min-h-11 items-center rounded-md px-2.5 text-xs font-semibold text-slate-600 underline-offset-4 hover:bg-slate-100 hover:text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
            >
              {t("demoLogin.link")}
            </Link>
            <span className="hidden sm:inline-flex">
              <RoleBadge />
            </span>
            {/*
              The live emergency counter is the second thing to give way. With the switcher in
              the row, 375 px holds two of these three controls, and the counter is the one a
              crew member on a phone needs least — it counts the whole city, while the list
              below counts their own cases. It stays in full on every screen from sm up.
            */}
            <span className="hidden sm:inline-flex">
              <EmergencyIndicator />
            </span>
            <DemoReset />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-border px-4 py-3 text-center text-xs text-muted">{t("shell.footer")}</footer>
    </div>
  );
}
