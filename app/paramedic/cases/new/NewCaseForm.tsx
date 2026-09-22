"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { MapView } from "@/components/MapView";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select, TextArea, TextInput, SegmentedControl } from "@/components/ui/field";
import { errorMessage, HttpError, refreshAll, send } from "@/lib/hooks";
import { useDraft, useOnlineStatus, useRetryQueue } from "@/lib/offline";
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
import { ConnectionIndicator } from "./ConnectionIndicator";

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

type Sex = "" | "M" | "F" | "OTHER";

const SEX_OPTIONS: { value: "M" | "F" | "OTHER"; label: string }[] = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "OTHER", label: "Other" },
];

const NOTES_PLACEHOLDER =
  "Truck vs motorcycle, rider thrown. Head injury, briefly unconscious. Deformed right thigh, heavy bleeding, pressure dressing on. Pulse 124, BP 90/60.";

/* -------------------------------------------------------------------------- */
/* The draft                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Everything the crew can type, in one object.
 *
 * The form keeps a single state value rather than nine, because that single value is exactly
 * what the offline draft saves and restores. Split state would need a sync effect, and that
 * effect would race the restore and overwrite the saved draft with an empty form.
 */
interface CaseDraft {
  incidentType: IncidentType;
  severity: CaseSeverity;
  notes: string;
  age: string;
  sex: Sex;
  bloodGroup: "" | BloodGroup;
  units: string;
  locationId: string;
  patientId: string;
}

/**
 * What actually comes back out of localStorage: a shape we hope is a draft.
 *
 * Storage is editable by anyone with the phone and may hold a draft written by an older build,
 * so the restored value is treated as unknown fields and normalised before the form renders it.
 * An unchecked value would put a bogus enum in a select and send it to the API.
 */
type StoredDraft = Partial<Record<keyof CaseDraft, unknown>>;

const DRAFT_KEY = "jeevansetu.new-case-draft.v1";

const EMPTY_DRAFT: CaseDraft = {
  incidentType: "ROAD_ACCIDENT",
  severity: "HIGH",
  notes: "",
  age: "",
  sex: "",
  bloodGroup: "",
  units: "",
  locationId: "",
  patientId: "",
};

const SEX_VALUES: readonly Sex[] = ["", "M", "F", "OTHER"];
const BLOOD_VALUES: readonly ("" | BloodGroup)[] = ["", ...BLOOD_GROUPS];

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeDraft(stored: StoredDraft): CaseDraft {
  const locationId = text(stored.locationId);
  return {
    incidentType: pick(stored.incidentType, INCIDENT_TYPES, EMPTY_DRAFT.incidentType),
    severity: pick(stored.severity, CASE_SEVERITIES, EMPTY_DRAFT.severity),
    notes: text(stored.notes).slice(0, 2000),
    age: text(stored.age).slice(0, 3),
    sex: pick(stored.sex, SEX_VALUES, ""),
    bloodGroup: pick(stored.bloodGroup, BLOOD_VALUES, ""),
    units: text(stored.units).slice(0, 2),
    locationId: PICKUP_POINTS.some((point) => point.id === locationId) ? locationId : "",
    patientId: text(stored.patientId).slice(0, 40),
  };
}

