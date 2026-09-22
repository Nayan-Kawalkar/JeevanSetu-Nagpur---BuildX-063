"use client";

import Link from "next/link";
import { Timeline } from "@/components/Timeline";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage, useLive } from "@/lib/hooks";
import type { CaseStatus, Hospital } from "@/lib/types";
import { AmbulanceControls } from "./AmbulanceControls";
import { FamilyLinkCard } from "./FamilyLinkCard";
import { GoldenHourPanel } from "./GoldenHourPanel";
import { HospitalMatching } from "./HospitalMatching";
import { Notice } from "./Notice";
import { PatientHeader } from "./PatientHeader";
import { RequestStatusPanel } from "./RequestStatusPanel";
import { RequirementsEditor } from "./RequirementsEditor";
import type { CaseDetail } from "./types";

/** Statuses at which the crew has a journey to drive and buttons to press. */
const JOURNEY_STATUSES: readonly CaseStatus[] = ["ACCEPTED", "AMBULANCE_EN_ROUTE", "ARRIVED", "HANDOVER_COMPLETED"];

/** Statuses at which the record is history and must stop inviting edits. */
const FINISHED_STATUSES: readonly CaseStatus[] = ["HANDOVER_COMPLETED", "CLOSED", "CANCELLED"];

/**
 * One emergency, from the crew's side, as a single story down the screen.
 *
 * Everything on this page comes from two polled endpoints, so the patient header, the ranking,
 * the request clock and the timeline can never disagree with each other by a poll. On a phone
 * it reads top to bottom in the order the night actually happens; on a laptop the audit trail
 * sits beside it, because that column is what makes the rest believable.
 */
export function CaseScreen({ caseId }: { caseId: string }) {
  const caseUrl = `/api/cases/${encodeURIComponent(caseId)}`;
  const { data, error, isLoading, mutate } = useLive<CaseDetail>(caseUrl);
  // Names, phone numbers and addresses only; the live capacity figures arrive with the ranking.
  const directory = useLive<{ hospitals: Hospital[] }>("/api/hospitals", { refreshInterval: 15000 });

  if (!data) {
    if (isLoading) {
      return (
        <div className="py-16">
          <Spinner label={`Loading case ${caseId}`} />
        </div>
      );
    }
    return (
      <Card>
        <CardHeader title="This case could not be loaded" subtitle={`Case ${caseId}`} />
        <CardBody className="space-y-4">
          <Notice tone="error">{errorMessage(error)}</Notice>
          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              onClick={() => {
                void mutate();
              }}
            >
              Try again
            </Button>
            <Link
              href="/paramedic"
              className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-base font-medium text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
            >
              Back to all cases
            </Link>
          </div>
        </CardBody>
      </Card>
    );
  }

  const { case: emergencyCase, events, requests, hospital, backupHospital, ambulance } = data;
  const hospitalById = new Map((directory.data?.hospitals ?? []).map((h) => [h.id, h]));
  if (hospital) hospitalById.set(hospital.id, hospital);
  if (backupHospital) hospitalById.set(backupHospital.id, backupHospital);

  const pendingRequest = requests.find((request) => request.status === "PENDING");
  const finished = FINISHED_STATUSES.includes(emergencyCase.status);
  const onJourney = JOURNEY_STATUSES.includes(emergencyCase.status);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/paramedic"
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-slate-700 underline underline-offset-4 hover:text-slate-900"
        >
          ← All cases
        </Link>
        {error !== undefined && (
          <span className="text-sm font-medium text-amber-800" role="status">
            ⚠ Live updates paused — showing the last data received
          </span>
        )}
      </div>

      <PatientHeader emergencyCase={emergencyCase} ambulance={ambulance} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          {/* Highest in the column: the first hour frames every decision below it. */}
          <GoldenHourPanel emergencyCase={emergencyCase} events={events} confirmedHospital={hospital} />

          <RequirementsEditor
            emergencyCase={emergencyCase}
            locked={finished}
            lockedReason={`This case is ${emergencyCase.status.toLowerCase().replace(/_/g, " ")}; the record is closed to edits.`}
            warning={
              emergencyCase.hospitalId && !finished
                ? "A hospital has already accepted this patient and is holding resources. Editing here changes the record, not what is held — call them if the need has changed."
                : undefined
            }
          />

          {/*
            Order flips once an ask exists.

            Before asking, the ranking is the thing you need and the status panel has nothing to
            say. After asking, the opposite is true — and leaving the panel below six full hospital
            cards put the confirmation roughly two screens under the button that caused it, so
            pressing Send looked like it did nothing at all. Whichever of the two matters right now
            goes first.
          */}
          {requests.length > 0 ? (
            <>
              <RequestStatusPanel
                emergencyCase={emergencyCase}
                requests={requests}
                hospitalById={hospitalById}
                backupHospital={backupHospital}
              />
              <HospitalMatching
                emergencyCase={emergencyCase}
                confirmedHospital={hospital}
                pendingRequest={pendingRequest}
              />
            </>
          ) : (
            <>
              <HospitalMatching
                emergencyCase={emergencyCase}
                confirmedHospital={hospital}
                pendingRequest={pendingRequest}
              />
              <RequestStatusPanel
                emergencyCase={emergencyCase}
                requests={requests}
                hospitalById={hospitalById}
                backupHospital={backupHospital}
              />
            </>
          )}

          {onJourney && (
            <AmbulanceControls
              emergencyCase={emergencyCase}
              hospital={hospital}
              backupHospital={backupHospital}
              ambulance={ambulance}
            />
          )}

          {/* Last in the column on purpose: the crew sorts the patient out first, then tells
              the family. It stays visible after handover, because that is exactly when a
              relative who has just been sent the link is refreshing it. */}
          <FamilyLinkCard caseId={emergencyCase.id} />
        </div>

        <aside className="min-w-0">
          <Card className="lg:sticky lg:top-20">
            <CardHeader title="What has happened" subtitle="Every action, in the order it was recorded." />
            <CardBody className="max-h-[70vh] overflow-y-auto">
              <Timeline events={events} emptyLabel="Nothing has been recorded for this case yet." />
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
