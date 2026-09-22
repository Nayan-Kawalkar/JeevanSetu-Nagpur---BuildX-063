"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FreshnessLabel } from "@/components/labels";
import { send } from "@/lib/hooks";
import { ACTIVE_STATUSES, type Ambulance, type CaseStatus, type EmergencyCase, type Hospital } from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { Notice } from "./Notice";
import { useAction } from "./useAction";

type JourneyAction = "START_JOURNEY" | "ARRIVED" | "COMPLETE_HANDOVER" | "CLOSE";

/**
 * The one step that is legal from here, mirroring the state machine in the case service.
 * Only one is ever offered: a button that exists but fails with a 409 teaches a crew to
 * distrust the screen.
 */
const NEXT_STEP: Partial<Record<CaseStatus, { action: JourneyAction; label: string; hint: string }>> = {
  ACCEPTED: {
    action: "START_JOURNEY",
    label: "Start journey",
    hint: "Tells the hospital and the control room that you are moving.",
  },
  AMBULANCE_EN_ROUTE: {
    action: "ARRIVED",
    label: "Arrived at hospital",
    hint: "Press on arrival at the door, before handover.",
  },
  ARRIVED: {
    action: "COMPLETE_HANDOVER",
    label: "Handover complete",
    hint: "The held bed and blood become in use, not returned to stock.",
  },
  HANDOVER_COMPLETED: {
    action: "CLOSE",
    label: "Close case",
    hint: "Puts the crew back in service.",
  },
};

/**
 * The four buttons a crew actually presses, and the destination they are pressing them for.
 *
 * Cancel is deliberately quieter and asks once more, because it hands back an ICU bed and the
 * blood units being kept for this patient — a bed that goes back into circulation is not
 * something to undo with a second tap.
 */
export function AmbulanceControls({
  emergencyCase,
  hospital,
  backupHospital,
  ambulance,
}: {
  emergencyCase: EmergencyCase;
  hospital?: Hospital;
  backupHospital?: Hospital;
  ambulance?: Ambulance;
}) {
  const { busy, error, run } = useAction();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const step = NEXT_STEP[emergencyCase.status];
  const cancellable = ACTIVE_STATUSES.includes(emergencyCase.status);
  const eta = hospital
    ? emergencyCase.lastMatch?.ranked.find((r) => r.hospitalId === hospital.id)?.etaMinutes
    : undefined;

  const advance = async (action: JourneyAction | "CANCEL") => {
    setConfirmingCancel(false);
    await run(action, () =>
      send<{ case: EmergencyCase }>(`/api/cases/${encodeURIComponent(emergencyCase.id)}/status`, "POST", {
        action,
        actorRole: "PARAMEDIC",
      }),
    );
  };

  return (
    <Card>
      <CardHeader
        title="The run"
        subtitle="Each step is recorded with a timestamp, so the hospital and the control room see the same journey."
      />
      <CardBody className="space-y-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-900">Confirmed destination</p>
          {hospital ? (
            <>
              <p className="text-lg font-semibold text-emerald-950">{hospital.name}</p>
              <p className="text-sm text-emerald-900">
                {hospital.area} ·{" "}
                <a className="font-semibold underline underline-offset-2" href={`tel:${hospital.phone}`}>
                  {hospital.phone}
                </a>
              </p>
              <p className="mt-1 text-sm text-emerald-900">
                {eta === undefined
                  ? "No travel estimate was recorded with the ranking."
                  : `About ${eta} min away by road`}
                {emergencyCase.lastMatch ? ` · estimated when the ranking was taken at ${formatTime(emergencyCase.lastMatch.at)}` : ""}
              </p>
              <p className="mt-1">
                <FreshnessLabel lastUpdatedAt={hospital.lastUpdatedAt} updatedBy={hospital.updatedBy} />
              </p>
            </>
          ) : (
            <p className="text-sm text-emerald-900">
              The accepting hospital is no longer in the directory. Call the control room before moving.
            </p>
          )}
          <p className="mt-2 text-sm text-emerald-900">
            Backup: {backupHospital ? `${backupHospital.name} (${backupHospital.phone})` : "none ranked"}
          </p>
          {ambulance && (
            <p className="mt-1 text-sm text-emerald-900">
              Crew {ambulance.callSign} · status {ambulance.status.toLowerCase().replace(/_/g, " ")}
            </p>
          )}
        </div>

        {error && <Notice tone="error">{error}</Notice>}

        {step ? (
          <div>
            <Button
              size="lg"
              variant="success"
              className="w-full py-4 text-lg"
              loading={busy === step.action}
              disabled={busy !== null}
              onClick={() => void advance(step.action)}
            >
              {step.label}
            </Button>
            <p className="mt-1.5 text-sm text-muted">{step.hint}</p>
          </div>
        ) : (
          <p className="text-sm text-muted">
            No further step is possible: this case is {emergencyCase.status.toLowerCase().replace(/_/g, " ")}.
          </p>
        )}

        {cancellable &&
          (confirmingCancel ? (
            <div className="space-y-3 rounded-xl border border-red-300 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-900">
                Cancelling releases every bed and blood unit being held for this patient and puts the crew back
                in service. It cannot be undone.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="danger"
                  size="lg"
                  className="sm:flex-1"
                  loading={busy === "CANCEL"}
                  disabled={busy !== null}
                  onClick={() => void advance("CANCEL")}
                >
                  Yes, cancel this case
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  className="sm:flex-1"
                  disabled={busy !== null}
                  onClick={() => setConfirmingCancel(false)}
                >
                  Keep the case
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="lg"
              className="w-full border border-slate-300 text-slate-700"
              disabled={busy !== null}
              onClick={() => setConfirmingCancel(true)}
            >
              Cancel this case
            </Button>
          ))}
      </CardBody>
    </Card>
  );
}
