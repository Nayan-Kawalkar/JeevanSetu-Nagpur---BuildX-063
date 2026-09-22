"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { HospitalWithFreshness } from "@/app/api/hospitals/route";
import { FreshnessLabel } from "@/components/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage, useLive } from "@/lib/hooks";
import {
  ACTIVE_STATUSES,
  RESOURCE_LABEL,
  SPECIALIST_TYPES,
  type EmergencyCase,
  type HospitalRequest,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/** The hospital the scripted Rohan demo routes to, called out so a judge opens the right console. */
const DEMO_HOSPITAL_ID = "H2";
const DEMO_HOSPITAL_NAME = "Wardha Road Trauma & Neuro Centre";

interface HospitalsResponse {
  hospitals: HospitalWithFreshness[];
}

interface PendingResponse {
  requests: HospitalRequest[];
  cases: Record<string, EmergencyCase>;
}

/** How many requests this hospital has not answered yet, and whether any of them is critical. */
interface Waiting {
  total: number;
  critical: number;
}

const TYPE_LABEL: Record<HospitalWithFreshness["type"], string> = {
  GOVERNMENT: "Government",
  PRIVATE: "Private",
};

/**
 * One countable resource as a number plus the words for it.
 *
 * "0 of 8" is read as a typo at a glance in a dark ambulance bay; "None free right now" is not,
 * which is why the zero case is spelled out in words as well as marked in red.
 */
function CountBlock({ label, available, total }: { label: string; available: number; total: number }) {
  if (total === 0) {
    return (
      <div className="rounded-lg border border-border bg-slate-50 px-3 py-2">
        <p className="text-xs text-muted">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-slate-500">Not available here</p>
      </div>
    );
  }
  const none = available === 0;
  return (
    <div className={cn("rounded-lg border px-3 py-2", none ? "border-red-300 bg-red-50" : "border-border bg-white")}>
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("mt-0.5 text-sm", none ? "text-red-800" : "text-slate-800")}>
        <span className="text-xl font-bold tabular-nums">{available}</span> of {total} free
      </p>
      {none && <p className="text-xs font-semibold text-red-700">None free right now</p>}
    </div>
  );
}

