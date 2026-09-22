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
      {/*
        Two deliberate rows, not one wrapping row.

        Everything used to share a single flex-wrap line. With seven destinations and five
        controls competing for it, the line broke wherever it happened to run out of room and
        the header came apart into three ragged rows with "Camps" and "Relay" orphaned under
        the brand. Splitting identity and controls from navigation gives each a row it cannot
        overflow, and the result is stable at every width instead of depending on how many
        characters the current language happens to need.
      */}
      <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur">
        <div className="border-b border-border/70">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
            <Link href="/" className="flex items-center gap-2" aria-label={`${t("app.name")} · ${t("nav.home")}`}>
              <Brand label="JS" />
              {/* The wordmark goes first on a phone: the JS mark already identifies the app,
                  and those two words are the difference between fitting across 375 px and
                  scrolling the whole page sideways. */}
              <span className="hidden leading-tight sm:block">
                <span className="block text-sm font-bold tracking-tight text-slate-900">{t("app.name")}</span>
                <span className="hidden text-[11px] text-muted md:block">{t("shell.subtitle")}</span>
              </span>
            </Link>

            <div className="ml-auto flex items-center gap-1.5">
              {/*
                Ordered by how often it is needed, because this is the row that sheds items
                first on a narrow screen. The counter is city-wide and the least useful to a
                crew looking at their own case, so it goes first; the role badge duplicates the
                filled pill in the nav below, so it goes next.
              */}
              <span className="hidden lg:inline-flex">
                <EmergencyIndicator />
              </span>
              <span className="hidden md:inline-flex">
                <RoleBadge />
              </span>
              {/* Never hidden: someone who cannot read this header in English is exactly the
                  person who needs the switcher, and it is useless to them behind a menu. */}
              {/* Visibility lives on a wrapper: cn() is a plain join, so a `hidden` passed into
                  the switcher would sit alongside its own `inline-flex` and lose. */}
              <span className="sm:hidden">
                <LanguageSwitcher compact />
              </span>
              <span className="hidden sm:block">
                <LanguageSwitcher />
              </span>
              <Link
                href="/demo-login"
                title={t("demoLogin.linkTitle")}
                className="hidden min-h-11 items-center rounded-md px-2.5 text-xs font-semibold text-slate-600 underline-offset-4 hover:bg-slate-100 hover:text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 sm:inline-flex"
              >
                {t("demoLogin.link")}
              </Link>
              <DemoReset />
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4">
          <TopNav />
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-border px-4 py-3 text-center text-xs text-muted">{t("shell.footer")}</footer>
    </div>
  );
}
