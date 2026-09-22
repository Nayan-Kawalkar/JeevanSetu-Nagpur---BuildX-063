"use client";

/**
 * Request blood — the panel that replaces ringing round for a donor.
 *
 * A request here is a named ask: this case, this group, this component, this many units, from
 * this bank. That is the whole point of the module. An unnamed shout into a group chat cannot
 * be answered, cannot be audited, and cannot hold anything; a request that a named operator
 * reserves against moves real units off a real shelf and leaves a line in the timeline.
 *
 * The bank picker sorts by what matters in that order: banks that can actually cover the ask
 * first, then the nearest of those, because a bank with the units twelve kilometres away is
 * worth less than one with the units next door, and a near bank with nothing is worth nothing.
 * Distances are road estimates from this hospital, and the unit counts are the ones an
 * operator last typed — neither is a promise, and the bank still has to say yes.
 *
 * No donor appears in this model and none is shown. The only names on screen are the case id,
 * the banks, and the coordinator sending the ask.
 */

import { useState } from "react";
import type { BloodRequestsResponse } from "@/app/api/blood-requests/route";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { roadKm } from "@/lib/geo";
import { errorMessage, refreshAll, send, useLive } from "@/lib/hooks";
import {
  BLOOD_COMPONENTS,
  BLOOD_COMPONENT_LABEL,
  BLOOD_GROUPS,
  BLOOD_GROUP_LABEL,
  INCIDENT_LABEL,
  type BloodBank,
  type BloodComponent,
  type BloodGroup,
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
  PENDING: "waiting on the bank",
  RESERVED: "units held",
  REJECTED: "declined",
  FULFILLED: "issued",
  RELEASED: "returned to shelf",
  EXPIRED: "lapsed",
};

/** The most units this panel will ask for in one request; the API refuses more. */
const MAX_UNITS = 20;

interface BankOption {
  bank: BloodBank;
  distanceKm: number;
  availableOfGroup: number;
  covers: boolean;
}

/** Banks that can cover the ask first, then nearest; a near shelf with nothing is no use. */
function rankBanks(banks: BloodBank[], hospital: Hospital, group: BloodGroup, units: number): BankOption[] {
  return banks
    .map((bank) => {
      const availableOfGroup = bank.inventory[group].available;
      return {
        bank,
        distanceKm: roadKm(hospital, bank),
        availableOfGroup,
        covers: availableOfGroup >= units,
      };
    })
    .sort((a, b) => {
      const coversFirst = Number(b.covers) - Number(a.covers);
      if (coversFirst !== 0) return coversFirst;
      if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
      return a.bank.name.localeCompare(b.bank.name);
    });
}

/** Narrows a <select> value back to the enum, so an unexpected string can never be sent. */
function toGroup(raw: string, fallback: BloodGroup): BloodGroup {
  return BLOOD_GROUPS.find((value) => value === raw) ?? fallback;
}

function toComponent(raw: string, fallback: BloodComponent): BloodComponent {
  return BLOOD_COMPONENTS.find((value) => value === raw) ?? fallback;
}

/** One line describing the case a coordinator is asking for, without clinical detail. */
function caseLabel(emergencyCase: EmergencyCase): string {
  const who = `${INCIDENT_LABEL[emergencyCase.incidentType]}${emergencyCase.age ? `, ${emergencyCase.age}` : ""}`;
  return `${emergencyCase.id} — ${who}`;
}

function OutstandingRow({ request, banks }: { request: BloodRequest; banks: Record<string, BloodBank> }) {
  return (
    <li className="rounded-lg border border-border bg-white px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {request.units} {request.units === 1 ? "unit" : "units"} {BLOOD_GROUP_LABEL[request.bloodGroup]} ·{" "}
            {BLOOD_COMPONENT_LABEL[request.component]}
          </p>
          <p className="text-xs text-muted">
            <span className="font-mono">{request.caseId}</span> · {banks[request.bloodBankId]?.name ?? request.bloodBankId}{" "}
            · sent {formatTime(request.createdAt)}
          </p>
        </div>
        <Badge tone={STATUS_TONE[request.status]}>{STATUS_LABEL[request.status]}</Badge>
      </div>
      {request.status === "REJECTED" && request.reason && (
        <p className="mt-1 text-xs text-slate-600">Bank&rsquo;s reason: {request.reason}</p>
      )}
    </li>
  );
}

