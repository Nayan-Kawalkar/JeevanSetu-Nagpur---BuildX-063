"use client";

/**
 * Incoming blood requests — the asks waiting at the refrigerator door.
 *
 * This sits above the stock grid because an unanswered request is more urgent than tidy
 * inventory: a theatre is waiting on the answer, and a count that is thirty seconds out of
 * date costs nobody anything. Each row says who is asking, for which case, for what, and how
 * long they have been waiting, because that last number is the one that decides what an
 * operator does next.
 *
 * Reserving is the only action that moves stock, and the server does the checking. If the
 * shelf turns out to be short, the server's own sentence is shown word for word rather than
 * being rewritten into "failed": "only 1 of 2 units of O− on the shelf" tells the hospital
 * what to ask for instead, and "failed" does not.
 *
 * No donor exists in this model and none is shown. The only names here are the coordinating
 * hospital and the operator answering.
 */

import { useState } from "react";
import type { BloodRequestsResponse } from "@/app/api/blood-requests/route";
import { SeverityBadge } from "@/components/labels";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { TextInput } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage, refreshAll, send, useLive, useNow } from "@/lib/hooks";
import {
  BLOOD_COMPONENT_LABEL,
  BLOOD_GROUP_LABEL,
  type BloodRequest,
  type BloodRequestStatus,
  type EmergencyCase,
  type Hospital,
} from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";

const STATUS_TONE: Record<BloodRequestStatus, BadgeTone> = {
  PENDING: "warning",
  RESERVED: "success",
  REJECTED: "danger",
  FULFILLED: "dark",
  RELEASED: "neutral",
  EXPIRED: "neutral",
};

const STATUS_LABEL: Record<BloodRequestStatus, string> = {
  PENDING: "waiting for you",
  RESERVED: "held here",
  REJECTED: "declined",
  FULFILLED: "issued",
  RELEASED: "returned to shelf",
  EXPIRED: "lapsed",
};

/** "1:20" once past a minute, "45s" below it — the same form the request queue uses. */
function elapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

type Action = "RESERVE" | "REJECT" | "FULFIL" | "RELEASE";

function RequestLines({
  request,
  hospital,
  emergencyCase,
}: {
  request: BloodRequest;
  hospital?: Hospital;
  emergencyCase?: EmergencyCase;
}) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[request.status]}>{STATUS_LABEL[request.status]}</Badge>
        {emergencyCase && <SeverityBadge severity={emergencyCase.severity} />}
        <span className="font-mono text-xs text-muted">{request.caseId}</span>
      </div>
      <h3 className="mt-1.5 text-xl font-bold tabular-nums text-slate-900">
        {request.units} {request.units === 1 ? "unit" : "units"} {BLOOD_GROUP_LABEL[request.bloodGroup]}
      </h3>
      <p className="text-sm text-slate-700">{BLOOD_COMPONENT_LABEL[request.component]}</p>
      <p className="mt-1 text-sm text-muted">
        Asked by {hospital?.name ?? request.hospitalId}
        {request.requestedBy ? ` · ${request.requestedBy}` : ""}
      </p>
    </div>
  );
}

