"use client";

import Link from "next/link";
import { useState } from "react";
import type { HospitalWithFreshness } from "@/app/api/hospitals/route";
import { Timeline } from "@/components/Timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, TextInput } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage, refreshAll, send, useLive } from "@/lib/hooks";
import type { EmergencyCase, EmergencyEvent, HospitalRequest } from "@/lib/types";
import type { UpdateHospitalInput } from "@/lib/validation";
import { CurrentPatients } from "./CurrentPatients";
import { IncomingRequests } from "./IncomingRequests";
import { ResourceBoard } from "./ResourceBoard";

/** GET /api/hospitals/:id — the whole desk in one read, so nothing on screen is seconds apart. */
export interface HospitalDetail {
  hospital: HospitalWithFreshness;
  pendingRequests: HospitalRequest[];
  cases: Record<string, EmergencyCase>;
}

/** The body of PATCH /api/hospitals/:id without the name, which this console attaches itself. */
export type HospitalPatch = Omit<UpdateHospitalInput, "updatedBy">;

/** Shows the change on screen before the server has answered; reverted if the write fails. */
export type OptimisticHospital = (hospital: HospitalWithFreshness) => HospitalWithFreshness;

export type SaveHospital = (patch: HospitalPatch, optimistic: OptimisticHospital) => Promise<void>;

const TYPE_LABEL: Record<HospitalWithFreshness["type"], string> = {
  GOVERNMENT: "Government",
  PRIVATE: "Private",
};

export function HospitalConsole({ hospitalId }: { hospitalId: string }) {
  const detailUrl = `/api/hospitals/${encodeURIComponent(hospitalId)}`;
  const detail = useLive<HospitalDetail>(detailUrl);
  // The hospital's own slice of the shared audit trail. It is a separate endpoint, so a failing
  // timeline never takes the request queue down with it.
  const events = useLive<{ events: EmergencyEvent[] }>(
    `/api/events?hospitalId=${encodeURIComponent(hospitalId)}&limit=50`,
  );
  const [coordinator, setCoordinator] = useState("");

  /** Trimmed, or undefined so the API falls back to its own "Hospital coordinator" default. */
  const actor = coordinator.trim() === "" ? undefined : coordinator.trim();

  /**
   * Writes one resource or specialist change and shows it immediately.
   *
   * The optimistic copy is what makes a bed counter feel like a switch rather than a form, but
   * it is only ever a claim: `rollbackOnError` puts the old number back if the server refuses,
   * and the caller is handed the failure so it can say so in words.
   */
  const saveHospital: SaveHospital = async (patch, optimistic) => {
    const current = detail.data;
    if (!current) return;
    await detail.mutate(
      async () => {
        await send<{ hospital: HospitalWithFreshness }>(detailUrl, "PATCH", { ...patch, updatedBy: actor });
        return undefined;
      },
      {
        optimisticData: { ...current, hospital: optimistic(current.hospital) },
        rollbackOnError: true,
        revalidate: true,
        populateCache: false,
      },
    );
    // A confirmed bed count changes the ranking every other screen is reading.
    await refreshAll();
  };

  const backLink = (
    <Link
      href="/hospital"
      className="inline-flex min-h-[44px] items-center text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
    >
      <span aria-hidden>←</span>&nbsp;All hospitals
    </Link>
  );

  if (detail.error) {
    return (
      <div className="space-y-4">
        {backLink}
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4">
          <h1 className="text-base font-semibold text-red-800">This hospital console could not be loaded.</h1>
          <p className="mt-1 text-sm text-red-700">{errorMessage(detail.error)}</p>
          <Button className="mt-3" size="lg" variant="danger" onClick={() => void detail.mutate()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const data = detail.data;
  if (!data) {
    return (
      <div className="space-y-4">
        {backLink}
        <div className="py-10">
          <Spinner label="Opening the hospital console" />
        </div>
      </div>
    );
  }

  const hospital = data.hospital;

  return (
    <div className="space-y-6">
      {backLink}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="dark">{hospital.id}</Badge>
            <Badge tone={hospital.type === "GOVERNMENT" ? "info" : "neutral"}>{TYPE_LABEL[hospital.type]}</Badge>
            <span className="text-sm text-muted">{hospital.area}</span>
          </div>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">{hospital.name}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {hospital.address} ·{" "}
            <a
              className="inline-block whitespace-nowrap py-1 font-medium underline decoration-slate-300 hover:text-slate-900"
              href={`tel:${hospital.phone}`}
            >
              {hospital.phone}
            </a>
          </p>
        </div>
        <Field
          label="Your name"
          hint="Recorded against every answer and count you confirm."
          htmlFor="coordinator-name"
          className="w-full sm:w-64"
        >
          <TextInput
            id="coordinator-name"
            value={coordinator}
            onChange={(e) => setCoordinator(e.target.value)}
            placeholder="Hospital coordinator"
            autoComplete="name"
            className="min-h-[44px]"
          />
        </Field>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <IncomingRequests
            requests={data.pendingRequests}
            cases={data.cases}
            respondedBy={actor}
            onChanged={() => void refreshAll()}
          />
          <ResourceBoard hospital={hospital} onSave={saveHospital} />
          <CurrentPatients hospitalId={hospital.id} hospitalName={hospital.name} cases={data.cases} />
        </div>

        <div className="lg:col-span-1">
          <Card className="lg:sticky lg:top-20">
            <CardHeader
              title="Hospital activity"
              subtitle="Everything recorded against this hospital, newest first. Refreshes every 3 seconds."
            />
            <CardBody className="max-h-[70vh] overflow-y-auto">
              {events.error ? (
                <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2">
                  <p className="text-sm font-medium text-red-800">The activity trail could not be loaded.</p>
                  <p className="mt-0.5 text-sm text-red-700">{errorMessage(events.error)}</p>
                  <Button className="mt-2" size="sm" variant="secondary" onClick={() => void events.mutate()}>
                    Try again
                  </Button>
                </div>
              ) : !events.data ? (
                <Spinner label="Loading activity" />
              ) : (
                <Timeline
                  events={events.data.events}
                  emptyLabel="Nothing has been recorded against this hospital yet."
                />
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
