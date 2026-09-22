"use client";

import { useState } from "react";
import { RequestCard } from "@/components/RequestCard";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { errorMessage, send } from "@/lib/hooks";
import {
  ACTIVE_STATUSES,
  CASE_SEVERITIES,
  type EmergencyCase,
  type HospitalRequest,
  type Reservation,
} from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { reservationLabel } from "./holds";

/** PATCH /api/requests/:id on success. A 409 comes back as an error carrying the same sentence. */
interface RespondResponse {
  request: HospitalRequest;
  case: EmergencyCase;
  reservations: Reservation[];
}

/** What the last accept actually locked, kept on screen after the request leaves the queue. */
interface Held {
  caseId: string;
  reservations: Reservation[];
}

/**
 * True while the patient behind a request is still coming.
 *
 * A request can outlive its case: cancel a case and its open request stays in this queue, so a
 * coordinator can be asked to hold an ICU bed for a patient nobody is bringing. The row is still
 * shown — hiding a pending request would be worse — but it is flagged, and it no longer counts
 * towards the critical alarm at the top.
 */
function stillComing(emergencyCase: EmergencyCase | undefined): boolean {
  return emergencyCase === undefined || ACTIVE_STATUSES.includes(emergencyCase.status);
}

/**
 * Worst first, then longest waiting.
 *
 * The card above this list says "answer these first", and a coordinator reading top to bottom
 * under pressure will take that literally — so the order has to be the triage order rather than
 * whatever order the requests happen to arrive in. A patient whose case has already been
 * cancelled or handed over sinks below the ones still on the road: the row stays visible, but it
 * is not what should be answered next. Ties fall back to the oldest request, because that crew
 * has been waiting on the roadside the longest.
 */
function triageOrder(requests: HospitalRequest[], cases: Record<string, EmergencyCase>): HospitalRequest[] {
  const rank = (request: HospitalRequest): number => {
    const emergencyCase = cases[request.caseId];
    if (!stillComing(emergencyCase)) return CASE_SEVERITIES.length;
    const index = emergencyCase ? CASE_SEVERITIES.indexOf(emergencyCase.severity) : -1;
    return index === -1 ? CASE_SEVERITIES.length - 1 : index;
  };
  return [...requests].sort(
    (a, b) => rank(a) - rank(b) || Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}

export function IncomingRequests({
  requests,
  cases,
  respondedBy,
  onChanged,
}: {
  requests: HospitalRequest[];
  cases: Record<string, EmergencyCase>;
  respondedBy?: string;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [held, setHeld] = useState<Held | null>(null);

  const criticalCount = requests.filter(
    (r) => cases[r.caseId]?.severity === "CRITICAL" && stillComing(cases[r.caseId]),
  ).length;

  async function respond(request: HospitalRequest, action: "ACCEPT" | "REJECT", reason?: string) {
    setBusyId(request.id);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[request.id];
      return next;
    });
    try {
      const result = await send<RespondResponse>(`/api/requests/${encodeURIComponent(request.id)}`, "PATCH", {
        action,
        reason,
        respondedBy,
      });
      setHeld(action === "ACCEPT" ? { caseId: result.case.id, reservations: result.reservations } : null);
    } catch (err) {
      // A 409 means the hold failed: the request is still open, so the server's own sentence is
      // shown unchanged next to the buttons and they can try again once a bed is freed.
      setErrors((prev) => ({ ...prev, [request.id]: errorMessage(err) }));
    } finally {
      setBusyId(null);
      // Either way the board has moved on: refresh so the counts under these buttons are current.
      onChanged();
    }
  }

  return (
    <section aria-labelledby="incoming-requests-heading" className="space-y-3">
      {criticalCount > 0 && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-bold text-white"
        >
          <span aria-hidden className="text-base">
            ⚠
          </span>
          {criticalCount} critical {criticalCount === 1 ? "patient is" : "patients are"} waiting for your answer
        </p>
      )}

      <Card className={criticalCount > 0 ? "border-red-300" : undefined}>
        <CardHeader
          title={<span id="incoming-requests-heading">Incoming requests</span>}
          subtitle="Answer these first. Accepting holds the resources listed on the card for this patient."
          action={
            requests.length > 0 ? (
              <Badge tone={criticalCount > 0 ? "danger" : "warning"}>
                {requests.length} waiting
              </Badge>
            ) : undefined
          }
        />
        <CardBody className="space-y-3">
          {held && (
            <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3">
              <p className="text-sm font-semibold text-emerald-900">
                <span aria-hidden>✓</span> Accepted. Now held for{" "}
                <span className="font-mono">{held.caseId}</span>
              </p>
              {held.reservations.length === 0 ? (
                <p className="mt-1 text-sm text-emerald-900">
                  Nothing needed to be held for this patient — no countable resource or blood was requested.
                </p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {held.reservations.map((reservation) => (
                    <li key={reservation.id} className="text-sm text-emerald-900">
                      <span aria-hidden>• </span>
                      <span className="font-medium">{reservationLabel(reservation)}</span>
                      <span className="text-emerald-800"> · held until {formatTime(reservation.expiresAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Button className="mt-2" size="sm" variant="ghost" onClick={() => setHeld(null)}>
                Dismiss
              </Button>
            </div>
          )}

          {requests.length === 0 ? (
            <EmptyState
              title="No incoming requests."
              description="A request appears here the moment an ambulance crew asks this hospital to take a patient."
            />
          ) : (
            <ul className="space-y-3">
              {triageOrder(requests, cases).map((request) => {
                const emergencyCase = cases[request.caseId];
                return (
                  <li key={request.id} className="space-y-1">
                    {!stillComing(emergencyCase) && emergencyCase && (
                      <p
                        role="status"
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
                      >
                        <span aria-hidden>⚠</span> This case was {emergencyCase.status.toLowerCase()} after the
                        request was sent. Check with the control room before holding anything for it.
                      </p>
                    )}
                    <RequestCard
                      request={request}
                      emergencyCase={emergencyCase}
                      busy={busyId === request.id}
                      error={errors[request.id]}
                      onRespond={(action, reason) => void respond(request, action, reason)}
                    />
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
