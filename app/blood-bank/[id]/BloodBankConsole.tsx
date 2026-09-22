"use client";

/**
 * Blood bank operator console — the screen at the refrigerator door.
 *
 * Two ideas drive the layout. First, available and reserved are never added together:
 * reserved units are promised to a case whose ambulance may already be moving, so they are
 * shown apart from the spendable count and the controls refuse to spend them. Second, a
 * count is only as good as the moment it was last checked, so confirming the shelf is a
 * first-class action rather than a side effect of editing a number.
 *
 * Edits are optimistic: the number moves at once, and if the API refuses, the count snaps
 * back to what the server still holds and says why. The stock floor is enforced here as a
 * disabled control with a reason, so the operator never has to learn it from a rejection.
 *
 * Coordination only. No donor, patient or staff-medical data exists in this model and none
 * is shown; the only name on this screen is the operator confirming the count.
 */

import Link from "next/link";
import { useState } from "react";
import type { BloodBankWithFreshness } from "@/app/api/bloodbanks/route";
import { FreshnessLabel } from "@/components/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, TextInput } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage, HttpError, refreshAll, send, useLive } from "@/lib/hooks";
import { BLOOD_GROUPS, BLOOD_GROUP_LABEL, type BloodGroup } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";
import { IncomingBloodRequests } from "./IncomingBloodRequests";

/** The API refuses anything above this per group (UpdateBloodBankSchema), so the control stops here too. */
const MAX_UNITS = 999;

interface BankResponse {
  bloodBank: BloodBankWithFreshness;
}

/** PATCH answers with the stored record plus a sentence for anything a floor changed. */
interface PatchResponse {
  bloodBank: BloodBankWithFreshness;
  notes?: string[];
}

type InventoryPatch = Partial<Record<BloodGroup, { available: number }>>;

interface PatchBody {
  inventory: InventoryPatch;
  updatedBy?: string;
}

/** Drops one key without mutating the record React is rendering from. */
function without<V>(record: Partial<Record<BloodGroup, V>>, group: BloodGroup): Partial<Record<BloodGroup, V>> {
  const next = { ...record };
  delete next[group];
  return next;
}

