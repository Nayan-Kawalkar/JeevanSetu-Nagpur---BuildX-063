"use client";

/**
 * The golden hour, at the top of the case page — Twist 4.
 *
 * It sits above hospital matching on purpose: the hour frames every other decision on this
 * screen, and a countdown discovered after the ranking has already been read is a countdown
 * that changed nothing.
 *
 * Three things, in the order a crew needs them:
 *   1. the clock;
 *   2. where the hour actually went, drawn from the real event log — the argument that most of
 *      the hour is lost to coordination, not to driving. Anything we cannot evidence is drawn
 *      as an honest grey gap and labelled "not measured", never invented;
 *   3. one plain next action, coordination only.
 *
 * It also surfaces time to definitive care, because "five minutes further but ready now" is
 * the whole twist in one sentence. The ranking cards themselves belong to another component;
 * the callout lives here.
 *
 * Safety boundary: coordination and decision support only. No diagnosis, no prescription, no
 * promise about an outcome. Every line states the fact it is derived from.
 */

import { GoldenHourClock, clockTime } from "@/components/GoldenHourClock";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { useLive, useNow } from "@/lib/hooks";
import { carePhases, goldenHourStatus, projectedArrival, type PhaseSpan } from "@/lib/services/goldenHour";
import type { TimedMatchResult, TimedRankedHospital } from "@/lib/services/matching";
import {
  CARE_PHASE_LABEL,
  GOLDEN_HOUR_MINUTES,
  RESOURCE_LABEL,
  type CarePhase,
  type CaseStatus,
  type EmergencyCase,
  type EmergencyEvent,
  type Hospital,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/** GET /api/cases/:id/match — the same shape the matching panel reads, with the timed fields. */
interface TimedMatchPayload {
  match: TimedMatchResult;
  hospitals: Record<string, Hospital>;
}

/** One colour per phase. Each segment is also labelled, so colour is never the only signal. */
const PHASE_FILL: Record<CarePhase, string> = {
  DETECTION: "bg-slate-400",
  DISPATCH: "bg-sky-500",
  TO_SCENE: "bg-indigo-500",
  ON_SCENE: "bg-violet-500",
  TO_HOSPITAL: "bg-teal-500",
  HANDOVER: "bg-emerald-600",
};

/**
 * When handover was recorded for this case, in epoch ms, or null while it has not happened.
 *
 * Used as a frozen "now" so the countdown stops at the moment the receiving team took the
 * patient instead of ticking on against a case that is finished.
 */
function handoverTime(caseId: string, events: EmergencyEvent[]): number | null {
  let earliest: number | null = null;
  for (const event of events) {
    if (event.caseId !== caseId || event.type !== "HANDOVER_COMPLETED") continue;
    const at = Date.parse(event.at);
    if (Number.isNaN(at)) continue;
    if (earliest === null || at < earliest) earliest = at;
  }
  return earliest;
}

/** Statuses past the point where a projected arrival still means anything. */
const ARRIVED_STATUSES: readonly CaseStatus[] = ["ARRIVED", "HANDOVER_COMPLETED", "CLOSED", "CANCELLED"];

interface Segment {
  key: string;
  label: string;
  minutes: number;
  fill: string;
  measured: boolean;
}

/**
 * Turns the evidenced phases into bar segments against the full sixty minutes.
 *
 * Two kinds of honest gap can appear. Elapsed time that no phase accounts for is "not
 * measured" — we have no event for it and will not guess. Time still unspent is "still
 * available", which is the part the crew can still use.
 */
function segmentsFor(spans: PhaseSpan[], elapsedMinutes: number): Segment[] {
  const segments: Segment[] = spans
    .filter((span) => span.minutes > 0)
    .map((span) => ({
      key: span.phase,
      label: CARE_PHASE_LABEL[span.phase],
      minutes: span.minutes,
      fill: PHASE_FILL[span.phase],
      measured: true,
    }));

  const accounted = segments.reduce((total, segment) => total + segment.minutes, 0);
  const unmeasured = Math.max(0, elapsedMinutes - accounted);
  if (unmeasured > 0) {
    segments.push({
      key: "UNMEASURED",
      label: "Not measured",
      minutes: unmeasured,
      fill: "bg-slate-300",
      measured: false,
    });
  }
  return segments;
}

/** Percentage of the hour one span occupies, so segments past sixty minutes still fit the bar. */
function widthPercent(minutes: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(1.5, (minutes / total) * 100);
}

/**
 * The readiness callout: where waiting for a resource, not distance, changed the ordering.
 *
 * Compares the recommended hospital with the one that is simply nearest. If they differ and
 * the recommendation wins on time to definitive care, that sentence is the twist.
 */
function readinessCallout(
  ranked: TimedRankedHospital[],
  hospitals: Record<string, Hospital>,
): string | undefined {
  if (ranked.length < 2) return undefined;
  const recommended = ranked[0];
  const nearest = ranked.reduce((best, entry) => (entry.etaMinutes < best.etaMinutes ? entry : best), ranked[0]);
  if (nearest.hospitalId === recommended.hospitalId) return undefined;
  if (nearest.timeToDefinitiveCare <= recommended.timeToDefinitiveCare) return undefined;

  const recommendedName = hospitals[recommended.hospitalId]?.name ?? recommended.hospitalId;
  const nearestName = hospitals[nearest.hospitalId]?.name ?? nearest.hospitalId;
  const further = Math.max(0, recommended.etaMinutes - nearest.etaMinutes);
  const blocker = nearest.readinessBlocker === undefined ? "what this patient needs" : RESOURCE_LABEL[nearest.readinessBlocker];

  return `${recommendedName} is ${further} min further to drive than ${nearestName}, but ${nearestName} reports ${nearest.readinessDelayMinutes} min until ${blocker} is usable. Treatment can start ${Math.max(0, nearest.timeToDefinitiveCare - recommended.timeToDefinitiveCare)} min sooner at ${recommendedName} (${recommended.timeToDefinitiveCare} min vs ${nearest.timeToDefinitiveCare} min).`;
}

export function GoldenHourPanel({
  emergencyCase,
  events,
  confirmedHospital,
}: {
  emergencyCase: EmergencyCase;
  events: EmergencyEvent[];
  confirmedHospital?: Hospital;
}) {
  const now = useNow(1000);
  // The ranking is only needed for the timing numbers, so it polls far more slowly than the
  // matching panel's own read; both hit the same recompute-on-read endpoint.
  const match = useLive<TimedMatchPayload>(`/api/cases/${encodeURIComponent(emergencyCase.id)}/match`, {
    refreshInterval: 15000,
  });

  const startedAt = emergencyCase.incidentAt ?? emergencyCase.createdAt;
  // The hour is a target for getting the patient to definitive care, so it stops at handover.
  // Left running it would keep burning minutes against a patient who is already on the table.
  const stoppedAt = handoverTime(emergencyCase.id, events);
  const clockNow = stoppedAt ?? now;
  const status = clockNow === null ? null : goldenHourStatus(emergencyCase, clockNow);
  const spans = clockNow === null ? [] : carePhases(emergencyCase, events, clockNow);
  const elapsed = status?.elapsedMinutes ?? 0;
  const segments = segmentsFor(spans, elapsed);
  const barTotal = Math.max(GOLDEN_HOUR_MINUTES, elapsed);
  const remainingOnBar = Math.max(0, barTotal - elapsed);

  const ranked = match.data?.match.ranked ?? [];
  const confirmedRank = confirmedHospital
    ? ranked.find((entry) => entry.hospitalId === confirmedHospital.id)
    : undefined;
  const timeToCare = confirmedRank?.timeToDefinitiveCare;
  // Once the crew is at the door there is nothing left to project, and a countdown to an arrival
  // that already happened is worse than no countdown at all.
  const alreadyThere: boolean = ARRIVED_STATUSES.includes(emergencyCase.status);
  const arrival =
    !alreadyThere && now !== null && timeToCare !== undefined
      ? projectedArrival(emergencyCase, timeToCare, now)
      : undefined;

  const callout = match.data ? readinessCallout(ranked, match.data.hospitals) : undefined;

  /** One line, coordination only: what moves the clock next. Never clinical. */
  let nextAction: string;
  if (emergencyCase.status === "CANCELLED") {
    nextAction = "Case cancelled. The clock is stopped.";
  } else if (emergencyCase.status === "CLOSED" || emergencyCase.status === "HANDOVER_COMPLETED") {
    nextAction = `Handover complete${confirmedHospital ? ` at ${confirmedHospital.name}` : ""}. The clock stops here — ${elapsed} of the first 60 minutes were used.`;
  } else if (emergencyCase.status === "ARRIVED") {
    nextAction = `Arrived${confirmedHospital ? ` at ${confirmedHospital.name}` : ""}. Handover is the last step on this clock — record it once the receiving team has the patient.`;
  } else if (emergencyCase.status === "AMBULANCE_EN_ROUTE" && confirmedHospital && arrival) {
    const left = arrival.minutesLeftOnArrival;
    nextAction =
      left >= 0
        ? `En route to ${confirmedHospital.name}. Arrival leaves ${left} of the first hour. Record arrival when you reach the door.`
        : `En route to ${confirmedHospital.name}. Arrival is ${Math.abs(left)} minutes past the first hour — tell the receiving team so they are ready on arrival.`;
  } else if (confirmedHospital && arrival) {
    const left = arrival.minutesLeftOnArrival;
    nextAction =
      left >= 0
        ? `${confirmedHospital.name} confirmed. Depart now. ${timeToCare ?? 0} minutes to treatment leaves ${left} of the first hour.`
        : `${confirmedHospital.name} confirmed. Depart now. ${timeToCare ?? 0} minutes to treatment puts arrival ${Math.abs(left)} minutes past the first hour — tell the receiving team so they are ready on arrival.`;
  } else if (confirmedHospital) {
    nextAction = `${confirmedHospital.name} confirmed. Depart now and record the departure so the arrivals board can count down.`;
  } else if (status?.band === "CRITICAL" || status?.expired === true) {
    nextAction = "No hospital confirmed. Choosing a destination is now the blocker on this clock — pick from the ranking below or call the control room.";
  } else {
    nextAction = "No hospital confirmed yet. Send a request from the ranking below; every minute spent deciding is a minute off the hour.";
  }

  const sourceNote =
    emergencyCase.incidentAt === undefined
      ? "Measured from when the case was opened — the injury time was not recorded, so the real hour started earlier."
      : "Measured from the recorded time of injury.";

  return (
    <Card>
      <CardHeader
        title="First hour"
        subtitle="A coordination target, not a clinical limit. Care still matters after sixty minutes."
      />
      <CardBody className="space-y-5">
        <GoldenHourClock
          status={status}
          startedAt={startedAt}
          stoppedAt={stoppedAt ?? undefined}
          variant="large"
          sourceNote={sourceNote}
        />

        <section aria-labelledby="where-the-hour-went" className="space-y-2">
          <h3 id="where-the-hour-went" className="text-sm font-semibold text-slate-900">
            Where the hour went
          </h3>
          {segments.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing has been timed yet. The first span appears once the case has been open long enough to
              measure.
            </p>
          ) : (
            <>
              <div
                aria-hidden
                className="flex h-6 w-full overflow-hidden rounded-md bg-slate-100 ring-1 ring-inset ring-border"
              >
                {segments.map((segment) => (
                  <div
                    key={segment.key}
                    className={cn(segment.fill, !segment.measured && "opacity-70")}
                    style={{ width: `${widthPercent(segment.minutes, barTotal)}%` }}
                    title={`${segment.label}: ${segment.minutes} min`}
                  />
                ))}
                {remainingOnBar > 0 && (
                  <div className="bg-slate-50" style={{ width: `${widthPercent(remainingOnBar, barTotal)}%` }} />
                )}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {segments.map((segment) => (
                  <li key={segment.key} className="inline-flex items-center gap-1.5">
                    <span aria-hidden className={cn("h-2.5 w-2.5 rounded-sm", segment.fill)} />
                    <span className={segment.measured ? "text-slate-700" : "text-slate-500 italic"}>
                      {segment.label}
                    </span>
                    <span className="font-semibold tabular-nums text-slate-900">{segment.minutes} min</span>
                  </li>
                ))}
                {remainingOnBar > 0 && (
                  <li className="inline-flex items-center gap-1.5 text-slate-500">
                    <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-slate-200 ring-1 ring-inset ring-border" />
                    still available
                    <span className="font-semibold tabular-nums text-slate-700">{remainingOnBar} min</span>
                  </li>
                )}
              </ul>
              <p className="text-xs text-muted">
                Spans are read from the event log. Time with no event behind it is shown as “not measured”
                rather than estimated.
              </p>
            </>
          )}
        </section>

        {arrival && confirmedHospital && (
          <section aria-labelledby="projected-arrival" className="rounded-lg border border-border bg-slate-50 px-3 py-2">
            <h3 id="projected-arrival" className="text-sm font-semibold text-slate-900">
              On arrival at {confirmedHospital.name}
            </h3>
            <p className="mt-0.5 text-sm text-slate-700">
              {arrival.withinGoldenHour
                ? `Arrives ${clockTime(arrival.arrivesAt)}, ${arrival.minutesLeftOnArrival} minutes of the first hour remaining.`
                : `Arrives ${clockTime(arrival.arrivesAt)}, ${Math.abs(arrival.minutesLeftOnArrival)} minutes past the first hour.`}
              {confirmedRank !== undefined && confirmedRank.readinessDelayMinutes > 0 && (
                <>
                  {" "}
                  Travel is {confirmedRank.etaMinutes} min; a further {confirmedRank.readinessDelayMinutes} min
                  until{" "}
                  {confirmedRank.readinessBlocker === undefined
                    ? "the resource needed"
                    : RESOURCE_LABEL[confirmedRank.readinessBlocker]}{" "}
                  is usable, so time to definitive care is {confirmedRank.timeToDefinitiveCare} min.
                </>
              )}
            </p>
          </section>
        )}

        {callout && (
          <section aria-labelledby="readiness-callout" className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
            <h3 id="readiness-callout" className="text-sm font-semibold text-sky-900">
              Readiness changed the order
            </h3>
            <p className="mt-0.5 text-sm text-sky-900">{callout}</p>
            <p className="mt-1 text-xs text-sky-800">
              Ranking is on time to definitive care — travel plus how long until the thing this patient needs
              is actually usable.
            </p>
          </section>
        )}

        <p className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900">
          <span className="font-semibold">Next action: </span>
          {nextAction}
        </p>
      </CardBody>
    </Card>
  );
}
