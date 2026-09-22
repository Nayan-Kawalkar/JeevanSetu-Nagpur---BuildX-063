"use client";

import { useState } from "react";
import type { HospitalWithFreshness } from "@/app/api/hospitals/route";
import { FreshnessLabel } from "@/components/labels";
import { OnCallToggle, ResourceCounter } from "@/components/ResourceCounter";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { errorMessage } from "@/lib/hooks";
import {
  COUNTABLE_RESOURCES,
  RESOURCE_LABEL,
  SPECIALIST_TYPES,
  type CountableResource,
  type SpecialistType,
} from "@/lib/types";
import type { HospitalPatch, SaveHospital } from "./HospitalConsole";

/** Key used while the "nothing has changed, but I have looked" confirmation is in flight. */
const CONFIRM_KEY = "CONFIRM";

type SavingKey = CountableResource | SpecialistType | typeof CONFIRM_KEY;

/**
 * How old the numbers are, in words.
 *
 * The age comes from the server (`dataAgeMinutes`), never from a clock read during render, and
 * an unparsable timestamp arrives as a huge number, which is honestly reported as very old
 * rather than rounded into something reassuring.
 */
function ageLabel(minutes: number): string {
  if (minutes >= 60 * 24) return "more than a day";
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return `${minutes} min`;
}

export function ResourceBoard({
  hospital,
  onSave,
}: {
  hospital: HospitalWithFreshness;
  onSave: SaveHospital;
}) {
  const [saving, setSaving] = useState<SavingKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** One write, one busy key, one plain-English failure sentence. */
  async function save(key: SavingKey, what: string, patch: HospitalPatch, optimistic: Parameters<SaveHospital>[1]) {
    setSaving(key);
    setError(null);
    try {
      await onSave(patch, optimistic);
    } catch (err) {
      setError(`${what} was not saved — ${errorMessage(err)}. The figure on screen has been put back to the one the server holds.`);
    } finally {
      setSaving(null);
    }
  }

  function saveResource(resource: CountableResource, available: number) {
    void save(
      resource,
      RESOURCE_LABEL[resource],
      { resources: { [resource]: { available } } },
      (current) => ({
        ...current,
        resources: {
          ...current.resources,
          [resource]: { ...current.resources[resource], available },
        },
      }),
    );
  }

  function saveSpecialist(specialist: SpecialistType, onCall: boolean) {
    void save(
      specialist,
      RESOURCE_LABEL[specialist],
      { specialists: { [specialist]: { onCall } } },
      (current) => ({
        ...current,
        specialists: {
          ...current.specialists,
          [specialist]: { ...current.specialists[specialist], onCall },
        },
      }),
    );
  }

  /** An empty patch is still a confirmation: the numbers were looked at and they stand. */
  function confirmUnchanged() {
    void save(CONFIRM_KEY, "The confirmation", { resources: {} }, (current) => current);
  }

  const busy = saving !== null;

  return (
    <section aria-labelledby="resources-heading">
      <Card>
        <CardHeader
          title={<span id="resources-heading">What this hospital has free</span>}
          subtitle="Each confirmation is what keeps this hospital ranked accurately: matching trusts a count that was just checked more than one nobody has confirmed."
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <FreshnessLabel
              lastUpdatedAt={hospital.lastUpdatedAt}
              stale={hospital.stale}
              updatedBy={hospital.updatedBy}
            />
            {busy && <span className="text-xs font-medium text-slate-600">Saving…</span>}
          </div>

          {hospital.stale && (
            <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">
                <span aria-hidden>⚠</span> Nobody has confirmed these counts for {ageLabel(hospital.dataAgeMinutes)}.
              </p>
              <p className="mt-1 text-sm text-amber-900">
                Please check the ward and correct anything that has changed. Until someone confirms them, every other
                screen shows these numbers as unconfirmed.
              </p>
              <Button
                className="mt-2"
                size="lg"
                variant="secondary"
                loading={saving === CONFIRM_KEY}
                disabled={busy && saving !== CONFIRM_KEY}
                onClick={confirmUnchanged}
              >
                The counts below are correct — confirm now
              </Button>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
              {error}
            </p>
          )}

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Beds and equipment</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {COUNTABLE_RESOURCES.map((resource) => (
                <ResourceCounter
                  key={resource}
                  label={RESOURCE_LABEL[resource]}
                  available={hospital.resources[resource].available}
                  total={hospital.resources[resource].total}
                  disabled={busy}
                  onChange={(next) => saveResource(resource, next)}
                />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">On call right now</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {SPECIALIST_TYPES.map((specialist) => (
                <OnCallToggle
                  key={specialist}
                  label={RESOURCE_LABEL[specialist]}
                  name={hospital.specialists[specialist].name}
                  onCall={hospital.specialists[specialist].onCall}
                  note={hospital.specialists[specialist].note}
                  disabled={busy}
                  onChange={(next) => saveSpecialist(specialist, next)}
                />
              ))}
            </div>
          </div>

          <p className="text-xs text-muted">
            These are the figures your team reports, not a live feed from the ward. Coordination only — nothing here
            is clinical advice.
          </p>
        </CardBody>
      </Card>
    </section>
  );
}
