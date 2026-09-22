"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { ResourceChips } from "@/components/ResourceChips";
import { RequestBadge, SeverityBadge } from "@/components/labels";
import { BLOOD_GROUP_LABEL, INCIDENT_LABEL, type EmergencyCase, type HospitalRequest } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";

/**
 * An incoming patient, as the receiving coordinator sees it. Shows exactly what will be
 * held on acceptance, because accepting is a promise of resources, not just a yes.
 */
export function RequestCard({
  request,
  emergencyCase,
  busy,
  error,
  onRespond,
}: {
  request: HospitalRequest;
  emergencyCase?: EmergencyCase;
  busy?: boolean;
  error?: string;
  onRespond?: (action: "ACCEPT" | "REJECT", reason?: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const pending = request.status === "PENDING";
  const secondsLeft = Math.round((new Date(request.expiresAt).getTime() - Date.now()) / 1000);

  return (
    <article
      className={cn(
        "rounded-xl border p-4",
        pending ? "border-amber-300 bg-amber-50/70" : "border-border bg-white",
        pending && emergencyCase?.severity === "CRITICAL" && "ring-2 ring-red-300",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <RequestBadge status={request.status} />
            {emergencyCase && <SeverityBadge severity={emergencyCase.severity} />}
            <span className="font-mono text-xs text-muted">{request.caseId}</span>
          </div>
          <h3 className="mt-1.5 text-base font-semibold text-slate-900">
            {emergencyCase
              ? `${INCIDENT_LABEL[emergencyCase.incidentType]}${emergencyCase.age ? `, ${emergencyCase.age}` : ""}${
                  emergencyCase.sex ? emergencyCase.sex : ""
                }`
              : "Incoming patient"}
          </h3>
          {emergencyCase && <p className="text-sm text-muted">From {emergencyCase.locationLabel}</p>}
        </div>
        {pending && (
          <div className="text-right">
            <p className={cn("text-lg font-bold tabular-nums", secondsLeft < 30 ? "text-red-700" : "text-amber-800")}>
              {secondsLeft > 0 ? `${secondsLeft}s` : "expiring"}
            </p>
            <p className="text-xs text-muted">to respond</p>
          </div>
        )}
      </header>

      {emergencyCase && (
        <>
          <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-sm leading-relaxed text-slate-700">
            {emergencyCase.notes}
          </p>
          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Will be held on acceptance
            </p>
            <div className="mt-1">
              <ResourceChips requirements={emergencyCase.requirements} size="sm" />
            </div>
            {emergencyCase.bloodGroup && (
              <p className="mt-2 text-sm font-medium text-red-800">
                Blood: {emergencyCase.bloodUnitsNeeded ?? 2} units {BLOOD_GROUP_LABEL[emergencyCase.bloodGroup]}
              </p>
            )}
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          {error}
        </p>
      )}

      {request.status === "REJECTED" && request.reason && (
        <p className="mt-3 text-sm text-slate-600">Rejected: {request.reason}</p>
      )}
      {!pending && request.respondedAt && (
        <p className="mt-2 text-xs text-muted">
          Answered at {formatTime(request.respondedAt)}
          {request.respondedBy ? ` by ${request.respondedBy}` : ""}
        </p>
      )}

      {pending && onRespond && (
        <div className="mt-4 space-y-2">
          {rejecting ? (
            <div className="space-y-2">
              <TextInput
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason, e.g. ICU just taken by another case"
                aria-label="Rejection reason"
              />
              <div className="flex gap-2">
                <Button variant="danger" loading={busy} onClick={() => onRespond("REJECT", reason || undefined)}>
                  Confirm rejection
                </Button>
                <Button variant="ghost" onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="success" size="lg" loading={busy} onClick={() => onRespond("ACCEPT")}>
                Accept and hold resources
              </Button>
              <Button variant="secondary" size="lg" disabled={busy} onClick={() => setRejecting(true)}>
                Reject
              </Button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
