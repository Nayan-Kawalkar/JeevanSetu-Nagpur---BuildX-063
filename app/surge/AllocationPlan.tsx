"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { SurgePlan } from "@/lib/services/surge";
import { FACILITY_TIER_LABEL, TRIAGE_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";
import { plannedOutcome, type NaiveOutcome } from "./naive";
import { TRIAGE_STYLE } from "./triage";

/**
 * THE CONTRAST.
 *
 * The single highest-value thing on this screen, so it sits at the top of the plan, in the
 * largest type on the page, with both sides computed from the same casualty list rather than
 * asserted. Left: what a nearest-hospital app does. Right: what allocating against a live
 * ledger does. Everything below is the evidence for the right-hand column.
 */
function Contrast({ plan, naive }: { plan: SurgePlan; naive: NaiveOutcome | null }) {
  const real = plannedOutcome(plan);
  return (
    <Card className="border-2 border-slate-900">
      <CardHeader
        title="Why this is not a nearest-hospital app"
        subtitle="Both columns computed from the same casualties, now."
      />
      <CardBody className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-red-800">Nearest-hospital app</p>
            {naive ? (
              <>
                <p className="mt-2 text-2xl font-bold leading-snug text-red-900 sm:text-3xl">
                  Sends {naive.patients} of {naive.totalPatients} patients to {naive.hospitalName}, which has{" "}
                  {naive.icuAvailable} free ICU {naive.icuAvailable === 1 ? "bed" : "beds"}.
                </p>
                <p className="mt-2 text-sm text-red-900">
                  It uses {naive.facilitiesUsed} {naive.facilitiesUsed === 1 ? "facility" : "facilities"} in total,
                  because every casualty is within a kilometre of every other casualty and none of them consults a
                  bed count.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-red-900">Log casualties to see what nearest-first would have done.</p>
            )}
          </div>
          <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">This plan</p>
            <p className="mt-2 text-2xl font-bold leading-snug text-emerald-900 sm:text-3xl">
              Uses {real.facilitiesUsed} {real.facilitiesUsed === 1 ? "facility" : "facilities"} and leaves trauma
              capacity for the {real.immediate} immediate {real.immediate === 1 ? "case" : "cases"}.
            </p>
            <p className="mt-2 text-sm text-emerald-900">
              {real.placed} placed, {real.unplaced} unplaced. Busiest facility: {real.busiestName} with{" "}
              {real.busiestPatients}.
            </p>
          </div>
        </div>
        <p className="text-xs text-muted">
          The left column is the actual nearest-facility rule applied to these casualties in the browser, not a
          strawman we stored. The right column is the plan below.
        </p>
      </CardBody>
    </Card>
  );
}

function UtilisationBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const tone = clamped >= 90 ? "bg-red-600" : clamped >= 70 ? "bg-amber-500" : "bg-emerald-600";
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-label="Utilisation"
        className="h-2.5 w-full min-w-[4rem] overflow-hidden rounded-full bg-slate-200"
      >
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${clamped}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700">{clamped}%</span>
    </div>
  );
}

/**
 * ACT 3 — the plan, before anything is committed.
 *
 * A preview. Nothing here has moved an ambulance: the distribution, the runs and the unplaced
 * list are what *would* happen, and applying it is a separate deliberate press.
 */
