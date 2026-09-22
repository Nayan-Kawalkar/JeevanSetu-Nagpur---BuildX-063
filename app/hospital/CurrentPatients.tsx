"use client";

import { useMemo } from "react";
import { SeverityBadge, StatusBadge } from "@/components/labels";
import { ResourceChips } from "@/components/ResourceChips";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  BLOOD_GROUP_LABEL,
  INCIDENT_LABEL,
  type CaseSeverity,
  type EmergencyCase,
} from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { reservationLabel } from "./holds";

/** Most urgent first: the desk reads this column top-down while the phone is ringing. */
const SEVERITY_ORDER: Record<CaseSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** "45, F" / "45" / "" — never invents a detail the crew did not record. */
function person(emergencyCase: EmergencyCase): string {
  const parts: string[] = [];
  if (emergencyCase.age !== undefined) parts.push(String(emergencyCase.age));
  if (emergencyCase.sex) parts.push(emergencyCase.sex);
  return parts.join(", ");
}

export function CurrentPatients({
  hospitalId,
  hospitalName,
  cases,
}: {
  hospitalId: string;
  hospitalName: string;
  cases: Record<string, EmergencyCase>;
}) {
  const patients = useMemo(
    () =>
      Object.values(cases)
        .filter((c) => c.hospitalId === hospitalId)
        .sort(
          (a, b) =>
            SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.updatedAt.localeCompare(a.updatedAt),
        ),
    [cases, hospitalId],
  );

  return (
    <section aria-labelledby="current-patients-heading">
      <Card>
        <CardHeader
          title={<span id="current-patients-heading">Patients routed here</span>}
          subtitle={`Cases ${hospitalName} has accepted, with what is being held for each of them.`}
        />
        <CardBody>
          {patients.length === 0 ? (
            <EmptyState
              title="No patients are on their way here."
              description="Once you accept a request, the patient appears here with their status and the resources held in their name."
            />
          ) : (
            <ul className="space-y-3">
              {patients.map((emergencyCase) => {
                const ranked = emergencyCase.lastMatch?.ranked.find((r) => r.hospitalId === hospitalId);
                const holds = emergencyCase.reservations.filter((r) => r.status === "ACTIVE");
                const who = person(emergencyCase);
                return (
                  <li
                    key={emergencyCase.id}
                    className="rounded-xl border border-border bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={emergencyCase.status} />
                      <SeverityBadge severity={emergencyCase.severity} />
                      <span className="font-mono text-xs text-muted">{emergencyCase.id}</span>
                    </div>

                    <h3 className="mt-1.5 text-base font-semibold text-slate-900">
                      {INCIDENT_LABEL[emergencyCase.incidentType]}
                      {who ? ` · ${who}` : ""}
                    </h3>
                    <p className="text-sm text-muted">Picked up at {emergencyCase.locationLabel}</p>

                    <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-border bg-slate-50 px-3 py-2">
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted">Travel time</dt>
                        <dd className="mt-0.5 text-sm text-slate-800">
                          {ranked ? (
                            <>
                              <span className="text-lg font-bold tabular-nums">{ranked.etaMinutes}</span> min
                              estimated, {ranked.distanceKm.toFixed(1)} km
                              {emergencyCase.lastMatch
                                ? ` · estimated at ${formatTime(emergencyCase.lastMatch.at)}`
                                : ""}
                            </>
                          ) : (
                            "No travel estimate on file for this case."
                          )}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-border bg-slate-50 px-3 py-2">
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted">Blood requested</dt>
                        <dd className="mt-0.5 text-sm text-slate-800">
                          {emergencyCase.bloodGroup
                            ? `${emergencyCase.bloodUnitsNeeded ?? 2} units ${BLOOD_GROUP_LABEL[emergencyCase.bloodGroup]}`
                            : "None recorded"}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">Held for this patient</p>
                      {holds.length === 0 ? (
                        <p className="mt-1 text-sm text-slate-600">
                          Nothing is being held right now — any earlier hold has been used or released.
                        </p>
                      ) : (
                        <ul className="mt-1 flex flex-wrap gap-1.5">
                          {holds.map((hold) => (
                            <li
                              key={hold.id}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800 ring-1 ring-inset ring-emerald-200"
                            >
                              <span aria-hidden>✓</span>
                              {reservationLabel(hold)} · until {formatTime(hold.expiresAt)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="mt-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">
                        What this patient needs
                      </p>
                      <div className="mt-1">
                        <ResourceChips requirements={emergencyCase.requirements} size="sm" />
                      </div>
                    </div>

                    {emergencyCase.notes && (
                      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700">
                        {emergencyCase.notes}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </section>
  );
}
