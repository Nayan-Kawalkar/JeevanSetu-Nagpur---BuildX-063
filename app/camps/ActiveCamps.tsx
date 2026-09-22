"use client";

import { useState } from "react";
import { ResourceChips } from "@/components/ResourceChips";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { errorMessage, refreshAll, send, useNow } from "@/lib/hooks";
import type { EmergencyCase, Hospital } from "@/lib/types";
import { formatTime, timeAgo } from "@/lib/utils";

/**
 * The camps that are standing, and the one control that folds them.
 *
 * Standing a camp down with patients still routed to it is refused by the API, and that refusal
 * is shown word for word rather than being pre-empted by a disabled button: the sentence names
 * how many cases have to be moved first, which is the thing the operator actually needs, and
 * hiding the button would leave them guessing why the camp will not fold.
 */
export function ActiveCamps({ camps, cases }: { camps: Hospital[]; cases: EmergencyCase[] }) {
  if (camps.length === 0) {
    return (
      <Card>
        <CardHeader title="Active camps" subtitle="Temporary facilities currently in the matching pool." />
        <CardBody>
          <EmptyState
            title="No camp is standing."
            description="The city is being covered by its standing hospitals. Stand a camp up above and it appears here and in matching straight away."
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Active camps"
        subtitle="Temporary facilities in the matching pool right now."
        action={<Badge tone="info">{camps.length} standing</Badge>}
      />
      <CardBody className="space-y-3">
        {camps.map((camp) => (
          <CampRow
            key={camp.id}
            camp={camp}
            routed={cases.filter((c) => c.hospitalId === camp.id || c.backupHospitalId === camp.id)}
          />
        ))}
      </CardBody>
    </Card>
  );
}

function CampRow({ camp, routed }: { camp: Hospital; routed: EmergencyCase[] }) {
  const now = useNow(30_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const beds = camp.resources.EMERGENCY_BED;
  const used = beds.total - beds.available;

  async function standDown() {
    setBusy(true);
    setError(null);
    try {
      await send<{ ok: boolean }>(`/api/camps/${camp.id}`, "DELETE");
      await refreshAll();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  return (
    <div className="rounded-xl border border-border bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{camp.name}</p>
          <p className="text-xs text-muted">
            {camp.id} · {camp.area} · {camp.lat.toFixed(4)}, {camp.lng.toFixed(4)}
          </p>
        </div>
        <Badge tone="info">Emergency camp</Badge>
      </div>

      <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-700">
        <div className="flex gap-1.5">
          <dt className="text-muted">Beds used</dt>
          <dd className="font-semibold tabular-nums">
            {used} of {beds.total}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted">Patients routed here</dt>
          <dd className="font-semibold tabular-nums">{routed.length}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted">Stood up</dt>
          {/* The clock is null on the server and first paint, so the absolute time is shown until it arrives. */}
          <dd className="font-semibold">
            {formatTime(camp.lastUpdatedAt)}
            {now !== null && <span className="font-normal text-muted"> ({timeAgo(camp.lastUpdatedAt, now)})</span>}
          </dd>
        </div>
      </dl>

      <div className="mt-2">
        <ResourceChips requirements={camp.capabilities} size="sm" />
      </div>

      {routed.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          Routed: {routed.map((c) => c.id).join(", ")}. These have to be moved before the camp can fold.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          {error}
        </p>
      )}

      <div className="mt-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={busy}
          onClick={() => {
            void standDown();
          }}
        >
          Stand down camp
        </Button>
      </div>
    </div>
  );
}