function PendingRow({
  request,
  hospital,
  emergencyCase,
  busy,
  error,
  onAnswer,
}: {
  request: BloodRequest;
  hospital?: Hospital;
  emergencyCase?: EmergencyCase;
  busy: boolean;
  error?: string;
  onAnswer: (action: Action, reason?: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  // The clock only arrives after mount (see useNow), so until it does the row shows the time
  // the ask was made rather than an age measured against a clock nobody has read yet.
  const now = useNow(1000);
  const waitedSeconds = now === null ? null : Math.max(0, Math.round((now - Date.parse(request.createdAt)) / 1000));

  return (
    <li
      className={cn(
        "rounded-xl border p-4",
        error ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50/70",
        emergencyCase?.severity === "CRITICAL" && "ring-2 ring-red-300",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <RequestLines request={request} hospital={hospital} emergencyCase={emergencyCase} />
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums text-amber-900">
            {waitedSeconds === null ? formatTime(request.createdAt) : elapsed(waitedSeconds)}
          </p>
          <p className="text-xs text-muted">{waitedSeconds === null ? "asked at" : "waiting"}</p>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-800"
        >
          ✕ {error}
        </p>
      )}

      <div className="mt-4">
        {rejecting ? (
          <div className="space-y-2">
            <TextInput
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason, e.g. last two units issued to another theatre"
              aria-label="Reason this cannot be supplied"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="danger"
                loading={busy}
                disabled={reason.trim() === ""}
                onClick={() => onAnswer("REJECT", reason.trim())}
              >
                Confirm rejection
              </Button>
              <Button variant="ghost" onClick={() => setRejecting(false)}>
                Cancel
              </Button>
            </div>
            {reason.trim() === "" && (
              <p className="text-xs text-muted">
                A reason is required, so the hospital knows whether to ask for fewer units or another bank.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="success" size="lg" loading={busy} onClick={() => onAnswer("RESERVE")}>
              Reserve {request.units} {request.units === 1 ? "unit" : "units"}
            </Button>
            <Button variant="secondary" size="lg" disabled={busy} onClick={() => setRejecting(true)}>
              Cannot supply
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

function HeldRow({
  request,
  hospital,
  emergencyCase,
  busy,
  error,
  onAnswer,
}: {
  request: BloodRequest;
  hospital?: Hospital;
  emergencyCase?: EmergencyCase;
  busy: boolean;
  error?: string;
  onAnswer: (action: Action, reason?: string) => void;
}) {
  return (
    <li className={cn("rounded-xl border p-4", error ? "border-red-300 bg-red-50" : "border-border bg-white")}>
      <RequestLines request={request} hospital={hospital} emergencyCase={emergencyCase} />
      <p className="mt-2 text-xs text-muted">
        Held since {formatTime(request.respondedAt ?? request.createdAt)}
        {request.respondedBy ? ` by ${request.respondedBy}` : ""}. These units are promised to this case and are
        not free to issue to anyone else.
      </p>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-800"
        >
          ✕ {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" loading={busy} onClick={() => onAnswer("FULFIL")}>
          Mark fulfilled
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => onAnswer("RELEASE", "no longer needed by the requesting hospital")}
        >
          Release back to shelf
        </Button>
      </div>
    </li>
  );
}

export function IncomingBloodRequests({ bankId, operator }: { bankId: string; operator: string }) {
  const url = `/api/blood-requests?bloodBankId=${encodeURIComponent(bankId)}`;
  const { data, error, isLoading, mutate } = useLive<BloodRequestsResponse>(url);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  async function answer(request: BloodRequest, action: Action, reason?: string) {
    setBusyId(request.id);
    setRowErrors((current) => {
      const next = { ...current };
      delete next[request.id];
      return next;
    });
    try {
      await send(`/api/blood-requests/${encodeURIComponent(request.id)}`, "PATCH", {
        action,
        reason,
        by: operator.trim() === "" ? undefined : operator.trim().slice(0, 60),
      });
      await mutate();
      // Reserving moves units out of available: every stock view on every screen is now stale.
      void refreshAll();
    } catch (err) {
      // The server's sentence, verbatim. It carries the numbers that decide the next move.
      setRowErrors((current) => ({ ...current, [request.id]: errorMessage(err) }));
    } finally {
      setBusyId(null);
    }
  }

  const requests = data?.requests ?? [];
  const pending = requests.filter((r) => r.status === "PENDING");
  const held = requests.filter((r) => r.status === "RESERVED");

  return (
    <Card className={pending.length > 0 ? "border-amber-300" : undefined}>
      <CardHeader
        title="Incoming requests"
        subtitle="Hospitals asking this bank to hold units for a named case. Reserving moves them off the shelf at once."
        action={
          pending.length > 0 ? (
            <Badge tone="warning">
              {pending.length} waiting {pending.length === 1 ? "answer" : "answers"}
            </Badge>
          ) : (
            <Badge tone="neutral">none waiting</Badge>
          )
        }
      />
      <CardBody className="space-y-4">
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
          >
            ⚠ The request queue could not be refreshed: {errorMessage(error)}. Anything shown below is the last
            list received.
          </p>
        )}

        {!data && isLoading ? (
          <Spinner label="Loading incoming requests" />
        ) : pending.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-muted">
            No hospital is waiting on this bank right now.
          </p>
        ) : (
          <ul className="space-y-3">
            {pending.map((request) => (
              <PendingRow
                key={request.id}
                request={request}
                hospital={data?.hospitals[request.hospitalId]}
                emergencyCase={data?.cases[request.caseId]}
                busy={busyId === request.id}
                error={rowErrors[request.id]}
                onAnswer={(action, reason) => void answer(request, action, reason)}
              />
            ))}
          </ul>
        )}

        {held.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Held here for a live case ({held.length})
            </h3>
            <ul className="space-y-3">
              {held.map((request) => (
                <HeldRow
                  key={request.id}
                  request={request}
                  hospital={data?.hospitals[request.hospitalId]}
                  emergencyCase={data?.cases[request.caseId]}
                  busy={busyId === request.id}
                  error={rowErrors[request.id]}
                  onAnswer={(action, reason) => void answer(request, action, reason)}
                />
              ))}
            </ul>
          </section>
        )}
      </CardBody>
    </Card>
  );
}
