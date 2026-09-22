"use client";

import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select, TextArea, TextInput } from "@/components/ui/field";
import { useDraft } from "@/lib/offline";
import { ROHAN_SCENARIO } from "@/lib/seed";
import { SMS_MAX_LENGTH, encodeCase, smsLink, type SmsCase } from "@/lib/sms";
import {
  BLOOD_GROUPS,
  BLOOD_GROUP_LABEL,
  CASE_SEVERITIES,
  RESOURCE_LABEL,
  RESOURCE_TYPES,
  TRIAGE_LABEL,
  TRIAGE_TAGS,
  type BloodGroup,
  type CaseSeverity,
  type ResourceType,
  type TriageTag,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/** Named pickup points, because this demo has no geolocation and a crew has no time to pan a map. */
interface PickupPoint {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

const PICKUP_POINTS: PickupPoint[] = [
  // Taken from ROHAN_SCENARIO rather than copied, so the scripted demo and this screen cannot drift.
  { id: "khapri-mihan", label: "Wardha Road, Khapri / MIHAN gate", lat: ROHAN_SCENARIO.lat, lng: ROHAN_SCENARIO.lng },
  { id: "sitabuldi", label: "Sitabuldi, Variety Square", lat: 21.1458, lng: 79.0782 },
  { id: "dharampeth", label: "Dharampeth, West High Court Road", lat: 21.131, lng: 79.056 },
  { id: "kamptee-road", label: "Kamptee Road, Indora Square", lat: 21.175, lng: 79.102 },
  { id: "hingna-midc", label: "Hingna MIDC, Phase 2 gate", lat: 21.098, lng: 78.956 },
  { id: "sakkardara", label: "Sakkardara Square, Umred Road", lat: 21.121, lng: 79.11 },
  { id: "manish-nagar", label: "Manish Nagar, railway crossing", lat: 21.082, lng: 79.054 },
];

const SEVERITY_LABEL: Record<CaseSeverity, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

type SexValue = "" | "M" | "F" | "OTHER";

/**
 * Everything the composer can hold, as one object.
 *
 * One state value rather than nine, because this single value is exactly what the offline draft
 * saves and restores — split state would need a sync effect that races the restore.
 */
interface ComposeDraft {
  pointId: string;
  severity: CaseSeverity;
  triage: "" | TriageTag;
  requirements: ResourceType[];
  bloodGroup: "" | BloodGroup;
  units: string;
  age: string;
  sex: SexValue;
  notes: string;
}

const EMPTY: ComposeDraft = {
  pointId: PICKUP_POINTS[0].id,
  severity: "CRITICAL",
  triage: "",
  requirements: [],
  bloodGroup: "",
  units: "",
  age: "",
  sex: "",
  notes: "",
};

/** The scripted incident, as a one-tap fill for the presenter. */
const ROHAN_DRAFT: ComposeDraft = {
  pointId: "khapri-mihan",
  severity: ROHAN_SCENARIO.severity,
  triage: "RED",
  requirements: ["ICU", "NEUROSURGEON", "CT_SCAN", "OPERATING_ROOM"],
  bloodGroup: ROHAN_SCENARIO.bloodGroup,
  units: String(ROHAN_SCENARIO.bloodUnitsNeeded),
  age: String(ROHAN_SCENARIO.age),
  sex: ROHAN_SCENARIO.sex,
  notes: "truck v bike head inj femur bleed GCS12 P124 BP90/60",
};

/** Blank when the crew did not record it: an SMS field must never carry a guess. */
function optionalInt(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function pointFor(id: string): PickupPoint {
  return PICKUP_POINTS.find((p) => p.id === id) ?? PICKUP_POINTS[0];
}

/**
 * LEFT column — the crew with no data connection.
 *
 * Produces one SMS and nothing else. There is no submit here on purpose: the point of this
 * panel is that it works on a phone that cannot reach the server at all.
 */
export function ComposePanel() {
  const { draft, setDraft, clearDraft, restoredAt } = useDraft<ComposeDraft>("jeevansetu.relay-compose.v1", EMPTY);
  const [copied, setCopied] = useState(false);
  const ids = useId();

  const patch = (next: Partial<ComposeDraft>) => {
    setDraft({ ...draft, ...next });
    setCopied(false);
  };

  const toggleRequirement = (r: ResourceType) => {
    const has = draft.requirements.includes(r);
    patch({ requirements: has ? draft.requirements.filter((x) => x !== r) : [...draft.requirements, r] });
  };

  const encoded = useMemo(() => {
    const point = pointFor(draft.pointId);
    const smsCase: SmsCase = {
      lat: point.lat,
      lng: point.lng,
      severity: draft.severity,
      triage: draft.triage === "" ? undefined : draft.triage,
      requirements: draft.requirements,
      bloodGroup: draft.bloodGroup === "" ? undefined : draft.bloodGroup,
      units: draft.bloodGroup === "" ? undefined : optionalInt(draft.units),
      age: optionalInt(draft.age),
      sex: draft.sex === "" ? undefined : draft.sex,
      notes: draft.notes,
    };
    return encodeCase(smsCase);
  }, [draft]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(encoded.text);
      setCopied(true);
    } catch {
      // Clipboard is blocked in some venue browsers; the text is on screen and selectable.
      setCopied(false);
    }
  };

  const remaining = SMS_MAX_LENGTH - encoded.length;

  return (
    <Card>
      <CardHeader
        title="Compose — crew with no data"
        subtitle="One SMS carries a whole case when there is no data connection at all."
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => patch(ROHAN_DRAFT)}>
            Fill the example
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              clearDraft();
              setCopied(false);
            }}
          >
            Clear
          </Button>
          {restoredAt !== null && (
            <span className="self-center text-xs text-muted">Restored from this device.</span>
          )}
        </div>

        <Field label="Location" htmlFor={`${ids}-point`} hint="Named pickup points; coordinates go into the message.">
          <Select id={`${ids}-point`} value={draft.pointId} onChange={(e) => patch({ pointId: e.target.value })}>
            {PICKUP_POINTS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Severity" htmlFor={`${ids}-sev`}>
            <Select
              id={`${ids}-sev`}
              value={draft.severity}
              onChange={(e) => patch({ severity: e.target.value as CaseSeverity })}
            >
              {CASE_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Triage tag"
            htmlFor={`${ids}-triage`}
            hint="Set by the responder on scene. The system never assigns one."
          >
            <Select
              id={`${ids}-triage`}
              value={draft.triage}
              onChange={(e) => patch({ triage: e.target.value as "" | TriageTag })}
            >
              <option value="">Not tagged</option>
              {TRIAGE_TAGS.map((t) => (
                <option key={t} value={t}>
                  {TRIAGE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-800">What the patient needs</legend>
          <div className="flex flex-wrap gap-2">
            {RESOURCE_TYPES.map((r) => {
              const on = draft.requirements.includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleRequirement(r)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    on
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                >
                  {RESOURCE_LABEL[r]}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Blood group" htmlFor={`${ids}-blood`}>
            <Select
              id={`${ids}-blood`}
              value={draft.bloodGroup}
              onChange={(e) => patch({ bloodGroup: e.target.value as "" | BloodGroup })}
            >
              <option value="">Not known</option>
              {BLOOD_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {BLOOD_GROUP_LABEL[g]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Units needed" htmlFor={`${ids}-units`}>
            <TextInput
              id={`${ids}-units`}
              inputMode="numeric"
              value={draft.units}
              disabled={draft.bloodGroup === ""}
              onChange={(e) => patch({ units: e.target.value })}
            />
          </Field>
          <Field label="Age" htmlFor={`${ids}-age`}>
            <TextInput
              id={`${ids}-age`}
              inputMode="numeric"
              value={draft.age}
              onChange={(e) => patch({ age: e.target.value })}
            />
          </Field>
          <Field label="Sex" htmlFor={`${ids}-sex`}>
            <Select id={`${ids}-sex`} value={draft.sex} onChange={(e) => patch({ sex: e.target.value as SexValue })}>
              <option value="">Not recorded</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
        </div>

        <Field label="Note" htmlFor={`${ids}-notes`} hint="Whatever room is left in the message goes to this note.">
          <TextArea
            id={`${ids}-notes`}
            className="min-h-[80px]"
            value={draft.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="truck v bike head inj femur bleed"
          />
        </Field>

        <div className="space-y-2 rounded-lg border border-slate-300 bg-slate-50 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-slate-900">Encoded message</span>
            <span
              className={cn(
                "text-xs font-semibold tabular-nums",
                encoded.truncated ? "text-red-700" : remaining <= 20 ? "text-amber-700" : "text-slate-600",
              )}
            >
              {encoded.length} / {SMS_MAX_LENGTH}
            </span>
          </div>
          <p className="break-all rounded-md border border-slate-200 bg-white p-2 font-mono text-xs leading-relaxed text-slate-900">
            {encoded.text}
          </p>
          {encoded.truncated && (
            <p role="alert" className="text-sm font-medium text-red-700">
              The note is being cut off. Everything after {SMS_MAX_LENGTH} characters will not arrive — shorten the
              note, or send the rest in a second message.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy message"}
            </Button>
            <a
              href={smsLink(encoded.text)}
              className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              Open in messages
            </a>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