export function HospitalPicker() {
  const hospitals = useLive<HospitalsResponse>("/api/hospitals");
  // The queue is polled separately so a coordinator can see at a glance which desk is being
  // asked for something before they pick one. If it fails, the cards still work.
  const pending = useLive<PendingResponse>("/api/requests?status=PENDING");

  const waiting = useMemo(() => {
    const map = new Map<string, Waiting>();
    const data = pending.data;
    if (!data) return map;
    for (const request of data.requests) {
      const current = map.get(request.hospitalId) ?? { total: 0, critical: 0 };
      const referenced: EmergencyCase | undefined = data.cases[request.caseId];
      // A cancelled case can leave its request open, so it is still counted as waiting for an
      // answer but never raises the critical alarm for a patient who is no longer coming.
      const isCritical =
        referenced?.severity === "CRITICAL" && ACTIVE_STATUSES.includes(referenced.status);
      map.set(request.hospitalId, {
        total: current.total + 1,
        critical: current.critical + (isCritical ? 1 : 0),
      });
    }
    return map;
  }, [pending.data]);

  const list = hospitals.data?.hospitals ?? [];
  const demoName = list.find((h) => h.id === DEMO_HOSPITAL_ID)?.name ?? DEMO_HOSPITAL_NAME;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Hospital coordinator</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
          Open your hospital to answer incoming requests and confirm what you actually have free. Every number below
          is one a person typed in, shown with the time they typed it — this board coordinates, it does not measure.
        </p>
      </header>

      <aside className="rounded-xl border border-sky-200 bg-sky-50 p-4">
        <p className="text-sm font-semibold text-sky-900">
          <span aria-hidden>▶</span> Following the scripted demo?
        </p>
        <p className="mt-1 text-sm text-sky-900">
          The Rohan walkthrough sends its request to <strong>{DEMO_HOSPITAL_ID} {demoName}</strong>. Open that console
          before the paramedic presses send.
        </p>
        <Link
          href={`/hospital/${DEMO_HOSPITAL_ID}`}
          className="mt-3 inline-flex min-h-[44px] items-center rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
        >
          Open {DEMO_HOSPITAL_ID} {demoName}
        </Link>
      </aside>

      {pending.error && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span aria-hidden>⚠</span> Waiting-request counts could not be loaded ({errorMessage(pending.error)}). Open a
          hospital to see its own queue.
        </p>
      )}

      {hospitals.error ? (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-800">The hospital directory could not be loaded.</p>
          <p className="mt-1 text-sm text-red-700">{errorMessage(hospitals.error)}</p>
          <Button className="mt-3" size="lg" variant="danger" onClick={() => void hospitals.mutate()}>
            Try again
          </Button>
        </div>
      ) : hospitals.isLoading && list.length === 0 ? (
        <div className="py-10">
          <Spinner label="Loading hospitals" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          title="No hospitals on the board"
          description="The directory is empty. Reset the demo data from the control room to seed the six Nagpur hospitals again."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((hospital) => {
            const queue = waiting.get(hospital.id);
            const onCall = SPECIALIST_TYPES.filter((s) => hospital.specialists[s].onCall);
            const offCall = SPECIALIST_TYPES.filter((s) => !hospital.specialists[s].onCall);
            return (
              <li key={hospital.id}>
                <Link
                  href={`/hospital/${hospital.id}`}
                  className={cn(
                    "flex h-full flex-col rounded-xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2",
                    queue && queue.critical > 0 ? "border-red-400" : "border-border hover:border-slate-400",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold leading-tight text-slate-900">{hospital.name}</h2>
                      <p className="mt-0.5 text-sm text-muted">
                        <span className="font-mono text-xs">{hospital.id}</span> · {hospital.area}
                      </p>
                    </div>
                    <Badge tone={hospital.type === "GOVERNMENT" ? "info" : "neutral"}>
                      {TYPE_LABEL[hospital.type]}
                    </Badge>
                  </div>

                  {queue && queue.total > 0 && (
                    <p
                      className={cn(
                        "mt-3 rounded-lg px-3 py-2 text-sm font-semibold",
                        queue.critical > 0 ? "bg-red-600 text-white" : "bg-amber-100 text-amber-900",
                      )}
                    >
                      <span aria-hidden>{queue.critical > 0 ? "⚠ " : "● "}</span>
                      {queue.total} {queue.total === 1 ? "request is" : "requests are"} waiting for an answer
                      {queue.critical > 0 ? ` · ${queue.critical} critical` : ""}
                    </p>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <CountBlock
                      label={RESOURCE_LABEL.ICU}
                      available={hospital.resources.ICU.available}
                      total={hospital.resources.ICU.total}
                    />
                    <CountBlock
                      label={RESOURCE_LABEL.EMERGENCY_BED}
                      available={hospital.resources.EMERGENCY_BED.available}
                      total={hospital.resources.EMERGENCY_BED.total}
                    />
                  </div>

                  <div className="mt-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">On call now</p>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {onCall.map((s) => (
                        <li
                          key={s}
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800 ring-1 ring-inset ring-emerald-200"
                        >
                          <span aria-hidden>✓</span>
                          {RESOURCE_LABEL[s]}
                          {hospital.specialists[s].name ? ` · ${hospital.specialists[s].name}` : ""}
                        </li>
                      ))}
                      {offCall.map((s) => (
                        <li
                          key={s}
                          className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 ring-1 ring-inset ring-slate-200"
                        >
                          <span aria-hidden>✕</span>
                          {RESOURCE_LABEL[s]} not on call
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
                    <FreshnessLabel
                      lastUpdatedAt={hospital.lastUpdatedAt}
                      stale={hospital.stale}
                      updatedBy={hospital.updatedBy}
                    />
                    {hospital.stale && (
                      <Badge tone="danger">
                        <span aria-hidden>⚠</span> Needs updating
                      </Badge>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
