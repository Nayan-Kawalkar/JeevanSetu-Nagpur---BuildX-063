"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { NagpurMap } from "@/components/NagpurMap";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select, TextArea, TextInput, SegmentedControl } from "@/components/ui/field";
import { errorMessage, refreshAll, send } from "@/lib/hooks";
import { ROHAN_SCENARIO } from "@/lib/seed";
import {
  BLOOD_GROUPS,
  BLOOD_GROUP_LABEL,
  CASE_SEVERITIES,
  INCIDENT_LABEL,
  INCIDENT_TYPES,
  type BloodGroup,
  type CaseSeverity,
  type EmergencyCase,
  type IncidentType,
} from "@/lib/types";
import type { CreateCaseInput } from "@/lib/validation";

/**
 * Named pickup points, because this demo has no geolocation.
 *
 * Coordinates are hardcoded here on purpose: a dropdown of real Nagpur landmarks is faster and
 * far more reliable on a venue network than a map the crew has to pan. The Khapri entry carries
 * the exact coordinates and wording of the scripted demo incident (see ROHAN_SCENARIO).
 */
interface PickupPoint {
  id: string;
  /** Sent to the API as locationLabel. */
  label: string;
  /** Short form, used on the map pin where space is tight. */
  short: string;
  lat: number;
  lng: number;
}

const ROHAN_LOCATION_ID = "khapri-mihan";

const PICKUP_POINTS: PickupPoint[] = [
  {
    id: ROHAN_LOCATION_ID,
    // Taken from ROHAN_SCENARIO rather than copied, so the prefill and the map pin cannot drift.
    label: ROHAN_SCENARIO.locationLabel,
    short: "Khapri / MIHAN gate",
    lat: ROHAN_SCENARIO.lat,
    lng: ROHAN_SCENARIO.lng,
  },
  {
    id: "sitabuldi",
    label: "Sitabuldi main road, near Variety Square",
    short: "Sitabuldi",
    lat: 21.1458,
    lng: 79.0782,
  },
  {
    id: "dharampeth",
    label: "Dharampeth, West High Court Road",
    short: "Dharampeth",
    lat: 21.131,
    lng: 79.056,
  },
  {
    id: "kamptee-road",
    label: "Kamptee Road near Indora Square",
    short: "Kamptee Road",
    lat: 21.175,
    lng: 79.102,
  },
  {
    id: "hingna-midc",
    label: "Hingna MIDC, near the Phase 2 gate",
    short: "Hingna MIDC",
    lat: 21.098,
    lng: 78.956,
  },
  {
    id: "sakkardara",
    label: "Sakkardara Square, Umred Road",
    short: "Sakkardara",
    lat: 21.121,
    lng: 79.11,
  },
  {
    id: "manish-nagar",
    label: "Manish Nagar, near the railway crossing",
    short: "Manish Nagar",
    lat: 21.082,
    lng: 79.054,
  },
  {
    id: "pratap-nagar",
    label: "Pratap Nagar Square, Ring Road",
    short: "Pratap Nagar",
    lat: 21.112,
    lng: 79.039,
  },
];

const SEVERITY_LABEL: Record<CaseSeverity, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const SEX_OPTIONS: { value: "M" | "F" | "OTHER"; label: string }[] = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "OTHER", label: "Other" },
];

const NOTES_PLACEHOLDER =
  "Truck vs motorcycle, rider thrown. Head injury, briefly unconscious. Deformed right thigh, heavy bleeding, pressure dressing on. Pulse 124, BP 90/60.";

type FieldErrors = {
  notes?: string;
  location?: string;
  age?: string;
  units?: string;
  patientId?: string;
};

