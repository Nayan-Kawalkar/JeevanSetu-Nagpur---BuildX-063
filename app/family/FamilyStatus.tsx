"use client";

/**
 * The family status page.
 *
 * Written for a frightened relative holding a cheap phone in the dark, not for staff. One
 * column, large type, short sentences, and every signal carried in words as well as in colour
 * so it survives a cracked screen, a sunlit windscreen and greyscale.
 *
 * What it will not do:
 *  - reassure ("he is fine") or alarm. It states facts the response team has recorded.
 *  - say anything clinical. Every medical question is pointed at the hospital's own phone line.
 *  - hint at why a link stopped working. Expired, revoked and never-existed look identical.
 *
 * It polls every five seconds and says, in words, when it last heard anything. The clock is
 * read through useNow, which is null on the server and on the first paint — so the absolute
 * time is always rendered and the "x min ago" is added only once a real clock exists.
 */

import type { ReactNode } from "react";
import { useT, useLocale, LanguageProvider } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { HttpError, useLive, useNow } from "@/lib/hooks";
import { formatTime } from "@/lib/utils";
import type { FamilyView } from "@/lib/services/family";
import { familyMilestoneText, familyStatusText, familyText, type FamilyStringKey } from "./strings";

/** Five seconds: fast enough that "en route" becomes "arrived" while they are still looking. */
const FAMILY_POLL_MS = 5000;

interface FamilyPayload {
  view: FamilyView;
}

/** Digits and a leading + only, so the dialler is handed something it can actually call. */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function FamilyStatus({ token }: { token: string }) {
  // The provider is mounted here rather than relying on the app shell: a relative arrives at
  // this URL from a message, having never seen the rest of the product.
  return (
    <LanguageProvider>
      <FamilyStatusInner token={token} />
    </LanguageProvider>
  );
}

