"use client";

import { SeverityBadge, StatusBadge } from "@/components/labels";
import { Card, CardBody } from "@/components/ui/card";
import { useNow } from "@/lib/hooks";
import { INCIDENT_LABEL, type Ambulance, type EmergencyCase } from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { elapsedLabel, patientLine } from "./format";

/**
 * Who this is, what happened, how urgent it is and how long they have been waiting.
 *
 * No name appears anywhere: on scene nobody knows it, and a screen that showed one would be
 * showing an invention. The temporary id is the only identifier, and it is the one the
 * receiving hospital will be given.
 */
export function PatientHeader({
  emergencyCase,
  ambulance,
}: {
  emergencyCase: EmergencyCase;
  ambulance?: Ambulance;
}) {
  const now = useNow(1000);

  return (
    <Card>
      <CardBody className="space-y-3 py-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Temporary patient id</p>
            <h1 className="font-mono text-2xl font-bold leading-tight text-slate-900">
              {emergencyCase.tempPatientId}
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              Case {emergencyCase.id} · no patient name is recorded on scene
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={emergencyCase.severity} />
            <StatusBadge status={emergencyCase.status} />
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Incident" value={INCIDENT_LABEL[emergencyCase.incidentType]} />
          <Fact label="Patient" value={patientLine(emergencyCase)} />
          <Fact
            label="Location"
            value={emergencyCase.locationLabel}
            hint={`${emergencyCase.lat.toFixed(4)}, ${emergencyCase.lng.toFixed(4)}`}
          />
          <Fact
            label="Time since call"
            value={now === null ? `opened ${formatTime(emergencyCase.createdAt)}` : elapsedLabel(emergencyCase.createdAt, now)}
            hint={now === null ? undefined : `opened at ${formatTime(emergencyCase.createdAt)}`}
          />
        </dl>

        <p className="text-sm text-slate-700">
          <span className="font-medium text-slate-900">Note from the crew: </span>
          {emergencyCase.notes}
        </p>

        {ambulance && (
          <p className="text-sm text-muted">
            Crew {ambulance.callSign} · {ambulance.crew}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-sm font-semibold text-slate-900">
        {value}
        {hint && <span className="block text-xs font-normal text-muted">{hint}</span>}
      </dd>
    </div>
  );
}
