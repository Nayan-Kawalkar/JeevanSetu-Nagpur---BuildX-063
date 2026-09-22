"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage, fetcher, refreshAll, send, useLive } from "@/lib/hooks";
import type { Overview } from "@/lib/services/overview";
import type { SurgePlan } from "@/lib/services/surge";
import type { EmergencyCase, MassCasualtyIncident } from "@/lib/types";
import { AllocationPlan } from "./AllocationPlan";
import { DeclareIncident } from "./DeclareIncident";
import { GenerateCasualties } from "./GenerateCasualties";
import { naiveOutcome, type NaiveFacility } from "./naive";
import { TriageBoard } from "./TriageBoard";

interface IncidentsResponse {
  incidents: MassCasualtyIncident[];
}
interface IncidentDetail {
  incident: MassCasualtyIncident;
  cases: EmergencyCase[];
}
interface PlanResponse {
  plan: SurgePlan;
}
interface AllocateResponse {
  plan: SurgePlan;
  applied: number;
  failed: string[];
}

/**
 * The surge board, as three acts: declare, triage, allocate.
 *
 * The plan is fetched on demand rather than polled. A plan that recomputed itself under the
 * operator's eyes every three seconds would be unreadable, and a plan that applied itself
 * because someone opened a screen would not be decision support. So: press to preview, read it,
 * press again to commit — and the server recomputes on commit, because beds move while you read.
 */
export function SurgeBoard() {
  const incidents = useLive<IncidentsResponse>("/api/incidents?open=true");
  const open = incidents.data?.incidents.find((i) => !i.closedAt) ?? null;
  const detail = useLive<IncidentDetail>(open ? `/api/incidents/${open.id}` : null);
  const overview = useLive<Overview>("/api/overview");

  const [plan, setPlan] = useState<SurgePlan | null>(null);
  const [applied, setApplied] = useState<number | null>(null);
  const [planning, setPlanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [closing, setClosing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const cases = useMemo(() => detail.data?.cases ?? [], [detail.data]);

  const facilities = useMemo<NaiveFacility[]>(
    () =>
      (overview.data?.hospitals ?? []).map((h) => ({
        id: h.hospitalId,
        name: h.name,
        lat: h.lat,
        lng: h.lng,
        icuAvailable: h.icuAvailable,
      })),
    [overview.data],
  );

  const naive = useMemo(() => naiveOutcome(cases, facilities), [cases, facilities]);

  async function reloadIncident() {
    await Promise.all([incidents.mutate(), detail.mutate(), overview.mutate()]);
  }

  async function preview(incidentId: string) {
    setPlanning(true);
    setActionError(null);
    setApplied(null);
    try {
      const result = await fetcher<PlanResponse>(`/api/surge?incidentId=${encodeURIComponent(incidentId)}`);
      setPlan(result.plan);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPlanning(false);
    }
  }

  async function apply(incidentId: string) {
    setApplying(true);
    setActionError(null);
    try {
      const result = await send<AllocateResponse>("/api/surge/allocate", "POST", { incidentId });
      setPlan(result.plan);
      setApplied(result.applied);
      if (result.failed.length > 0) {
        setActionError(`${result.failed.length} case(s) could not be committed: ${result.failed.join(", ")}`);
      }
      await refreshAll();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setApplying(false);
    }
  }

  async function close(incidentId: string) {
    setClosing(true);
    setActionError(null);
    try {
      await send(`/api/incidents/${incidentId}`, "POST", { action: "CLOSE" });
      setPlan(null);
      setApplied(null);
      await refreshAll();
      await reloadIncident();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setClosing(false);
    }
  }

  if (incidents.error) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm font-medium text-red-700" role="alert">
            Could not load incidents: {errorMessage(incidents.error)}
          </p>
          <Button className="mt-3" variant="secondary" onClick={() => void incidents.mutate()}>
            Try again
          </Button>
        </CardBody>
      </Card>
    );
  }

  if (!incidents.data) {
    return (
      <Card>
        <CardBody>
          <Spinner label="Checking for an open incident" />
        </CardBody>
      </Card>
    );
  }

  // ---------- ACT 1 ----------
  if (!open) {
    return (
      <div className="space-y-4">
        <DeclareIncident
          onDeclared={async () => {
            setPlan(null);
            setApplied(null);
            await reloadIncident();
          }}
        />
        <EmptyState
          title="No mass-casualty incident is open"
          description="Declare one above. The triage board and the allocator appear as soon as it exists."
        />
      </div>
    );
  }

  const noCasualties = cases.length === 0;

  return (
    <div className="space-y-4">
      <Card className="border-red-300">
        <CardHeader
          title={open.label}
          subtitle={`${open.id} · declared by ${open.declaredBy} · ${open.caseIds.length} casualties logged`}
          action={
            <Button variant="secondary" size="sm" loading={closing} onClick={() => void close(open.id)}>
              Close incident
            </Button>
          }
        />
        <CardBody>
          <GenerateCasualties
            incidentId={open.id}
            label={noCasualties ? "Generate casualties" : "Log more casualties"}
            onGenerated={reloadIncident}
          />
        </CardBody>
      </Card>

      {detail.error ? (
        <Card>
          <CardBody>
            <p className="text-sm font-medium text-red-700" role="alert">
              Could not load this incident&apos;s casualties: {errorMessage(detail.error)}
            </p>
          </CardBody>
        </Card>
      ) : !detail.data ? (
        <Card>
          <CardBody>
            <Spinner label="Loading the triage board" />
          </CardBody>
        </Card>
      ) : (
        <TriageBoard incident={detail.data.incident} cases={cases} hospitals={overview.data?.hospitals ?? []} />
      )}

      {/* ---------- ACT 3 ---------- */}
      <Card className="border-2 border-slate-900">
        <CardHeader
          title="Allocate all"
          subtitle="One pass over every casualty at once, in triage order, against a ledger that decrements as each is placed."
          action={plan ? <Badge tone={applied === null ? "info" : "success"}>{applied === null ? "Previewed" : "Applied"}</Badge> : undefined}
        />
        <CardBody className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              size="lg"
              className="w-full sm:w-auto"
              loading={planning}
              disabled={noCasualties}
              onClick={() => void preview(open.id)}
            >
              Allocate all {cases.length > 0 ? `(${cases.length})` : ""}
            </Button>
            <Button
              size="lg"
              variant="success"
              className="w-full sm:w-auto"
              loading={applying}
              disabled={plan === null || applied !== null}
              onClick={() => void apply(open.id)}
            >
              {applied === null ? "Apply plan" : "Plan applied"}
            </Button>
          </div>
          {noCasualties && <p className="text-sm text-muted">Log casualties first — there is nothing to allocate.</p>}
          {plan !== null && applied === null && (
            <p className="text-sm text-slate-700">
              This is a preview. Nothing is dispatched and no bed is held until you apply it, and applying
              recomputes the plan against the beds that exist at that moment.
            </p>
          )}
          {actionError && (
            <p className="text-sm font-medium text-red-700" role="alert">
              {actionError}
            </p>
          )}
        </CardBody>
      </Card>

      {planning && !plan && (
        <Card>
          <CardBody>
            <Spinner label={`Allocating ${cases.length} casualties against live capacity`} />
          </CardBody>
        </Card>
      )}

      {plan && <AllocationPlan plan={plan} naive={naive} applied={applied} />}
    </div>
  );
}
