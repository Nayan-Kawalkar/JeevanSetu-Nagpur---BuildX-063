"use client";

import Link from "next/link";
import { useMemo } from "react";
import { SeverityBadge, StatusBadge } from "@/components/labels";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage, useLive, useNow } from "@/lib/hooks";
import {
  ACTIVE_STATUSES,
  INCIDENT_LABEL,
  type CaseSeverity,
  type EmergencyCase,
  type Hospital,
} from "@/lib/types";
import { formatTime } from "@/lib/utils";

/** Most urgent first inside the active group; the crew reads top-down under pressure. */
const SEVERITY_ORDER: Record<CaseSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/**
 * How long a case has been open, in words.
 *
 * `now` is null on the server and for the first paint (see useNow), so the honest fallback is
 * the absolute start time rather than a duration measured against a clock we have not read yet.
 */
function openLabel(createdAt: string, now: number | null): string {
  if (now === null) return `opened ${formatTime(createdAt)}`;
  const minutes = Math.max(0, Math.round((now - new Date(createdAt).getTime()) / 60_000));
  if (minutes < 1) return "open under a minute";
  if (minutes < 60) return `open ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `open ${hours} h` : `open ${hours} h ${rest} min`;
}

export function ParamedicCaseList() {
  const cases = useLive<{ cases: EmergencyCase[] }>("/api/cases");
  // Cases carry a hospitalId, not a name. The directory is polled alongside so a card can say
  // where the patient is going; if it fails, the card degrades to the id rather than going blank.
  const hospitals = useLive<{ hospitals: Hospital[] }>("/api/hospitals");
  const now = useNow(30_000);

  const hospitalNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const hospital of hospitals.data?.hospitals ?? []) map.set(hospital.id, hospital.name);
    return map;
  }, [hospitals.data]);

  const { active, earlier } = useMemo(() => {
    const all = cases.data?.cases ?? [];
    const isActive = (c: EmergencyCase) => ACTIVE_STATUSES.includes(c.status);
    return {
      active: all
        .filter(isActive)
        .slice()
        .sort(
          (a, b) =>
            SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      earlier: all
        .filter((c) => !isActive(c))
        .slice()
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    };
  }, [cases.data]);

  if (cases.error && !cases.data) {
    return (
      <Card>
        <CardBody className="space-y-3">
          <p role="alert" className="text-sm font-medium text-red-700">
            <span aria-hidden>⚠ </span>
            Could not load the case list. {errorMessage(cases.error)}
          </p>
          <Button variant="secondary" onClick={() => void cases.mutate()}>
            Try again
          </Button>
        </CardBody>
      </Card>
    );
  }

  if (!cases.data) {
    return (
      <Card>
        <CardBody>
          <Spinner label="Loading cases" />
        </CardBody>
      </Card>
    );
  }

  if (active.length === 0 && earlier.length === 0) {
    return (
      <EmptyState
        title="No cases yet"
        description="Nothing is open for this crew. Start the first one and the control room and hospitals see it straight away."
        action={
          <Link
            href="/paramedic/cases/new"
            className="inline-flex min-h-[48px] items-center rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
          >
            Create the first case
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {cases.error && (
        <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
          <span aria-hidden>⚠ </span>
          Live updates paused — showing the last list that loaded. {errorMessage(cases.error)}
        </p>
      )}

      <section aria-labelledby="active-cases-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="active-cases-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Active now
          </h2>
          <span className="text-xs text-muted">{active.length} open</span>
        </div>
        {active.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-muted">
            Nothing open right now.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {active.map((emergencyCase) => (
              <CaseRow
                key={emergencyCase.id}
                emergencyCase={emergencyCase}
                hospitalName={
                  emergencyCase.hospitalId
                    ? (hospitalNames.get(emergencyCase.hospitalId) ?? emergencyCase.hospitalId)
                    : undefined
                }
                now={now}
              />
            ))}
          </ul>
        )}
      </section>

      {earlier.length > 0 && (
        <section aria-labelledby="earlier-cases-heading">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="earlier-cases-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Earlier today
            </h2>
            <span className="text-xs text-muted">{earlier.length} finished</span>
          </div>
          <ul className="mt-2 space-y-2">
            {earlier.map((emergencyCase) => (
              <CaseRow
                key={emergencyCase.id}
                emergencyCase={emergencyCase}
                hospitalName={
                  emergencyCase.hospitalId
                    ? (hospitalNames.get(emergencyCase.hospitalId) ?? emergencyCase.hospitalId)
                    : undefined
                }
                now={now}
                quiet
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CaseRow({
  emergencyCase,
  hospitalName,
  now,
  quiet = false,
}: {
  emergencyCase: EmergencyCase;
  hospitalName?: string;
  now: number | null;
  quiet?: boolean;
}) {
  return (
    <li>
      <Link
        href={`/paramedic/cases/${emergencyCase.id}`}
        className={
          quiet
            ? "block rounded-xl border border-border bg-slate-50 px-4 py-3 transition-colors hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
            : "block rounded-xl border border-border bg-surface px-4 py-4 shadow-sm transition-colors hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={emergencyCase.severity} />
          <StatusBadge status={emergencyCase.status} />
          <span className="ml-auto text-xs font-medium text-muted">
            {quiet ? `opened ${formatTime(emergencyCase.createdAt)}` : openLabel(emergencyCase.createdAt, now)}
          </span>
        </div>

        <p className={quiet ? "mt-2 text-sm font-semibold text-slate-700" : "mt-2 text-base font-semibold text-slate-900"}>
          {INCIDENT_LABEL[emergencyCase.incidentType]}
        </p>
        <p className="mt-0.5 text-sm text-slate-600">{emergencyCase.locationLabel}</p>

        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
          <div>
            <dt className="inline">Patient id: </dt>
            <dd className="inline font-mono text-slate-700">{emergencyCase.tempPatientId}</dd>
          </div>
          <div>
            <dt className="inline">Hospital: </dt>
            <dd className="inline text-slate-700">{hospitalName ?? "not chosen yet"}</dd>
          </div>
        </dl>
      </Link>
    </li>
  );
}