export function AllocationPlan({ plan, naive, applied }: { plan: SurgePlan; naive: NaiveOutcome | null; applied: number | null }) {
  const used = plan.loads.filter((l) => l.assigned > 0);
  const idle = plan.loads.length - used.length;
  const runs = plan.ambulanceRuns.filter((r) => r.trips.length > 0);

  return (
    <div className="space-y-4">
      <Contrast plan={plan} naive={naive} />

      <Card>
        <CardHeader
          title={applied === null ? "Proposed plan" : "Plan applied"}
          subtitle={
            applied === null
              ? "Preview only. Nothing has been dispatched and no bed has been held."
              : `${applied} ${applied === 1 ? "case" : "cases"} committed. Beds were re-checked at the moment of applying.`
          }
          action={<Badge tone={applied === null ? "info" : "success"}>{applied === null ? "Preview" : "Committed"}</Badge>}
        />
        <CardBody>
          <p className="text-lg font-medium leading-relaxed text-slate-900 sm:text-xl">{plan.narrative}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Distribution"
          subtitle="Load against real reported capacity. This is the bar that shows load spreading instead of stacking."
          action={
            <Badge tone="neutral">
              {used.length} used · {idle} untouched
            </Badge>
          }
        />
        <CardBody className="p-0">
          {plan.loads.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No facilities in the pool" description="Nothing to distribute against." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <caption className="sr-only">Patients assigned per facility with utilisation against capacity</caption>
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Facility
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Tier
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold">
                      Patients
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      ICU
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Beds
                    </th>
                    <th scope="col" className="w-48 px-4 py-2 font-semibold">
                      Utilisation
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {plan.loads.map((load) => (
                    <tr key={load.hospitalId} className={load.assigned === 0 ? "text-slate-500" : undefined}>
                      <th scope="row" className="px-4 py-2 text-left font-medium text-slate-900">
                        {load.name}
                      </th>
                      <td className="px-4 py-2 whitespace-nowrap text-xs">{FACILITY_TIER_LABEL[load.tier]}</td>
                      <td className="px-4 py-2 text-right text-base font-bold tabular-nums text-slate-900">
                        {load.assigned}
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        {load.icuUsed}/{load.icuTotal}
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        {load.bedsUsed}/{load.bedsTotal}
                      </td>
                      <td className="px-4 py-2">
                        <UtilisationBar percent={load.utilisationPercent} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Ambulance runs"
          subtitle="Four vehicles and this many patients means shuttle rounds, not one assignment each. Minutes are from now."
          action={<Badge tone="neutral">{runs.length} of {plan.ambulanceRuns.length} working</Badge>}
        />
        <CardBody className="space-y-3">
          {runs.length === 0 ? (
            <EmptyState title="No runs planned" description="No casualty in this plan needs a vehicle yet." />
          ) : (
            runs.map((run) => (
              <div key={run.ambulanceId} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-slate-900">{run.callSign}</p>
                  <p className="text-xs text-muted tabular-nums">
                    {run.trips.length} {run.trips.length === 1 ? "trip" : "trips"} · {run.totalMinutes} min of driving
                  </p>
                </div>
                <ol className="mt-2 space-y-1">
                  {run.trips.map((trip, i) => {
                    const style = TRIAGE_STYLE[trip.triage];
                    return (
                      <li key={`${trip.caseId}-${i}`} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="w-20 shrink-0 text-xs font-semibold tabular-nums text-slate-600">
                          +{trip.departAtMinute}→+{trip.returnAtMinute}
                        </span>
                        <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-bold ring-1 ring-inset", style.chip)}>
                          {trip.triage} · {TRIAGE_LABEL[trip.triage]}
                        </span>
                        <span className="text-slate-800">{trip.caseId}</span>
                        <span className="text-xs text-muted">→ {trip.hospitalId ?? "unassigned"}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <Card className={plan.unassigned.length > 0 ? "border-amber-300" : undefined}>
        <CardHeader
          title="Unplaced"
          subtitle="The honest output when the city has run out. This list is the trigger for standing a camp up."
          action={
            <Badge tone={plan.unassigned.length > 0 ? "warning" : "success"}>
              {plan.unassigned.length}
            </Badge>
          }
        />
        <CardBody className="space-y-3">
          {plan.unassigned.length === 0 ? (
            <p className="text-sm text-slate-700">Every casualty in this plan has a facility.</p>
          ) : (
            <>
              <ul className="divide-y divide-border">
                {plan.unassigned.map((u) => {
                  const style = TRIAGE_STYLE[u.triage];
                  return (
                    <li key={u.caseId} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                      <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-bold ring-1 ring-inset", style.chip)}>
                        {u.triage} · {TRIAGE_LABEL[u.triage]}
                      </span>
                      <span className="font-medium text-slate-900">{u.caseId}</span>
                      <span className="text-slate-700">{u.unassignedReason ?? u.reason}</span>
                    </li>
                  );
                })}
              </ul>
              <Link
                href={`/camps?unplaced=${encodeURIComponent(plan.unassigned.map((u) => u.caseId).join(","))}`}
                className="inline-flex min-h-11 items-center rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
              >
                Stand up a camp for these {plan.unassigned.length} patients
              </Link>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Every assignment, with its reason" subtitle="No recommendation without the sentence that justifies it." />
        <CardBody className="p-0">
          <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto">
            {plan.assignments.map((a) => {
              const style = TRIAGE_STYLE[a.triage];
              return (
                <li key={a.caseId} className="px-4 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-bold ring-1 ring-inset", style.chip)}>
                      {a.triage} · {TRIAGE_LABEL[a.triage]}
                    </span>
                    <span className="font-medium text-slate-900">{a.caseId}</span>
                    <span className="text-slate-800">→ {a.facilityName ?? "—"}</span>
                    {a.etaMinutes !== undefined && (
                      <span className="text-xs text-muted tabular-nums">{a.etaMinutes} min</span>
                    )}
                    {a.rung && <Badge tone="neutral">{a.rung}</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600">{a.reason}</p>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
