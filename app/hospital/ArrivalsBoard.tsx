"use client";

/**
 * Inbound patients with their clocks — Twist 4, hospital side.
 *
 * It sits at the top of the console because it answers the only question that is time-critical
 * at this desk: who is arriving, and how much of their first hour is left. Sorting is by least
 * time remaining, never by when the case was accepted.
 *
 * The pre-arrival checklist is deliberately **local component state**: there is no API behind
 * it and none is claimed. It is a working scratchpad for the receiving team during the run, it
 * resets on reload, and nothing it records is presented to the crew or written to the audit
 * trail. Persisting it would mean a hospital ticking "blood to bedside" became a record that
 * blood was at the bedside, and this build will not manufacture a clinical fact from a tick box.
 *
 * Coordination only. The checklist is a readiness prompt, not an instruction or a protocol.
 */

import { useState } from "react";
import { GoldenHourClock } from "@/components/GoldenHourClock";
import { SeverityBadge, StatusBadge } from "@/components/labels";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useNow } from "@/lib/hooks";
import { goldenHourStatus } from "@/lib/services/goldenHour";
import { TRIAGE_LABEL, type CaseStatus, type EmergencyCase } from "@/lib/types";

/** Still on the way: accepted here, or already rolling. Arrived cases leave the board. */
const INBOUND_STATUSES: readonly CaseStatus[] = ["ACCEPTED", "AMBULANCE_EN_ROUTE"];

/** The four things a receiving team gets ready before the doors open. */
const CHECKLIST = ["Trauma bay ready", "Blood to bedside", "CT slot held", "Specialist paged"] as const;

/** One tick, keyed by case and item, so two patients never share a checklist. */
function tickKey(caseId: string, item: string): string {
  return `${caseId}|${item}`;
}

/** Minutes this crew still expects to be travelling, as last ranked for this hospital. */
function etaFor(emergencyCase: EmergencyCase, hospitalId: string): number | undefined {
  return emergencyCase.lastMatch?.ranked.find((entry) => entry.hospitalId === hospitalId)?.etaMinutes;
}

export function ArrivalsBoard({
  hospitalId,
  cases,
}: {
  hospitalId: string;
  cases: Record<string, EmergencyCase>;
}) {
  const now = useNow(1000);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set<string>());

  const toggle = (key: string) => {
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const inbound = Object.values(cases).filter(
    (c) => c.hospitalId === hospitalId && INBOUND_STATUSES.includes(c.status),
  );

  // Least time remaining first. Before the clock arrives, the incident time is a stable
  // stand-in that gives the same order without reading the clock during render.
  const sorted = [...inbound].sort((a, b) => {
    if (now === null) {
      return Date.parse(a.incidentAt ?? a.createdAt) - Date.parse(b.incidentAt ?? b.createdAt);
    }
    return goldenHourStatus(a, now).remainingMinutes - goldenHourStatus(b, now).remainingMinutes;
  });

  return (
    <Card>
      <CardHeader
        title="Inbound now"
        subtitle="Patients on the way here, least time left in their first hour first. Refreshes every 3 seconds."
        action={<Badge tone={sorted.length > 0 ? "danger" : "neutral"}>{sorted.length} inbound</Badge>}
      />
      <CardBody className="space-y-3">
        {sorted.length === 0 ? (
          <EmptyState
            title="Nobody is on the way"
            description="Accepted patients appear here with a countdown and a pre-arrival checklist."
          />
        ) : (
          sorted.map((emergencyCase) => {
            const status = now === null ? null : goldenHourStatus(emergencyCase, now);
            const eta = etaFor(emergencyCase, hospitalId);
            const done = CHECKLIST.filter((item) => ticked.has(tickKey(emergencyCase.id, item))).length;
            return (
              <article
                key={emergencyCase.id}
                className="rounded-lg border border-border bg-surface px-3 py-2.5"
                aria-label={`Inbound case ${emergencyCase.id}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="dark">{emergencyCase.id}</Badge>
                    <SeverityBadge severity={emergencyCase.severity} />
                    {emergencyCase.triage !== undefined && (
                      <Badge tone={emergencyCase.triage === "RED" ? "danger" : "neutral"}>
                        Triage {TRIAGE_LABEL[emergencyCase.triage]}
                      </Badge>
                    )}
                    <StatusBadge status={emergencyCase.status} />
                  </div>
                  <GoldenHourClock
                    status={status}
                    startedAt={emergencyCase.incidentAt ?? emergencyCase.createdAt}
                    variant="compact"
                  />
                </div>

                <p className="mt-1 text-sm text-slate-700">
                  {emergencyCase.locationLabel} ·{" "}
                  {eta === undefined ? "travel time not ranked yet" : `about ${eta} min out`}
                  {emergencyCase.bloodGroup !== undefined &&
                    ` · blood ${emergencyCase.bloodGroup}${
                      emergencyCase.bloodUnitsNeeded === undefined ? "" : ` ×${emergencyCase.bloodUnitsNeeded}`
                    }`}
                </p>

                <fieldset className="mt-2">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Pre-arrival checklist — {done} of {CHECKLIST.length} ticked (this screen only, not shared)
                  </legend>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {CHECKLIST.map((item) => {
                      const key = tickKey(emergencyCase.id, item);
                      return (
                        <label
                          key={item}
                          className="inline-flex min-h-[32px] cursor-pointer items-center gap-2 text-sm text-slate-800"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-400 text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-900"
                            checked={ticked.has(key)}
                            onChange={() => toggle(key)}
                          />
                          <span className={ticked.has(key) ? "text-slate-500 line-through" : undefined}>{item}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </article>
            );
          })
        )}
      </CardBody>
    </Card>
  );
}