/** HH:MM for the restored-draft notice. Only ever rendered after mount, so no hydration risk. */
function clockLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

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

  const { online } = useOnlineStatus();
  const { queued, enqueue, discard, syncing } = useRetryQueue();
  const { draft, setDraft, clearDraft, restoredAt } = useDraft<StoredDraft>(DRAFT_KEY, EMPTY_DRAFT);

  const form = useMemo(() => normalizeDraft(draft), [draft]);

  const [prefilled, setPrefilled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  /** The queue entry this form created, so the crew can watch their own case leave the phone. */
  const [pendingId, setPendingId] = useState<string | null>(null);

  // A second tap must never open a second case: the button is disabled on the next render, and
  // this ref closes the gap before that render lands.
  const inFlight = useRef(false);

  const location = useMemo(
    () => PICKUP_POINTS.find((p) => p.id === form.locationId),
    [form.locationId],
  );

  const pending = useMemo(
    () => (pendingId === null ? undefined : queued.find((item) => item.id === pendingId)),
    [pendingId, queued],
  );

  // Derived, not stored: the entry left the queue and the crew did not discard it (discarding
  // clears pendingId), so the control room has the case. Deriving it in render keeps this free
  // of a setState-in-effect and its cascading render.
  const sentOffline = pendingId !== null && pending === undefined;

  function update(patch: Partial<CaseDraft>) {
    setDraft({ ...form, ...patch });
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};

    if (form.notes.trim().length < 3) {
      errors.notes = "Write at least a few words about what you can see.";
    } else if (form.notes.trim().length > 2000) {
      errors.notes = "Keep the note under 2000 characters.";
    }

    if (!location) errors.location = "Choose the pickup point.";

    if (form.age.trim() !== "") {
      const value = Number(form.age);
      if (!Number.isInteger(value) || value < 0 || value > 120) {
        errors.age = "Age must be a whole number between 0 and 120, or left blank.";
      }
    }

    if (form.bloodGroup !== "" && form.units.trim() !== "") {
      const value = Number(form.units);
      if (!Number.isInteger(value) || value < 0 || value > 20) {
        errors.units = "Units must be a whole number between 0 and 20.";
      }
    }

    const trimmedId = form.patientId.trim();
    if (trimmedId !== "" && (trimmedId.length < 2 || trimmedId.length > 40)) {
      errors.patientId = "Use 2 to 40 characters, or leave it blank and one is assigned.";
    }

    return errors;
  }

  function prefillRohanScenario() {
    setDraft({
      incidentType: ROHAN_SCENARIO.incidentType,
      severity: ROHAN_SCENARIO.severity,
      notes: ROHAN_SCENARIO.notes,
      age: String(ROHAN_SCENARIO.age),
      sex: ROHAN_SCENARIO.sex,
      bloodGroup: ROHAN_SCENARIO.bloodGroup,
      units: String(ROHAN_SCENARIO.bloodUnitsNeeded),
      patientId: ROHAN_SCENARIO.tempPatientId,
      locationId: ROHAN_LOCATION_ID,
    });
    setFieldErrors({});
    setFormError(null);
    setPrefilled(true);
    setNoticeDismissed(true);
  }

  /** Builds the API body from the current draft; only called once validation has passed. */
  function buildBody(point: PickupPoint): CreateCaseInput {
    const trimmedId = form.patientId.trim();
    return {
      incidentType: form.incidentType,
      severity: form.severity,
      notes: form.notes.trim(),
      lat: point.lat,
      lng: point.lng,
      locationLabel: point.label,
      ...(trimmedId !== "" ? { tempPatientId: trimmedId } : {}),
      ...(form.age.trim() !== "" ? { age: Number(form.age) } : {}),
      ...(form.sex !== "" ? { sex: form.sex } : {}),
      ...(form.bloodGroup !== "" ? { bloodGroup: form.bloodGroup } : {}),
      ...(form.bloodGroup !== "" && form.units.trim() !== ""
        ? { bloodUnitsNeeded: Number(form.units) }
        : {}),
    };
  }

  /**
   * Hands the case to the retry queue and resets the form.
   *
   * The queue entry carries a stable idempotencyKey and is sent at most once by the drain, so a
   * retry after an answer we never saw cannot open a second case. The draft is cleared here
   * because the queue now holds the same text; it is not left in two places.
   */
  function queueForLater(body: CreateCaseInput, reason: string) {
    const id = enqueue({ url: "/api/cases", method: "POST", body: { ...body } });
    setPendingId(id);
    setFormError(null);
    setFieldErrors({});
    setPrefilled(false);
    setNoticeDismissed(true);
    clearDraft();
    inFlight.current = false;
    setSubmitting(false);
    // `reason` is kept for the console only; the crew gets the plain sentence in the notice.
    if (reason !== "") console.info("[new-case] queued offline:", reason);
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

    const body = buildBody(location);

    // Known to be offline: do not spend a failing request, just save it on the phone.
    if (!online) {
      queueForLater(body, "navigator reported offline");
      return;
    }

    try {
      const result = await send<{ case: EmergencyCase }>("/api/cases", "POST", body);
      // The case exists now, so the typed copy on the phone has done its job and goes.
      clearDraft();
      // Stay disabled through the navigation: a second POST would duplicate it.
      router.push(`/paramedic/cases/${result.case.id}`);
      void refreshAll();
    } catch (err) {
      // An HttpError means the server answered and refused: retrying would fail identically, so
      // the crew sees the reason. Anything else is the connection dying mid-send — queue it.
      if (err instanceof HttpError) {
        setFormError(errorMessage(err));
        inFlight.current = false;
        setSubmitting(false);
        return;
      }
      queueForLater(body, errorMessage(err));
    }
  }

  const showRestored = restoredAt !== null && !noticeDismissed;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <ConnectionIndicator />

      {showRestored && (
        <div role="status" className="rounded-xl border border-sky-300 bg-sky-50 px-4 py-3">
          <p className="text-sm font-semibold text-sky-900">Draft restored</p>
          <p className="mt-0.5 text-sm text-sky-800">
            This phone still had an unsent case you were typing at {clockLabel(restoredAt)}. It is back in the
            fields below — check it is still the incident in front of you.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setNoticeDismissed(true)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                clearDraft();
                setFieldErrors({});
                setFormError(null);
                setPrefilled(false);
              }}
            >
              Discard draft
            </Button>
          </div>
        </div>
      )}

      {pending && (
        <div role="status" className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">
            <span aria-hidden>📥 </span>
            Case saved on this phone — not sent yet
          </p>
          <p className="mt-1 text-sm text-amber-900">
            There is no signal right now. The case is stored on this phone and goes to the control room the
            moment there is a connection. Keep this screen open; nothing you typed is lost.
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Saved at {clockLabel(pending.createdAt)}
            {pending.attempts > 0 ? ` · ${pending.attempts} send attempt${pending.attempts === 1 ? "" : "s"}` : ""}
            {syncing ? " · sending now" : ""}
          </p>
          {pending.paused && (
            <p className="mt-1 text-sm font-medium text-amber-900">
              Sending has stopped for now{pending.lastError ? `: ${pending.lastError}` : ""}. Use “Send now”
              above when you have signal, or call the control room by radio.
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => {
              discard(pending.id);
              setPendingId(null);
            }}
          >
            Discard this unsent case
          </Button>
        </div>
      )}

      {sentOffline && (
        <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-900">
            <span aria-hidden>✓ </span>
            The saved case reached the control room
          </p>
          <p className="mt-1 text-sm text-emerald-800">
            It is now in the case list with its hospital matching underway.{" "}
            <Link href="/paramedic" className="font-semibold underline">
              Open the case list
            </Link>
            .
          </p>
        </div>
      )}

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
              value={form.incidentType}
              onChange={(e) => update({ incidentType: pick(e.target.value, INCIDENT_TYPES, form.incidentType) })}
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
              value={form.severity}
              onChange={(severity) => update({ severity })}
              options={CASE_SEVERITIES.map((value) => ({ value, label: SEVERITY_LABEL[value] }))}
              toneFor={(value) => (value === "CRITICAL" ? "bg-red-600 text-white" : "bg-slate-900 text-white")}
            />
            <p className="text-xs text-muted" aria-live="polite">
              Selected: {SEVERITY_LABEL[form.severity]}
              {form.severity === "CRITICAL" ? " — shown in red across every screen." : ""}
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
              value={form.notes}
              onChange={(e) => update({ notes: e.target.value })}
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
                value={form.age}
                onChange={(e) => update({ age: e.target.value })}
                placeholder="e.g. 27"
                disabled={submitting}
                aria-invalid={fieldErrors.age ? true : undefined}
              />
            </Field>

            <Field label="Sex" htmlFor={`${uid}-sex`}>
              <Select
                id={`${uid}-sex`}
                name="sex"
                value={form.sex}
                onChange={(e) => update({ sex: pick(e.target.value, SEX_VALUES, "") })}
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
                value={form.bloodGroup}
                onChange={(e) => update({ bloodGroup: pick(e.target.value, BLOOD_VALUES, "") })}
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

            {form.bloodGroup !== "" && (
              <Field
                label={`Units of ${BLOOD_GROUP_LABEL[form.bloodGroup]} needed`}
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
                  value={form.units}
                  onChange={(e) => update({ units: e.target.value })}
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
              value={form.patientId}
              onChange={(e) => update({ patientId: e.target.value })}
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
              value={form.locationId}
              onChange={(e) => update({ locationId: e.target.value })}
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
            <MapView
              incidents={
                location
                  ? [
                      {
                        id: location.id,
                        label: location.short,
                        lat: location.lat,
                        lng: location.lng,
                        critical: form.severity === "CRITICAL",
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
          {submitting
            ? "Creating case…"
            : online
              ? "Create case and find a hospital"
              : "Save case on this phone"}
        </Button>
      </div>
    </form>
  );
}
