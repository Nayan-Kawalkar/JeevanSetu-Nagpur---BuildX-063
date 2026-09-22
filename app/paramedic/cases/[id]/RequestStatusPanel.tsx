"use client";

import { RequestBadge, ReservationBadge } from "@/components/labels";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { useNow } from "@/lib/hooks";
import {
  BLOOD_GROUP_LABEL,
  RESOURCE_LABEL,
  type EmergencyCase,
  type Hospital,
  type HospitalRequest,
  type Reservation,
} from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { Notice } from "./Notice";
import { countdownLabel } from "./format";

/** One held resource, said the way a coordinator would say it aloud. */
function describeReservation(reservation: Reservation): string {
  if (reservation.resourceType === "BLOOD_UNITS") {
    const group = reservation.bloodGroup ? BLOOD_GROUP_LABEL[reservation.bloodGroup] : "matched";
    return `${reservation.quantity} × ${group} blood unit${reservation.quantity === 1 ? "" : "s"}`;
  }
  return `${reservation.quantity} × ${RESOURCE_LABEL[reservation.resourceType]}`;
}

/** Active holds first: those are the ones that still mean something to the crew. */
function holdOrder(a: Reservation, b: Reservation): number {
  return Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE");
}

/**
 * Where the ask has got to: waiting, refused, or confirmed with resources actually held.
 *
 * A request is a promise with a clock on it, so the clock is on the screen. When it is refused
 * the reason is shown in the hospital's own words and the backup from the ranking is named,
 * because the next call has to be made in seconds, not after a re-read of the list.
 */
export function RequestStatusPanel({
  emergencyCase,
  requests,
  hospitalById,
  backupHospital,
}: {
  emergencyCase: EmergencyCase;
  requests: HospitalRequest[];
  hospitalById: Map<string, Hospital>;
  backupHospital?: Hospital;
}) {
  const now = useNow(1000);
  const latest = requests[0];
  const earlier = requests.slice(1);
  const nameOf = (id: string) => hospitalById.get(id)?.name ?? id;

  return (
    <Card>
      <CardHeader
        title="The ask"
        subtitle="One hospital at a time, with a deadline. A coordinator there has to answer it."
      />
      <CardBody className="space-y-4">
        {!latest ? (
          <p className="text-sm text-muted">
            No hospital has been asked yet. Pick one from the ranking above and send the request.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-muted">Asked</p>
                <p className="text-lg font-semibold text-slate-900">{nameOf(latest.hospitalId)}</p>
              </div>
              <RequestBadge status={latest.status} />
            </div>

            {latest.status === "PENDING" && (
              <Pending request={latest} now={now} hospitalName={nameOf(latest.hospitalId)} />
            )}

            {latest.status === "REJECTED" && (
              <div className="space-y-2">
                <Notice tone="error">
                  {nameOf(latest.hospitalId)} could not take this patient.
                  {latest.reason ? ` Their reason: “${latest.reason}”` : " No reason was given."}
                </Notice>
                <p className="text-sm text-slate-700">
                  {backupHospital ? (
                    <>
                      Backup from the ranking: <span className="font-semibold">{backupHospital.name}</span> (
                      {backupHospital.area}, {backupHospital.phone}). Send the request to them from the list above.
                    </>
                  ) : (
                    "No backup was ranked. Re-check hospitals above, or call the control room."
                  )}
                </p>
              </div>
            )}

            {latest.status === "EXPIRED" && (
              <Notice tone="warning">
                {nameOf(latest.hospitalId)} did not answer in time. The case is back in matching — ask the backup
                or re-check the ranking.
              </Notice>
            )}

            {latest.status === "ACCEPTED" && (
              <Accepted
                emergencyCase={emergencyCase}
                hospital={hospitalById.get(latest.hospitalId)}
                request={latest}
              />
            )}
          </>
        )}

        {earlier.length > 0 && (
          <details className="rounded-lg border border-border bg-slate-50 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-slate-800">
              Earlier requests ({earlier.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {earlier.map((request) => (
                <li key={request.id} className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                  <RequestBadge status={request.status} />
                  <span className="font-medium">{nameOf(request.hospitalId)}</span>
                  <span className="text-muted">sent {formatTime(request.createdAt)}</span>
                  {request.reason && <span className="text-muted">· “{request.reason}”</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardBody>
    </Card>
  );
}

function Pending({
  request,
  now,
  hospitalName,
}: {
  request: HospitalRequest;
  now: number | null;
  hospitalName: string;
}) {
  const remaining = now === null ? null : countdownLabel(request.expiresAt, now);

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-amber-900">Waiting on the coordinator at {hospitalName}</p>
          <p className="text-sm text-amber-800">
            The crew cannot move until this is answered. Sent at {formatTime(request.createdAt)}.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-800">Time left to answer</p>
          <p className="text-3xl font-bold tabular-nums text-amber-900" aria-live="off">
            {now === null ? `until ${formatTime(request.expiresAt)}` : (remaining ?? "0:00")}
          </p>
        </div>
      </div>
      {now !== null && remaining === null && (
        <p className="mt-2 text-sm font-medium text-amber-900">
          The deadline has passed. This request lapses on the next refresh and the case returns to matching.
        </p>
      )}
    </div>
  );
}

function Accepted({
  emergencyCase,
  hospital,
  request,
}: {
  emergencyCase: EmergencyCase;
  hospital?: Hospital;
  request: HospitalRequest;
}) {
  const holds = [...emergencyCase.reservations].sort(holdOrder);

  return (
    <div className="space-y-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
      <div>
        <p className="text-sm font-medium text-emerald-900">
          ✓ Accepted{request.respondedBy ? ` by ${request.respondedBy}` : ""}
          {request.respondedAt ? ` at ${formatTime(request.respondedAt)}` : ""}
        </p>
        <p className="text-lg font-semibold text-emerald-950">{hospital?.name ?? request.hospitalId}</p>
        {hospital && (
          <p className="text-sm text-emerald-900">
            {hospital.area} ·{" "}
            <a className="font-semibold underline underline-offset-2" href={`tel:${hospital.phone}`}>
              {hospital.phone}
            </a>
          </p>
        )}
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-900">Held for this patient</p>
        {holds.length === 0 ? (
          <p className="text-sm text-emerald-900">Nothing is being held for this case.</p>
        ) : (
          <ul className="mt-1 space-y-1.5">
            {holds.map((reservation) => (
              <li key={reservation.id} className="flex flex-wrap items-center gap-2 text-sm text-emerald-950">
                <ReservationBadge status={reservation.status} />
                <span className="font-medium">{describeReservation(reservation)}</span>
                <span className="text-emerald-800">
                  {reservation.status === "ACTIVE"
                    ? `held until ${formatTime(reservation.expiresAt)}`
                    : `since ${formatTime(reservation.createdAt)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
