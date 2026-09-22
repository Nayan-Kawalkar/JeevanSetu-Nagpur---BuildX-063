"use client";

import { useState } from "react";
import { ResourceChipPicker, ResourceChips } from "@/components/ResourceChips";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { send } from "@/lib/hooks";
import {
  BLOOD_GROUPS,
  BLOOD_GROUP_LABEL,
  type ActorRole,
  type BloodGroup,
  type EmergencyCase,
  type ResourceType,
} from "@/lib/types";
import { Notice } from "./Notice";
import { REQUIREMENT_SOURCE_LABEL } from "./format";
import { useAction } from "./useAction";

/** The fields this panel owns, as the PATCH body allows them. Only changed keys are sent. */
interface CasePatch {
  requirements?: ResourceType[];
  bloodGroup?: BloodGroup | null;
  bloodUnitsNeeded?: number;
  actorRole?: ActorRole;
}

interface Draft {
  requirements: ResourceType[];
  /** "" means the crew has not confirmed a group; the API is sent an explicit null for that. */
  bloodGroup: BloodGroup | "";
  units: number;
}

const MAX_UNITS = 20;

function draftOf(emergencyCase: EmergencyCase): Draft {
  return {
    requirements: emergencyCase.requirements,
    bloodGroup: emergencyCase.bloodGroup ?? "",
    units: emergencyCase.bloodUnitsNeeded ?? 0,
  };
}

/** Order-insensitive fingerprint: reordering chips is not an edit, adding or removing one is. */
function signature(draft: Draft): string {
  return `${[...draft.requirements].sort().join(",")}|${draft.bloodGroup}|${draft.units}`;
}

/**
 * The extracted requirements, and the crew's right to disagree with them.
 *
 * Extraction is a reading of a sentence somebody typed in a moving vehicle, not a diagnosis,
 * and it drives which hospitals are even considered — so it has to be correctable here, before
 * anyone is asked to hold a bed. Save is enabled only when something actually changed, because
 * a no-op save writes an event that makes the timeline lie about what happened.
 */
