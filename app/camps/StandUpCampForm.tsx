"use client";

import { useId, useState } from "react";
import { ResourceChipPicker } from "@/components/ResourceChips";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select, TextInput } from "@/components/ui/field";
import { errorMessage, refreshAll, send } from "@/lib/hooks";
import type { CampSiteSuggestion } from "@/lib/services/camps";
import type { Hospital, ResourceType } from "@/lib/types";

/**
 * The action that makes this screen more than a report.
 *
 * A camp is created as a plain Hospital with tier CAMP, so the moment the POST returns it is in
 * the same matching pool as every standing hospital — same ranking, same map, same capacity
 * board. That is the payoff and the form says so, because "it enters matching immediately" is
 * the difference between a system that describes an overflow and one that answers it.
 *
 * Coordination only: the site is a suggestion with its reasoning attached, and a human names it,
 * sizes it and signs it off.
 */

/** Known Nagpur points a control-room operator can pick without typing coordinates. */
const PRESETS: { id: string; label: string; lat: number; lng: number }[] = [
  { id: "sitabuldi", label: "Sitabuldi (city centre)", lat: 21.144, lng: 79.087 },
  { id: "dharampeth", label: "Dharampeth", lat: 21.1425, lng: 79.0605 },
  { id: "somalwada", label: "Somalwada / Wardha Road", lat: 21.101, lng: 79.0655 },
  { id: "khapri", label: "Khapri", lat: 21.0625, lng: 79.029 },
  { id: "hingna", label: "Hingna MIDC", lat: 21.093, lng: 78.972 },
  { id: "kamptee", label: "Kamptee Road", lat: 21.176, lng: 79.112 },
];

const SUGGESTED = "suggested";
const CUSTOM = "custom";

/** Whole-number beds, but only once the field holds something a person actually typed. */
function parseBeds(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isInteger(value) ? value : undefined;
}

function parseCoord(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export function StandUpCampForm({ suggestion }: { suggestion?: CampSiteSuggestion }) {
  const ids = useId();
  const [name, setName] = useState("");
  const [site, setSite] = useState<string>(suggestion ? SUGGESTED : PRESETS[0].id);
  const [lat, setLat] = useState(String(suggestion?.lat ?? PRESETS[0].lat));
  const [lng, setLng] = useState(String(suggestion?.lng ?? PRESETS[0].lng));
  const [beds, setBeds] = useState("20");
  const [capabilities, setCapabilities] = useState<ResourceType[]>(["EMERGENCY_BED"]);
  const [standUpBy, setStandUpBy] = useState("Control room");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Hospital | null>(null);

  function chooseSite(next: string) {
    setSite(next);
    if (next === SUGGESTED && suggestion) {
      setLat(String(suggestion.lat));
      setLng(String(suggestion.lng));
      return;
    }
    const preset = PRESETS.find((p) => p.id === next);
    if (preset) {
      setLat(String(preset.lat));
      setLng(String(preset.lng));
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const body = {
        name: name.trim(),
        lat: parseCoord(lat),
        lng: parseCoord(lng),
        beds: parseBeds(beds),
        capabilities,
        standUpBy: standUpBy.trim(),
      };
      const result = await send<{ camp: Hospital }>("/api/camps", "POST", body);
      setCreated(result.camp);
      setName("");
      await refreshAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Stand up a camp"
        subtitle="A camp is a real facility in the pool from the second it is created — it is ranked, mapped and counted like any hospital."
      />
      <CardBody className="space-y-4">
        {suggestion && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5">
            <p className="text-sm font-semibold text-sky-900">Suggested site: {suggestion.nearestArea}</p>
            <p className="mt-1 text-sm text-sky-800">
              Siting here serves {suggestion.patientsServed}{" "}
              {suggestion.patientsServed === 1 ? "unplaced patient" : "unplaced patients"} at an average{" "}
              {suggestion.averageEtaMinutes} minutes.
            </p>
            <p className="mt-1 text-xs text-sky-700">
              The point is the centroid of those patients, which minimises aggregate travel — a decision about a
              group that ranking hospitals one patient at a time cannot reach. Move it if the ground says otherwise.
            </p>
          </div>
        )}

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Camp name" required htmlFor={`${ids}-name`} hint="Three characters or more, e.g. “Ring Road relief camp”.">
            <TextInput
              id={`${ids}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ring Road relief camp"
              autoComplete="off"
            />
          </Field>

          <Field label="Location" htmlFor={`${ids}-site`} hint="Pick a known point or enter coordinates.">
            <Select id={`${ids}-site`} value={site} onChange={(e) => chooseSite(e.target.value)}>
              {suggestion && <option value={SUGGESTED}>Suggested site — {suggestion.nearestArea}</option>}
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              <option value={CUSTOM}>Custom coordinates</option>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude" htmlFor={`${ids}-lat`}>
              <TextInput
                id={`${ids}-lat`}
                inputMode="decimal"
                value={lat}
                onChange={(e) => {
                  setLat(e.target.value);
                  setSite(CUSTOM);
                }}
              />
            </Field>
            <Field label="Longitude" htmlFor={`${ids}-lng`}>
              <TextInput
                id={`${ids}-lng`}
                inputMode="decimal"
                value={lng}
                onChange={(e) => {
                  setLng(e.target.value);
                  setSite(CUSTOM);
                }}
              />
            </Field>
          </div>

          <Field label="Beds" required htmlFor={`${ids}-beds`} hint="How many people it can actually hold, 1 to 500.">
            <TextInput
              id={`${ids}-beds`}
              inputMode="numeric"
              value={beds}
              onChange={(e) => setBeds(e.target.value)}
            />
          </Field>

          <Field
            label="Capabilities"
            hint="Only what the camp genuinely has. A camp claiming a neurosurgeon would be ranked for patients it cannot help."
          >
            <ResourceChipPicker selected={capabilities} onChange={setCapabilities} disabled={busy} />
          </Field>

          <Field label="Stood up by" required htmlFor={`${ids}-by`} hint="The person signing this off; it goes on the timeline.">
            <TextInput id={`${ids}-by`} value={standUpBy} onChange={(e) => setStandUpBy(e.target.value)} autoComplete="off" />
          </Field>

          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
              {error}
            </p>
          )}
          {created && (
            <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              <span className="font-semibold">{created.name}</span> ({created.id}) is standing in {created.area} and is in
              the matching pool now. The next ranking can put a patient there.
            </p>
          )}

          <Button type="submit" loading={busy} size="lg" className="w-full sm:w-auto">
            Stand up camp
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
