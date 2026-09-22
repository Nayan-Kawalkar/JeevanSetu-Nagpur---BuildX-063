"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { roleLabelKey } from "@/components/TopNav";
import { useT, type TranslationKey } from "@/lib/i18n";
import { DEMO_ROLES, type UserRole } from "@/lib/roles";

/**
 * The landing page is the first thing a citizen or a local judge reads, so it is translated in
 * full rather than left half-English. Every string lives in lib/i18n/{en,mr,hi}.ts.
 */

/**
 * The role descriptions in lib/roles.ts are English constants shared with the API layer, so the
 * cards translate through the dictionary instead of rendering `description`. A role with no key
 * falls back to that English sentence rather than showing a raw key.
 */
const ROLE_DESCRIPTION_KEY: Record<UserRole, TranslationKey | null> = {
  PARAMEDIC: "home.roleDesc.PARAMEDIC",
  HOSPITAL_COORDINATOR: "home.roleDesc.HOSPITAL_COORDINATOR",
  CONTROL_ROOM_OPERATOR: "home.roleDesc.CONTROL_ROOM_OPERATOR",
  BLOOD_BANK_OPERATOR: "home.roleDesc.BLOOD_BANK_OPERATOR",
  FAMILY_MEMBER: null,
  ADMIN: null,
};

export default function LandingPage() {
  const t = useT();

  return (
    <div className="space-y-10">
      <section className="grid gap-8 lg:grid-cols-5 lg:items-center">
        <div className="lg:col-span-3">
          <Badge tone="danger">{t("home.track")}</Badge>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{t("app.tagline")}</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">{t("home.lede")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/paramedic"
              className="inline-flex items-center rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700"
            >
              {t("home.ctaDemo")}
            </Link>
            <Link
              href="/control-room"
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              {t("home.ctaControlRoom")}
            </Link>
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("home.storyTitle")}</p>
            <ol className="mt-3 space-y-2 text-sm text-slate-700">
              <li className="flex gap-2"><span className="font-mono text-muted">23:20</span> {t("home.story1")}</li>
              <li className="flex gap-2"><span className="font-mono text-muted">23:34</span> {t("home.story2")}</li>
              <li className="flex gap-2"><span className="font-mono text-muted">00:09</span> {t("home.story3")}</li>
              <li className="flex gap-2"><span className="font-mono text-muted">01:10</span> {t("home.story4")}</li>
            </ol>
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {t("home.storyCost")}
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("home.rolesTitle")}</h2>
          {/*
            /demo-login had no link anywhere, so role enforcement was only discoverable by
            guessing the URL. The cards below still open each dashboard in one tap — the demo
            must not grow a login wall — and this is the way to the stricter path beside them.
          */}
          <Link
            href="/demo-login"
            className="text-sm font-semibold text-red-700 underline underline-offset-4 hover:text-red-800"
          >
            {t("demoLogin.link")}
          </Link>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">{t("home.signInPrompt")}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DEMO_ROLES.map((r) => {
            const nameKey = roleLabelKey(r.role);
            const descriptionKey = ROLE_DESCRIPTION_KEY[r.role];
            return (
              <Link
                key={r.href}
                href={r.href}
                className="group rounded-xl border border-border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow"
              >
                <p className="text-base font-semibold text-slate-900 group-hover:underline">
                  {nameKey === null ? r.label : t(nameKey)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {descriptionKey === null ? r.description : t(descriptionKey)}
                </p>
                <p className="mt-3 text-xs font-medium text-muted">{t("home.noLogin")}</p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