export function RequirementsEditor({
  emergencyCase,
  locked,
  lockedReason,
  warning,
}: {
  emergencyCase: EmergencyCase;
  locked: boolean;
  lockedReason?: string;
  /** Shown above the controls when an edit now has consequences elsewhere. */
  warning?: string;
}) {
  const { busy, error, run } = useAction();
  const server = draftOf(emergencyCase);
  const serverSignature = signature(server);

  const [draft, setDraft] = useState<Draft>(server);
  const [syncedSignature, setSyncedSignature] = useState(serverSignature);

  // The case is polled every 3 s. When the server's own copy changes, adopt it — unless the crew
  // has unsaved edits on screen, which must never be wiped by a poll landing mid-correction.
  if (serverSignature !== syncedSignature) {
    setSyncedSignature(serverSignature);
    if (signature(draft) === syncedSignature) setDraft(server);
  }

  const dirty = signature(draft) !== serverSignature;
  const saving = busy === "save";
  const source = emergencyCase.requirementSource;

  const setGroup = (value: string) => {
    const group = BLOOD_GROUPS.find((g) => g === value);
    // Retracting the group retracts the units with it: "0 units of nothing" is not a request.
    setDraft((d) => (group ? { ...d, bloodGroup: group } : { ...d, bloodGroup: "", units: 0 }));
  };

  const clampUnits = (value: number) => Math.max(0, Math.min(MAX_UNITS, Math.round(Number.isFinite(value) ? value : 0)));
  const setUnits = (next: number) => setDraft((d) => ({ ...d, units: clampUnits(next) }));
  // Stepping reads the pending value, not the rendered one: two quick taps inside one frame must
  // add two units, not one.
  const stepUnits = (delta: number) => setDraft((d) => ({ ...d, units: clampUnits(d.units + delta) }));

  const save = async () => {
    const patch: CasePatch = { actorRole: "PARAMEDIC" };
    if ([...draft.requirements].sort().join(",") !== [...server.requirements].sort().join(",")) {
      patch.requirements = draft.requirements;
    }
    if (draft.bloodGroup !== server.bloodGroup) {
      patch.bloodGroup = draft.bloodGroup === "" ? null : draft.bloodGroup;
    }
    if (draft.units !== server.units) patch.bloodUnitsNeeded = draft.units;
    await run("save", () => send<{ case: EmergencyCase }>(`/api/cases/${encodeURIComponent(emergencyCase.id)}`, "PATCH", patch));
  };

  return (
    <Card>
      <CardHeader
        title="What this patient needs"
        subtitle="Read from the crew's note. Correct anything that is wrong — it decides which hospitals are even considered."
      />
      <CardBody className="space-y-4">
        <p className="text-xs text-muted">
          {source ? REQUIREMENT_SOURCE_LABEL[source] : "Requirement source not recorded"}
          {source === "MANUAL" ? "" : " · this is a reading of free text, not a clinical assessment"}
        </p>

        {warning && <Notice tone="warning">{warning}</Notice>}

        {emergencyCase.missingInformation.length > 0 && (
          <Notice tone="warning">
            Not confirmed on scene: {emergencyCase.missingInformation.join(", ")}. Matching still runs, but a
            hospital may ask.
          </Notice>
        )}

        {locked ? (
          <div className="space-y-2">
            <ResourceChips requirements={emergencyCase.requirements} />
            <p className="text-sm text-muted">{lockedReason ?? "This case can no longer be edited."}</p>
          </div>
        ) : (
          <fieldset disabled={saving} className="space-y-4">
            <legend className="sr-only">Requirements for this patient</legend>

            <div>
              <p id="requirement-chips-label" className="mb-2 text-sm font-medium text-slate-800">
                Requirements — tap to add or remove
              </p>
              <div aria-labelledby="requirement-chips-label">
                <ResourceChipPicker
                  selected={draft.requirements}
                  onChange={(requirements) => setDraft((d) => ({ ...d, requirements }))}
                  disabled={saving}
                />
              </div>
              {draft.requirements.length === 0 && (
                <p className="mt-2 text-sm text-amber-800">
                  Nothing selected. Matching will rank on travel time alone.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Blood group"
                htmlFor="blood-group"
                hint="Leave unconfirmed rather than guessing — an unconfirmed group is safer than a wrong one."
              >
                <Select id="blood-group" value={draft.bloodGroup} onChange={(e) => setGroup(e.target.value)}>
                  <option value="">Not confirmed</option>
                  {BLOOD_GROUPS.map((group) => (
                    <option key={group} value={group}>
                      {BLOOD_GROUP_LABEL[group]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Units needed"
                htmlFor="blood-units"
                hint={draft.bloodGroup === "" ? "Confirm a blood group first." : `Whole units, up to ${MAX_UNITS}.`}
              >
                <div className="flex items-stretch gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label="One unit fewer"
                    disabled={draft.bloodGroup === "" || draft.units <= 0}
                    onClick={() => stepUnits(-1)}
                  >
                    <span aria-hidden>−</span>
                  </Button>
                  <input
                    id="blood-units"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_UNITS}
                    step={1}
                    value={draft.units}
                    disabled={draft.bloodGroup === ""}
                    onChange={(e) => setUnits(e.target.valueAsNumber)}
                    className="w-20 rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-base font-semibold tabular-nums text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label="One unit more"
                    disabled={draft.bloodGroup === "" || draft.units >= MAX_UNITS}
                    onClick={() => stepUnits(1)}
                  >
                    <span aria-hidden>+</span>
                  </Button>
                </div>
              </Field>
            </div>
          </fieldset>
        )}

        {error && <Notice tone="error">{error}</Notice>}

        {!locked && (
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={() => void save()} disabled={!dirty} loading={saving}>
              Save changes
            </Button>
            {dirty ? (
              <span className="text-sm font-medium text-amber-800">Unsaved changes on this screen</span>
            ) : (
              <span className="text-sm text-muted">Nothing to save</span>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