export function NewCaseForm() {
  const router = useRouter();
  const uid = useId();

  const [incidentType, setIncidentType] = useState<IncidentType>("ROAD_ACCIDENT");
  const [severity, setSeverity] = useState<CaseSeverity>("HIGH");
  const [notes, setNotes] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"" | "M" | "F" | "OTHER">("");
  const [bloodGroup, setBloodGroup] = useState<"" | BloodGroup>("");
  const [units, setUnits] = useState("");
  const [locationId, setLocationId] = useState("");
  const [patientId, setPatientId] = useState("");

  const [prefilled, setPrefilled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // A second tap must never open a second case: the button is disabled on the next render, and
  // this ref closes the gap before that render lands.
  const inFlight = useRef(false);

  const location = useMemo(() => PICKUP_POINTS.find((p) => p.id === locationId), [locationId]);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};

    if (notes.trim().length < 3) {
      errors.notes = "Write at least a few words about what you can see.";
    } else if (notes.trim().length > 2000) {
      errors.notes = "Keep the note under 2000 characters.";
    }

    if (!location) errors.location = "Choose the pickup point.";

    if (age.trim() !== "") {
      const value = Number(age);
      if (!Number.isInteger(value) || value < 0 || value > 120) {
        errors.age = "Age must be a whole number between 0 and 120, or left blank.";
      }
    }

    if (bloodGroup !== "" && units.trim() !== "") {
      const value = Number(units);
      if (!Number.isInteger(value) || value < 0 || value > 20) {
        errors.units = "Units must be a whole number between 0 and 20.";
      }
    }

    const trimmedId = patientId.trim();
    if (trimmedId !== "" && (trimmedId.length < 2 || trimmedId.length > 40)) {
      errors.patientId = "Use 2 to 40 characters, or leave it blank and one is assigned.";
    }

    return errors;
  }

  function prefillRohanScenario() {
    setIncidentType(ROHAN_SCENARIO.incidentType);
    setSeverity(ROHAN_SCENARIO.severity);
    setNotes(ROHAN_SCENARIO.notes);
    setAge(String(ROHAN_SCENARIO.age));
    setSex(ROHAN_SCENARIO.sex);
    setBloodGroup(ROHAN_SCENARIO.bloodGroup);
    setUnits(String(ROHAN_SCENARIO.bloodUnitsNeeded));
    setPatientId(ROHAN_SCENARIO.tempPatientId);
    setLocationId(ROHAN_LOCATION_ID);
    setFieldErrors({});
    setFormError(null);
    setPrefilled(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setFormError("Some details are still missing. The fields below say what is needed.");
      return;
    }
    if (!location) return; // Narrowing for TypeScript; validate() already reported this.

    inFlight.current = true;
    setSubmitting(true);
    setFormError(null);

    const trimmedId = patientId.trim();
    const body: CreateCaseInput = {
      incidentType,
      severity,
      notes: notes.trim(),
      lat: location.lat,
      lng: location.lng,
      locationLabel: location.label,
      ...(trimmedId !== "" ? { tempPatientId: trimmedId } : {}),
      ...(age.trim() !== "" ? { age: Number(age) } : {}),
      ...(sex !== "" ? { sex } : {}),
      ...(bloodGroup !== "" ? { bloodGroup } : {}),
      ...(bloodGroup !== "" && units.trim() !== "" ? { bloodUnitsNeeded: Number(units) } : {}),
    };

    try {
      const result = await send<{ case: EmergencyCase }>("/api/cases", "POST", body);
      // Stay disabled through the navigation: the case exists now, a second POST would duplicate it.
      router.push(`/paramedic/cases/${result.case.id}`);
      void refreshAll();
    } catch (err) {
      setFormError(errorMessage(err));
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 px-4 py-3">
        <p className="text-sm font-semibold text-amber-900">Demo data</p>
        <p className="mt-0.5 text-sm text-amber-800">
          Fills every field with the scripted Rohan incident — a fictional patient used for the stage walkthrough.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={prefillRohanScenario}
          className="mt-3 w-full border-amber-500 text-amber-900 hover:bg-amber-100 sm:w-auto"
        >
          Prefill Rohan scenario
        </Button>
        <p aria-live="polite" className="mt-2 min-h-[1.25rem] text-sm font-medium text-amber-900">
          {prefilled ? "✓ Form filled with the demo scenario. Edit anything before you submit." : ""}
        </p>
      </div>

      <Card>
        <CardHeader title="The incident" subtitle="Two taps and a sentence is enough to start." />
        <CardBody className="space-y-4">
          <Field label="Incident type" htmlFor={`${uid}-incident`} required>
            <Select
              id={`${uid}-incident`}
              name="incidentType"
              value={incidentType}
              onChange={(e) => setIncidentType(e.target.value as IncidentType)}
              disabled={submitting}
            >
              {INCIDENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {INCIDENT_LABEL[type]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-slate-800">
              Severity
              <span className="ml-1 text-red-600" aria-hidden>
                *
              </span>
            </span>
            <SegmentedControl<CaseSeverity>
              name="Severity"
              value={severity}
              onChange={setSeverity}
              options={CASE_SEVERITIES.map((value) => ({ value, label: SEVERITY_LABEL[value] }))}
              toneFor={(value) => (value === "CRITICAL" ? "bg-red-600 text-white" : "bg-slate-900 text-white")}
            />
            <p className="text-xs text-muted" aria-live="polite">
              Selected: {SEVERITY_LABEL[severity]}
              {severity === "CRITICAL" ? " — shown in red across every screen." : ""}
            </p>
          </div>

          <Field
            label="What do you see?"
            htmlFor={`${uid}-notes`}
            required
            error={fieldErrors.notes}
            hint="Mechanism, what is bleeding or blocked, and any numbers you have. Plain words are fine."
          >
            <TextArea
              id={`${uid}-notes`}
              name="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={NOTES_PLACEHOLDER}
              disabled={submitting}
              aria-invalid={fieldErrors.notes ? true : undefined}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="The patient" subtitle="All optional — send the case without them if you are moving." />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Age" htmlFor={`${uid}-age`} error={fieldErrors.age} hint="Years. An estimate is fine.">
              <TextInput
                id={`${uid}-age`}
                name="age"
                type="number"
                inputMode="numeric"
                min={0}
                max={120}
                step={1}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="e.g. 27"
                disabled={submitting}
                aria-invalid={fieldErrors.age ? true : undefined}
              />
            </Field>

            <Field label="Sex" htmlFor={`${uid}-sex`}>
              <Select
                id={`${uid}-sex`}
                name="sex"
                value={sex}
                onChange={(e) => setSex(e.target.value as "" | "M" | "F" | "OTHER")}
                disabled={submitting}
              >
                <option value="">Not known</option>
                {SEX_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Blood group" htmlFor={`${uid}-blood`} hint="Leave as not known unless a card or band confirms it.">
              <Select
                id={`${uid}-blood`}
                name="bloodGroup"
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value as "" | BloodGroup)}
                disabled={submitting}
              >
                <option value="">Not known</option>
                {BLOOD_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {BLOOD_GROUP_LABEL[group]}
                  </option>
                ))}
              </Select>
            </Field>

            {bloodGroup !== "" && (
              <Field
                label={`Units of ${BLOOD_GROUP_LABEL[bloodGroup]} needed`}
                htmlFor={`${uid}-units`}
                error={fieldErrors.units}
                hint="Your own estimate, so the blood bank can hold stock."
              >
                <TextInput
                  id={`${uid}-units`}
                  name="bloodUnitsNeeded"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={20}
                  step={1}
                  value={units}
                  onChange={(e) => setUnits(e.target.value)}
                  placeholder="e.g. 2"
                  disabled={submitting}
                  aria-invalid={fieldErrors.units ? true : undefined}
                />
              </Field>
            )}
          </div>

          <Field
            label="Temporary patient id"
            htmlFor={`${uid}-patient-id`}
            error={fieldErrors.patientId}
            hint="Leave blank and the system assigns one. No name is stored."
          >
            <TextInput
              id={`${uid}-patient-id`}
              name="tempPatientId"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="e.g. TMP-BIKE-01"
              disabled={submitting}
              aria-invalid={fieldErrors.patientId ? true : undefined}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Where you are" subtitle="No GPS in this demo — pick the nearest named point." />
        <CardBody className="space-y-4">
          <Field label="Pickup point" htmlFor={`${uid}-location`} required error={fieldErrors.location}>
            <Select
              id={`${uid}-location`}
              name="location"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              disabled={submitting}
              aria-invalid={fieldErrors.location ? true : undefined}
            >
              <option value="">Choose a pickup point…</option>
              {PICKUP_POINTS.map((point) => (
                <option key={point.id} value={point.id}>
                  {point.label}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <NagpurMap
              incidents={
                location
                  ? [
                      {
                        id: location.id,
                        label: location.short,
                        lat: location.lat,
                        lng: location.lng,
                        critical: severity === "CRITICAL",
                      },
                    ]
                  : []
              }
              height={220}
              showLabels={false}
            />
            <p className="mt-2 text-xs text-muted">
              {location
                ? `Pin at ${location.short} · ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}. Check it is the right spot before you send.`
                : "Pick a point above and it appears on the map."}
            </p>
          </div>
        </CardBody>
      </Card>

      {formError && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-800">
            <span aria-hidden>⚠ </span>
            Case not created
          </p>
          <p className="mt-1 text-sm text-red-700">{formError}</p>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 pb-2 sm:flex-row sm:items-center sm:justify-end">
        <Link
          href="/paramedic"
          className="inline-flex min-h-[48px] items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
        >
          Cancel
        </Link>
        <Button
          type="submit"
          size="lg"
          loading={submitting}
          className="min-h-[56px] w-full bg-red-600 text-base hover:bg-red-700 disabled:bg-red-300 sm:w-auto"
        >
          {submitting ? "Creating case…" : "Create case and find a hospital"}
        </Button>
      </div>
    </form>
  );
}