function StockRow({
  group,
  available,
  reserved,
  low,
  saving,
  disabled,
  error,
  onCommit,
}: {
  group: BloodGroup;
  available: number;
  reserved: number;
  low: boolean;
  saving: boolean;
  disabled: boolean;
  error?: string;
  onCommit: (next: number) => void;
}) {
  // While the operator is typing, the field holds their keystrokes; everywhere else the
  // number shown is the one the system believes, so a poll can never overwrite mid-edit.
  const [draft, setDraft] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const inputId = `stock-${group}`;
  const label = BLOOD_GROUP_LABEL[group];
  const atFloor = available <= reserved;
  const atCeiling = available >= MAX_UNITS;
  const locked = disabled || saving;

  function commit(raw: number) {
    setDraft(null);
    if (!Number.isFinite(raw)) {
      setNote(null);
      return;
    }
    const whole = Math.round(raw);
    const clamped = Math.min(MAX_UNITS, Math.max(reserved, whole));
    if (whole < 0) {
      setNote("Stock cannot be negative. Recorded 0 instead.");
    } else if (whole < reserved) {
      setNote(
        `${reserved} ${reserved === 1 ? "unit is" : "units are"} held for a live case and cannot be spent here. Recorded ${reserved}. Release the hold on that case to go lower.`,
      );
    } else if (whole > MAX_UNITS) {
      setNote(`This console records at most ${MAX_UNITS} units per group. Recorded ${MAX_UNITS}.`);
    } else {
      setNote(null);
    }
    if (clamped !== available) onCommit(clamped);
  }

  function step(delta: number) {
    setNote(null);
    setDraft(null);
    const next = Math.min(MAX_UNITS, Math.max(reserved, available + delta));
    if (next !== available) onCommit(next);
  }

  return (
    <li
      className={cn(
        "rounded-xl border p-3",
        error ? "border-red-300 bg-red-50" : available === 0 ? "border-red-200 bg-white" : "border-border bg-white",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <label htmlFor={inputId} className="text-xl font-bold text-slate-900">
          {label}
          <span className="sr-only"> units available</span>
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {available === 0 ? (
            <Badge tone="danger">✕ none on shelf</Badge>
          ) : low ? (
            <Badge tone="warning">⚠ low</Badge>
          ) : null}
          {reserved > 0 ? (
            <Badge tone="info">{reserved} held for a case</Badge>
          ) : (
            <span className="text-xs text-muted">none held</span>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={locked || atFloor}
          aria-label={`Remove one ${label} unit`}
          className="h-12 w-12 shrink-0 rounded-lg border border-slate-300 bg-white text-2xl font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          −
        </button>
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={reserved}
          max={MAX_UNITS}
          step={1}
          disabled={locked}
          value={draft ?? String(available)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => commit(Number.parseInt(event.target.value, 10))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          aria-describedby={`${inputId}-help`}
          className="h-12 w-full min-w-0 rounded-lg border border-slate-300 bg-white text-center text-2xl font-bold tabular-nums text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50"
        />
        <button
          type="button"
          onClick={() => step(1)}
          disabled={locked || atCeiling}
          aria-label={`Add one ${label} unit`}
          className="h-12 w-12 shrink-0 rounded-lg border border-slate-300 bg-white text-2xl font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
      </div>

      <p id={`${inputId}-help`} className="mt-1.5 text-xs text-muted">
        {saving
          ? "Saving…"
          : atFloor && reserved > 0
            ? `Lowest you can record is ${reserved}: that many units are held for a live case.`
            : atFloor
              ? "Already at zero."
              : atCeiling
                ? `Highest this console records is ${MAX_UNITS}.`
                : "Units free to issue now."}
      </p>

      {note && (
        <p role="status" className="mt-1.5 text-xs font-medium text-amber-800">
          ⚠ {note}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">
          ✕ {error}
        </p>
      )}
    </li>
  );
}

export function BloodBankConsole({ bankId }: { bankId: string }) {
  const url = `/api/bloodbanks/${encodeURIComponent(bankId)}`;
  const { data, error, isLoading, mutate } = useLive<BankResponse>(url);
  const bank = data?.bloodBank;

  const [pending, setPending] = useState<Partial<Record<BloodGroup, number>>>({});
  const [saving, setSaving] = useState<Partial<Record<BloodGroup, boolean>>>({});
  const [rowErrors, setRowErrors] = useState<Partial<Record<BloodGroup, string>>>({});
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [serverNotes, setServerNotes] = useState<string[]>([]);
  const [operator, setOperator] = useState("Blood bank operator");

  function bodyFor(inventory: InventoryPatch): PatchBody {
    const trimmed = operator.trim().slice(0, 60);
    return trimmed.length > 0 ? { inventory, updatedBy: trimmed } : { inventory };
  }

  async function saveGroup(group: BloodGroup, next: number) {
    setRowErrors((current) => without(current, group));
    setConfirmError(null);
    setServerNotes([]);
    setPending((current) => ({ ...current, [group]: next }));
    setSaving((current) => ({ ...current, [group]: true }));
    const inventory: InventoryPatch = {};
    inventory[group] = { available: next };
    try {
      const result = await send<PatchResponse>(url, "PATCH", bodyFor(inventory));
      setPending((current) => without(current, group));
      await mutate({ bloodBank: result.bloodBank }, { revalidate: false });
      setConfirmedAt(result.bloodBank.lastUpdatedAt);
      if (result.notes && result.notes.length > 0) setServerNotes(result.notes);
      void refreshAll();
    } catch (err) {
      // Revert: drop the optimistic number so the row falls back to what the server holds.
      setPending((current) => without(current, group));
      setRowErrors((current) => ({
        ...current,
        [group]: `Not saved (${errorMessage(err)}). The count shown is the one the system still holds.`,
      }));
    } finally {
      setSaving((current) => without(current, group));
    }
  }

  async function confirmAll() {
    if (!bank) return;
    setConfirming(true);
    setConfirmError(null);
    setServerNotes([]);
    const inventory: InventoryPatch = {};
    for (const group of BLOOD_GROUPS) {
      inventory[group] = { available: pending[group] ?? bank.inventory[group].available };
    }
    try {
      const result = await send<PatchResponse>(url, "PATCH", bodyFor(inventory));
      setPending({});
      setRowErrors({});
      await mutate({ bloodBank: result.bloodBank }, { revalidate: false });
      setConfirmedAt(result.bloodBank.lastUpdatedAt);
      if (result.notes && result.notes.length > 0) setServerNotes(result.notes);
      void refreshAll();
    } catch (err) {
      setConfirmError(`Counts were not confirmed (${errorMessage(err)}). Nothing was changed; try again.`);
    } finally {
      setConfirming(false);
    }
  }

  const backLink = (
    <Link
      href="/blood-bank"
      className="inline-flex min-h-[44px] items-center rounded-lg text-sm font-semibold text-slate-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
    >
      ← All blood banks
    </Link>
  );

  if (!bank) {
    if (isLoading) {
      return (
        <div className="space-y-4">
          {backLink}
          <Card>
            <CardBody>
              <Spinner label="Loading this blood bank" />
            </CardBody>
          </Card>
        </div>
      );
    }
    const notFound = error instanceof HttpError && error.status === 404;
    return (
      <div className="space-y-4">
        {backLink}
        <EmptyState
          title={notFound ? "No such blood bank" : "Could not load this blood bank"}
          description={
            notFound
              ? `Nothing in this demo network is registered as "${bankId}". It may have been removed by a demo reset.`
              : `${errorMessage(error)}. The console will keep trying, or reload it yourself.`
          }
          action={
            notFound ? undefined : (
              <Button variant="secondary" onClick={() => void mutate()}>
                Try again
              </Button>
            )
          }
        />
      </div>
    );
  }

  const lowSet = new Set<BloodGroup>(bank.lowGroups);
  const spendable = BLOOD_GROUPS.reduce((sum, group) => sum + (pending[group] ?? bank.inventory[group].available), 0);
  const held = BLOOD_GROUPS.reduce((sum, group) => sum + bank.inventory[group].reserved, 0);
  const busy = confirming || Object.keys(saving).length > 0;

  return (
    <div className="space-y-5">
      {backLink}

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{bank.name}</h1>
        <p className="text-sm text-slate-600">{bank.area}</p>
        <p>
          <a
            href={`tel:${bank.phone.replace(/\s/g, "")}`}
            className="inline-flex min-h-[44px] items-center rounded-lg text-sm font-semibold text-slate-900 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            Call {bank.phone}
          </a>
        </p>
        <FreshnessLabel lastUpdatedAt={bank.lastUpdatedAt} stale={bank.stale} updatedBy={bank.updatedBy} />
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
        >
          ⚠ Live updates interrupted: {errorMessage(error)}. The counts below are the last ones received.
        </p>
      )}

      <Card className={bank.stale ? "border-amber-300" : undefined}>
        <CardHeader
          title="Confirm the shelf"
          subtitle="A confirmation is a person saying these numbers are true right now."
          action={bank.stale ? <Badge tone="warning">⚠ unconfirmed</Badge> : <Badge tone="success">✓ confirmed</Badge>}
        />
        <CardBody className="space-y-3">
          <p className="text-sm leading-relaxed text-slate-700">
            Counts last confirmed {bank.dataAgeMinutes} min ago.{" "}
            {bank.stale
              ? "That is past the freshness window, so hospital ranking currently treats this bank's stock as less reliable and may route a case elsewhere."
              : "While counts stay fresh, hospital ranking treats this bank's stock at full weight."}{" "}
            Confirming refreshes the timestamp even when nothing has changed.
          </p>

          <Field
            label="Recorded by"
            htmlFor="operator-name"
            hint="Goes in the coordination log so a crew knows who to call back. Staff name only — never a donor or patient."
          >
            <TextInput
              id="operator-name"
              value={operator}
              maxLength={60}
              autoComplete="off"
              disabled={busy}
              onChange={(event) => setOperator(event.target.value)}
            />
          </Field>

          <Button
            variant="success"
            size="lg"
            className="w-full"
            loading={confirming}
            disabled={busy && !confirming}
            onClick={() => void confirmAll()}
          >
            ✓ Confirm all counts
          </Button>

          {confirmError && (
            <p role="alert" className="text-sm font-medium text-red-700">
              ✕ {confirmError}
            </p>
          )}
          {confirmedAt && !confirmError && (
            <p role="status" className="text-sm font-medium text-emerald-700">
              ✓ Recorded at {formatTime(confirmedAt)} by {bank.updatedBy}.
            </p>
          )}
          {serverNotes.length > 0 && (
            <ul role="status" className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {serverNotes.map((note) => (
                <li key={note}>⚠ {note}</li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Above the stock grid on purpose: an unanswered request has a theatre waiting on it,
          and tidy inventory can wait thirty seconds longer than a person can. */}
      <IncomingBloodRequests bankId={bank.id} operator={operator} />

      <Card>
        <CardHeader
          title="Units by blood group"
          subtitle="Available is what you can issue. Held units are promised to a live emergency and are not yours to spend."
          action={
            <span className="text-right text-xs text-muted">
              <span className="block font-semibold tabular-nums text-slate-900">{spendable} available</span>
              <span className="block tabular-nums">{held} held for cases</span>
            </span>
          }
        />
        <CardBody>
          <ul className="grid gap-3 sm:grid-cols-2">
            {BLOOD_GROUPS.map((group) => (
              <StockRow
                key={group}
                group={group}
                available={pending[group] ?? bank.inventory[group].available}
                reserved={bank.inventory[group].reserved}
                low={lowSet.has(group)}
                saving={saving[group] === true}
                disabled={confirming}
                error={rowErrors[group]}
                onCommit={(next) => void saveGroup(group, next)}
              />
            ))}
          </ul>
        </CardBody>
      </Card>

      <div className="space-y-2 rounded-xl border border-border bg-white px-4 py-3 text-xs leading-relaxed text-muted">
        <p>
          <span className="font-semibold text-slate-700">No personal data here.</span> This console holds unit counts
          only. Donor and patient identities are not stored by JeevanSetu 360 and are never shown on this screen.
        </p>
        <p>
          Fictional demo stock for a hackathon prototype. The platform coordinates information between banks, hospitals
          and crews; it does not guarantee that units will be available on arrival. Confirm by phone before a transfer.
        </p>
      </div>
    </div>
  );
}
