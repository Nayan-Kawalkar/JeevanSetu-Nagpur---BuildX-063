"use client";

import { useMemo } from "react";
import { MapView, type MapHospital, type MapPoint } from "@/components/MapView";
import { ResourceChips } from "@/components/ResourceChips";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useNow } from "@/lib/hooks";
import type { CapacitySnapshot } from "@/lib/services/overview";
import {
  TRIAGE_LABEL,
  TRIAGE_ORDER,
  TRIAGE_TAGS,
  triageFromSeverity,
  type EmergencyCase,
  type MassCasualtyIncident,
  type TriageTag,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { TRIAGE_STYLE } from "./triage";

/** The tag we display: the one a human recorded, else the default from the crew's severity. */
export function triageOf(c: EmergencyCase): TriageTag {
  return c.triage ?? triageFromSeverity(c.severity);
}

/** A casualty counts as placed once a facility is actually named against the case. */
function isPlaced(c: EmergencyCase): boolean {
  return Boolean(c.hospitalId);
}

function minutesSince(iso: string, now: number): number {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return 0;
  return Math.max(0, Math.round((now - at) / 60_000));
}

/** HH:MM, the honest thing to show before the client clock exists. */
function clockTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toISOString().slice(11, 16) + " UTC";
}

/**
 * ACT 2 — the triage board.
 *
 * Four counts, a map, and every casualty with what they need and how long they have been
 * waiting. Colour never carries a meaning on its own here: each tag shows its START word.
 */
export function TriageBoard({
  incident,
  cases,
  hospitals,
}: {
  incident: MassCasualtyIncident;
  cases: EmergencyCase[];
  hospitals: CapacitySnapshot[];
}) {
  const now = useNow(15_000);

  const totals = useMemo(() => {
    const counts: Record<TriageTag, number> = { RED: 0, YELLOW: 0, GREEN: 0, BLACK: 0 };
    for (const c of cases) counts[triageOf(c)] += 1;
    return counts;
  }, [cases]);

  const placed = cases.filter(isPlaced).length;
  const waiting = cases.length - placed;

  const sorted = useMemo(
    () =>
      [...cases].sort((a, b) => {
        const byTag = TRIAGE_ORDER[triageOf(a)] - TRIAGE_ORDER[triageOf(b)];
        if (byTag !== 0) return byTag;
        return Date.parse(a.incidentAt ?? a.createdAt) - Date.parse(b.incidentAt ?? b.createdAt);
      }),
    [cases],
  );

  const mapHospitals = useMemo<MapHospital[]>(
    () =>
      hospitals.map((h) => ({
        id: h.hospitalId,
        name: h.name,
        lat: h.lat,
        lng: h.lng,
        band: h.capacityBand,
        icuAvailable: h.icuAvailable,
        stale: h.stale,
      })),
    [hospitals],
  );

  const mapIncidents = useMemo<MapPoint[]>(
    () => [{ id: incident.id, label: incident.label, lat: incident.lat, lng: incident.lng, critical: true }],
    [incident],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TRIAGE_TAGS.map((tag) => {
          const style = TRIAGE_STYLE[tag];
          return (
            <div key={tag} className={cn("rounded-xl border p-4", style.tile)}>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-700">{tag}</p>
              <p className={cn("mt-1 text-4xl font-bold tabular-nums", style.value)}>{totals[tag]}</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{TRIAGE_LABEL[tag]}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Casualties</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{cases.length}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Placed</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-700">{placed}</p>
        </div>
        <div className={cn("rounded-xl border p-4", waiting > 0 ? "border-red-200 bg-red-50" : "border-border bg-white")}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Waiting</p>
          <p className={cn("mt-1 text-3xl font-bold tabular-nums", waiting > 0 ? "text-red-700" : "text-slate-900")}>
            {waiting}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Scene and facilities"
          subtitle="Straight-line positions on a fixed projection, not driving routes."
          action={<Badge tone="danger">{incident.id}</Badge>}
        />
        <CardBody className="p-3">
          <MapView hospitals={mapHospitals} incidents={mapIncidents} height={380} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Casualty list"
          subtitle="Immediate first, then by how long they have been waiting — never by the order they were logged."
          action={<Badge tone="neutral">{cases.length}</Badge>}
        />
        <CardBody className="p-0">
          {cases.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No casualties logged yet"
                description="Use the control above to log casualties against this incident."
              />
            </div>
          ) : (
            <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto">
              {sorted.map((c) => {
                const tag = triageOf(c);
                const style = TRIAGE_STYLE[tag];
                const since = c.incidentAt ?? c.createdAt;
                return (
                  <li key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ring-1 ring-inset",
                            style.chip,
                          )}
                        >
                          {tag} · {TRIAGE_LABEL[tag]}
                        </span>
                        <span className="text-sm font-semibold text-slate-900">{c.tempPatientId}</span>
                        <span className="text-xs text-muted">{c.id}</span>
                      </div>
                      <ResourceChips requirements={c.requirements} size="sm" />
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <p className="text-sm font-semibold tabular-nums text-slate-900">
                        {now === null ? clockTime(since) : `${minutesSince(since, now)} min waiting`}
                      </p>
                      <p className="text-xs text-muted">
                        {c.hospitalId ? `Placed · ${c.hospitalId}` : "Not yet placed"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