export function RequestBlood({
  hospital,
  cases,
  requestedBy,
}: {
  hospital: Hospital;
  cases: Record<string, EmergencyCase>;
  requestedBy?: string;
}) {
  const url = `/api/blood-requests?hospitalId=${encodeURIComponent(hospital.id)}`;
  const { data, error, isLoading, mutate } = useLive<BloodRequestsResponse>(url);

  // Only cases this hospital has actually taken on: asking a bank to hold units for someone
  // else's patient is how two theatres end up promised the same bag.
  const routed = Object.values(cases)
    .filter((c) => c.hospitalId === hospital.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const [caseId, setCaseId] = useState<string | null>(null);
  const [groupOverride, setGroupOverride] = useState<BloodGroup | null>(null);
  const [unitsOverride, setUnitsOverride] = useState<number | null>(null);
  const [component, setComponent] = useState<BloodComponent>("PACKED_RED_CELLS");
  const [bankId, setBankId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const selectedCase = (caseId ? cases[caseId] : undefined) ?? routed[0];
  // Defaults follow the case: its recorded group and unit count are what the paramedic already
  // entered, and re-typing them is how a wrong group gets sent.
  const group = groupOverride ?? selectedCase?.bloodGroup ?? "O_NEG";
  const units = unitsOverride ?? selectedCase?.bloodUnitsNeeded ?? 2;

  const banks = data?.bloodBanks ?? {};
  const options = selectedCase ? rankBanks(Object.values(banks), hospital, group, units) : [];
  const chosen = options.find((option) => option.bank.id === bankId) ?? options[0];

  const outstanding = (data?.requests ?? []).filter(
    (request) => request.status === "PENDING" || request.status === "RESERVED",
  );
  const answered = (data?.requests ?? []).filter(
    (request) => request.status !== "PENDING" && request.status !== "RESERVED",
  );

  function pickCase(nextId: string) {
    setCaseId(nextId);
    // The case carries its own group and unit count; a leftover override from the previous
    // patient would silently apply to this one.
    setGroupOverride(null);
    setUnitsOverride(null);
    setSendError(null);
    setSentNote(null);
  }

  async function submit() {
    if (!selectedCase || !chosen) return;
    setSending(true);
    setSendError(null);
    setSentNote(null);
    try {
      await send(`/api/blood-requests`, "POST", {
        caseId: selectedCase.id,
        hospitalId: hospital.id,
        bloodBankId: chosen.bank.id,
        bloodGroup: group,
        component,
        units,
        requestedBy: requestedBy ?? "Hospital coordinator",
        // Derived from the selection, not from the tap: a double tap on a slow network sends
        // the same key twice and the server returns the one request. `attempt` moves on only
        // after a send succeeds, so a later, deliberate re-ask for the same units is new.
        idempotencyKey: `blood-${hospital.id}-${selectedCase.id}-${group}-${component}-${units}-${chosen.bank.id}-${attempt}`,
      });
      setSentNote(
        `Asked ${chosen.bank.name} for ${units} ${units === 1 ? "unit" : "units"} ${BLOOD_GROUP_LABEL[group]}. Nothing is held until an operator there answers.`,
      );
      setAttempt((current) => current + 1);
      await mutate();
      void refreshAll();
    } catch (err) {
      setSendError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Request blood"
        subtitle="Ask a named bank to hold units for a patient coming here. The bank decides; sending this holds nothing."
        action={
          outstanding.length > 0 ? (
            <Badge tone="info">{outstanding.length} outstanding</Badge>
          ) : (
            <Badge tone="neutral">none outstanding</Badge>
          )
        }
      />
      <CardBody className="space-y-4">
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
          >
            ⚠ Bank stock could not be refreshed: {errorMessage(error)}. The figures below are the last ones
            received.
          </p>
        )}

        {routed.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-muted">
            No patient is currently routed to this hospital, so there is nobody to request blood for. Accept an
            incoming request first.
          </p>
        ) : !data && isLoading ? (
          <Spinner label="Loading blood banks" />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Patient coming here" htmlFor="blood-case">
                <Select
                  id="blood-case"
                  value={selectedCase?.id ?? ""}
                  disabled={sending}
                  onChange={(event) => pickCase(event.target.value)}
                >
                  {routed.map((c) => (
                    <option key={c.id} value={c.id}>
                      {caseLabel(c)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Blood group"
                htmlFor="blood-group"
                hint={
                  selectedCase?.bloodGroup
                    ? `Recorded on this case as ${BLOOD_GROUP_LABEL[selectedCase.bloodGroup]}.`
                    : "No group recorded on this case yet — confirm it before sending."
                }
              >
                <Select
                  id="blood-group"
                  value={group}
                  disabled={sending}
                  onChange={(event) => setGroupOverride(toGroup(event.target.value, group))}
                >
                  {BLOOD_GROUPS.map((value) => (
                    <option key={value} value={value}>
                      {BLOOD_GROUP_LABEL[value]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Component" htmlFor="blood-component">
                <Select
                  id="blood-component"
                  value={component}
                  disabled={sending}
                  onChange={(event) => setComponent(toComponent(event.target.value, component))}
                >
                  {BLOOD_COMPONENTS.map((value) => (
                    <option key={value} value={value}>
                      {BLOOD_COMPONENT_LABEL[value]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Units" htmlFor="blood-units">
                <Select
                  id="blood-units"
                  value={String(units)}
                  disabled={sending}
                  onChange={(event) => setUnitsOverride(Number.parseInt(event.target.value, 10))}
                >
                  {Array.from({ length: MAX_UNITS }, (_, index) => index + 1).map((value) => (
                    <option key={value} value={value}>
                      {value} {value === 1 ? "unit" : "units"}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-800">
                Bank — nearest bank that can cover the ask first
              </legend>
              <ul className="space-y-2">
                {options.map((option) => {
                  const active = chosen?.bank.id === option.bank.id;
                  return (
                    <li key={option.bank.id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        disabled={sending}
                        onClick={() => setBankId(option.bank.id)}
                        className={cn(
                          "flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed",
                          active ? "border-slate-900 bg-slate-50" : "border-slate-300 bg-white hover:bg-slate-50",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-900">{option.bank.name}</span>
                          <span className="block text-xs text-muted">
                            {option.bank.area} · {option.distanceKm} km by road
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-semibold tabular-nums text-slate-900">
                            {option.availableOfGroup} {BLOOD_GROUP_LABEL[group]}
                          </span>
                          {option.covers ? (
                            <Badge tone="success">covers {units}</Badge>
                          ) : (
                            <Badge tone="warning">short of {units}</Badge>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {chosen && !chosen.covers && (
                <p className="text-xs text-amber-800">
                  ⚠ {chosen.bank.name} last reported {chosen.availableOfGroup} of the {units} units asked for. The
                  request can still be sent — the operator sees the real shelf — but expect it to be declined or
                  answered with fewer.
                </p>
              )}
            </fieldset>

            {sendError && (
              <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                ✕ {sendError}
              </p>
            )}
            {sentNote && !sendError && (
              <p role="status" className="text-sm font-medium text-emerald-700">
                ✓ {sentNote}
              </p>
            )}

            <Button
              variant="danger"
              size="lg"
              className="w-full"
              loading={sending}
              disabled={!selectedCase || !chosen}
              onClick={() => void submit()}
            >
              Send request
            </Button>
            <p className="text-xs leading-relaxed text-muted">
              Coordination only. Unit counts are what an operator last typed, not a live feed from a refrigerator,
              and this platform does not guarantee that units will be there on arrival. No donor information exists
              in this system.
            </p>
          </>
        )}

        {(outstanding.length > 0 || answered.length > 0) && (
          <section className="space-y-2 border-t border-border pt-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
              This hospital&rsquo;s requests
            </h3>
            <ul className="space-y-2">
              {[...outstanding, ...answered].slice(0, 12).map((request) => (
                <OutstandingRow key={request.id} request={request} banks={banks} />
              ))}
            </ul>
          </section>
        )}
      </CardBody>
    </Card>
  );
}
