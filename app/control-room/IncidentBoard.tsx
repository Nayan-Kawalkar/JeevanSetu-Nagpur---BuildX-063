"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { SeverityBadge, STATUS_LABEL, StatusBadge } from "@/components/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select } from "@/components/ui/field";
import type { CaseSummary } from "@/lib/services/overview";
import {
  ACTIVE_STATUSES,
  BLOOD_GROUP_LABEL,
  CASE_SEVERITIES,
  INCIDENT_LABEL,
  type CaseSeverity,
  type CaseStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { casePath, durationLabel, plural } from "./format";

/**
 * Every open case, in the order the overview service already put them in: worst severity
 * first, then longest open. The filters below only hide rows; they never re-sort, so the
 * board a room has learned to read stays where it was.
 *
 * Clinical notes are deliberately absent — see the note in the card header.
 */

type SeverityFilter = CaseSeverity | "ALL";
type StatusFilter = CaseStatus | "ALL";

export function IncidentBoard({ cases }: { cases: CaseSummary[] }) {
  const [severity, setSeverity] = useState<SeverityFilter>("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const severityId = useId();
  const statusId = useId();

  const visible = useMemo(
    () =>
      cases.filter(
        (c) => (severity === "ALL" || c.severity === severity) && (status === "ALL" || c.status === status),
      ),
    [cases, severity, status],
  );

  const severityCount = (value: CaseSeverity) => cases.filter((c) => c.severity === value).length;
  const statusCount = (value: CaseStatus) => cases.filter((c) => c.status === value).length;
  const filtered = severity !== "ALL" || status !== "ALL";

  return (
    <Card>
      <CardHeader
        title="Active incidents"
        subtitle="Worst and oldest first. Clinical notes are deliberately not shown on a shared display — they stay on the case page."
        action={
          <Badge tone={cases.length === 0 ? "neutral" : "dark"}>
            {filtered ? `${visible.length} of ${cases.length}` : plural(cases.length, "case")}
          </Badge>
        }
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Severity" htmlFor={severityId} className="min-w-[10rem] flex-1 sm:max-w-[16rem]">
            <Select
              id={severityId}
              value={severity}
              onChange={(e) => setSeverity(e.target.value as SeverityFilter)}
            >
              <option value="ALL">All severities ({cases.length})</option>
              {CASE_SEVERITIES.map((value) => (
                <option key={value} value={value}>
                  {value} ({severityCount(value)})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor={statusId} className="min-w-[12rem] flex-1 sm:max-w-[20rem]">
            <Select id={statusId} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
              <option value="ALL">All statuses ({cases.length})</option>
              {ACTIVE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABEL[value]} ({statusCount(value)})
                </option>
              ))}
            </Select>
          </Field>
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={!filtered}
            onClick={() => {
              setSeverity("ALL");
              setStatus("ALL");
            }}
          >
            Clear filters
          </Button>
        </div>
        <p className="text-xs text-muted" role="status">
          {filtered
            ? `Filter applied on this screen only: showing ${visible.length} of ${plural(cases.length, "open case")}.`
            : `Showing every open case (${cases.length}).`}
        </p>

        {cases.length === 0 ? (
          <EmptyState
            title="No active incidents."
            description="Nothing is open in the city right now. New cases appear here within three seconds of being created."
          />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No incident matches these filters."
            description="There are open cases, but none with the severity and status you picked."
            action={
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setSeverity("ALL");
                  setStatus("ALL");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            <IncidentTable cases={visible} />
            <IncidentCards cases={visible} />
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ---------- Desktop: one row per case ----------

const TH = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted";
const TD = "px-3 py-3 align-top text-sm text-slate-800";

function IncidentTable({ cases }: { cases: CaseSummary[] }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[60rem] border-collapse">
        <caption className="sr-only">
          Active incidents, most severe and longest open first. Clinical notes are not included.
        </caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={TH}>
              Case
            </th>
            <th scope="col" className={TH}>
              Severity
            </th>
            <th scope="col" className={TH}>
              Status
            </th>
            <th scope="col" className={TH}>
              Incident
            </th>
            <th scope="col" className={TH}>
              Location
            </th>
            <th scope="col" className={TH}>
              Open
            </th>
            <th scope="col" className={TH}>
              Destination
            </th>
            <th scope="col" className={TH}>
              ETA
            </th>
            <th scope="col" className={TH}>
              Ambulance
            </th>
            <th scope="col" className={TH}>
              Held
            </th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr
              key={c.id}
              className={cn(
                "border-b border-border last:border-b-0",
                c.severity === "CRITICAL" && "bg-red-50/70",
              )}
            >
              <th scope="row" className={cn(TD, "font-normal")}>
                <Link
                  href={casePath(c.id)}
                  className="inline-flex min-h-[44px] items-center rounded font-mono text-base font-semibold text-slate-900 underline underline-offset-4 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  {c.id}
                </Link>
                <span className="block font-mono text-xs text-muted">{c.tempPatientId}</span>
              </th>
              <td className={TD}>
                <SeverityBadge severity={c.severity} />
              </td>
              <td className={TD}>
                <StatusBadge status={c.status} />
              </td>
              <td className={TD}>
                {INCIDENT_LABEL[c.incidentType]}
                {c.bloodGroup && (
                  <span className="block text-xs text-muted">
                    Blood {BLOOD_GROUP_LABEL[c.bloodGroup]}
                    {c.bloodUnitsNeeded ? ` · ${plural(c.bloodUnitsNeeded, "unit")}` : ""}
                  </span>
                )}
              </td>
              <td className={cn(TD, "max-w-[14rem]")}>{c.locationLabel}</td>
              <td className={cn(TD, "tabular-nums")}>{durationLabel(c.minutesOpen)}</td>
              <td className={TD}>
                {c.hospitalName ?? <span className="text-amber-700">Not chosen yet</span>}
              </td>
              <td className={cn(TD, "tabular-nums")}>
                {c.etaMinutes === undefined ? (
                  <span className="text-muted">Not set</span>
                ) : (
                  <>
                    {c.etaMinutes} min
                    <span className="block text-xs text-muted">
                      {c.etaFrom === "AMBULANCE" ? "from ambulance" : "from scene"}
                    </span>
                  </>
                )}
              </td>
              <td className={TD}>
                {c.ambulanceCallSign ?? <span className="text-muted">Unassigned</span>}
              </td>
              <td className={cn(TD, "tabular-nums")}>
                {c.activeReservationCount === 0 ? (
                  <span className="text-muted">None</span>
                ) : (
                  plural(c.activeReservationCount, "hold")
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Below 768 px: one card per case ----------

function IncidentCards({ cases }: { cases: CaseSummary[] }) {
  return (
    <ul className="space-y-3 md:hidden">
      {cases.map((c) => (
        <li
          key={c.id}
          className={cn(
            "rounded-xl border border-border bg-white p-3",
            c.severity === "CRITICAL" && "border-red-300 bg-red-50",
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-semibold text-slate-900">{c.id}</span>
            <SeverityBadge severity={c.severity} />
            <StatusBadge status={c.status} />
          </div>
          <p className="mt-1 text-sm text-slate-800">
            {INCIDENT_LABEL[c.incidentType]} · {c.locationLabel}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <Detail label="Open" value={durationLabel(c.minutesOpen)} />
            <Detail label="Destination" value={c.hospitalName ?? "Not chosen yet"} />
            <Detail
              label="ETA"
              value={
                c.etaMinutes === undefined
                  ? "Not set"
                  : `${c.etaMinutes} min ${c.etaFrom === "AMBULANCE" ? "from ambulance" : "from scene"}`
              }
            />
            <Detail label="Ambulance" value={c.ambulanceCallSign ?? "Unassigned"} />
            <Detail
              label="Resources held"
              value={c.activeReservationCount === 0 ? "None" : plural(c.activeReservationCount, "hold")}
            />
            <Detail
              label="Blood"
              value={
                c.bloodGroup
                  ? `${BLOOD_GROUP_LABEL[c.bloodGroup]}${c.bloodUnitsNeeded ? ` · ${plural(c.bloodUnitsNeeded, "unit")}` : ""}`
                  : "Not recorded"
              }
            />
          </dl>
          <Link
            href={casePath(c.id)}
            className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
          >
            Open case {c.id}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-slate-900">{value}</dd>
    </div>
  );
}