function FamilyStatusInner({ token }: { token: string }) {
  const t = useT();
  const { locale } = useLocale();
  const ft = (key: FamilyStringKey, vars?: Record<string, string | number>) => familyText(locale, key, vars);

  const { data, error, isLoading } = useLive<FamilyPayload>(`/api/family/${encodeURIComponent(token)}`, {
    refreshInterval: FAMILY_POLL_MS,
  });

  const gone = error instanceof HttpError && (error.status === 404 || error.status === 400);
  if (gone && !data) return (
      <Shell>
        <Inactive title={ft("inactiveTitle")} body={ft("inactiveBody")} />
      </Shell>
    );
  if (!data) {
    if (isLoading) {
      return (
        <Shell>
          <p className="py-10 text-center text-xl text-slate-700" role="status">
            {ft("loading")}
          </p>
        </Shell>
      );
    }
    // Reached the page but not the service. Saying "link inactive" here would be a lie.
    return (
      <Shell>
        <p className="rounded-xl border-2 border-slate-400 bg-slate-50 px-4 py-4 text-xl leading-relaxed text-slate-900" role="status">
          {ft("stale")}
        </p>
      </Shell>
    );
  }

  const view = data.view;
  const bloodLine =
    view.blood === "ARRANGED"
      ? t("family.bloodArranged")
      : view.blood === "BEING_ARRANGED"
        ? t("family.bloodBeingArranged")
        : t("family.bloodNotRequested");

  return (
    <Shell>
      {/* If the link died while they were watching, the page says so without losing the last view. */}
      {gone && (
        <p className="rounded-xl border-2 border-slate-400 bg-slate-50 px-4 py-3 text-lg text-slate-900" role="status">
          {ft("inactiveTitle")}. {ft("inactiveBody")}
        </p>
      )}

      <section aria-labelledby="family-status-heading" className="rounded-xl border-2 border-slate-300 bg-white p-5">
        <h2 id="family-status-heading" className="text-base font-semibold uppercase tracking-wide text-slate-600">
          {t("family.status")}
        </h2>
        <p className="mt-1 text-3xl font-bold leading-tight text-slate-900">{familyStatusText(locale, view.status)}</p>
        <p className="mt-3 text-lg text-slate-700">
          <span className="font-semibold">{ft("severityLabel")}:</span> {t(`severity.${view.severity}`)}
        </p>
        <p className="mt-1 text-lg text-slate-700">
          <span className="font-semibold">{ft("reference")}:</span> {view.caseReference}
        </p>
      </section>

      <section aria-labelledby="family-hospital-heading" className="rounded-xl border-2 border-slate-300 bg-white p-5">
        <h2 id="family-hospital-heading" className="text-base font-semibold uppercase tracking-wide text-slate-600">
          {t("family.hospital")}
        </h2>
        {view.hospital ? (
          <>
            <p className="mt-1 text-2xl font-bold leading-tight text-slate-900">{view.hospital.name}</p>
            <p className="mt-1 text-lg leading-relaxed text-slate-700">{view.hospital.address}</p>
            <a
              href={telHref(view.hospital.phone)}
              className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-slate-900 px-5 py-3 text-lg font-semibold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-400 sm:w-auto"
            >
              {ft("callHospital")}: {view.hospital.phone}
            </a>
          </>
        ) : (
          <p className="mt-1 text-2xl font-semibold leading-tight text-slate-900">{t("family.noHospitalYet")}</p>
        )}
      </section>

      <section aria-labelledby="family-eta-heading" className="rounded-xl border-2 border-slate-300 bg-white p-5">
        <h2 id="family-eta-heading" className="text-base font-semibold uppercase tracking-wide text-slate-600">
          {t("family.arrivingIn")}
        </h2>
        <p className="mt-1 text-2xl font-bold text-slate-900">
          {view.etaMinutes === null
            ? ft("etaUnknown")
            : t("family.arrivingInMinutes", { minutes: view.etaMinutes })}
        </p>
        {view.etaMinutes !== null && <p className="mt-1 text-base text-slate-600">{ft("etaNote")}</p>}
      </section>

      <section aria-labelledby="family-blood-heading" className="rounded-xl border-2 border-slate-300 bg-white p-5">
        <h2 id="family-blood-heading" className="text-base font-semibold uppercase tracking-wide text-slate-600">
          {ft("bloodHeading")}
        </h2>
        <p className="mt-1 text-2xl font-semibold leading-tight text-slate-900">{bloodLine}</p>
      </section>

      <section aria-labelledby="family-history-heading" className="rounded-xl border-2 border-slate-300 bg-white p-5">
        <h2 id="family-history-heading" className="text-base font-semibold uppercase tracking-wide text-slate-600">
          {ft("milestonesHeading")}
        </h2>
        {view.milestones.length === 0 ? (
          <p className="mt-2 text-lg text-slate-700">{ft("noMilestones")}</p>
        ) : (
          <ol className="mt-3 space-y-4">
            {view.milestones.map((milestone) => (
              <li key={`${milestone.type}-${milestone.at}`} className="border-l-4 border-slate-300 pl-4">
                <p className="text-lg leading-relaxed text-slate-900">
                  {familyMilestoneText(locale, milestone.type)}
                </p>
                <p className="text-base text-slate-600">{formatTime(milestone.at)}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <LastUpdate iso={view.lastUpdatedAt} label={t("family.lastUpdate")} ft={ft} />

      <p className="text-base leading-relaxed text-slate-700">{t("family.note")}</p>
    </Shell>
  );
}

/**
 * "Last update", as an absolute time always and a relative one once a clock exists.
 *
 * The absolute time is never replaced by the relative one: on a page someone refreshes at
 * 3 a.m. to see whether anything moved, "02:41" is the fact and "12 min ago" is the comfort.
 */
function LastUpdate({
  iso,
  label,
  ft,
}: {
  iso: string;
  label: string;
  ft: (key: FamilyStringKey, vars?: Record<string, string | number>) => string;
}) {
  const now = useNow(30_000);
  const minutes = now === null ? null : Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  const relative = minutes === null ? null : minutes < 1 ? ft("justNow") : ft("minutesAgo", { minutes });

  return (
    <p className="text-lg text-slate-800" role="status">
      <span className="font-semibold">{label}:</span> {formatTime(iso)}
      {relative !== null && <span className="text-slate-600"> · {relative}</span>}
      <span className="mt-1 block text-base text-slate-600">{ft("autoRefresh")}</span>
    </p>
  );
}

/** The calm page for a link that no longer opens. It never says why. */
function Inactive({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-xl border-2 border-slate-300 bg-white p-6" role="status">
      <h2 className="text-2xl font-bold leading-tight text-slate-900">{title}</h2>
      <p className="mt-3 text-lg leading-relaxed text-slate-700">{body}</p>
    </section>
  );
}

/** One column, generous spacing, and the three framing lines every visit needs. */
function Shell({ children }: { children: ReactNode }) {
  const t = useT();
  const { locale } = useLocale();

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 py-2">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("family.pageTitle")}</h1>
          <LanguageSwitcher />
        </div>
        <p className="text-base leading-relaxed text-slate-700">{familyText(locale, "service")}</p>
        <p className="rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-2 text-base leading-relaxed text-amber-900">
          {familyText(locale, "demo")}
        </p>
        <p className="rounded-lg border-2 border-slate-300 bg-slate-50 px-3 py-2 text-base leading-relaxed text-slate-800">
          {familyText(locale, "clinical")}
        </p>
      </header>
      {children}
    </div>
  );
}
