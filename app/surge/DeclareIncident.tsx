"use client";

import { useState, type FormEvent } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { errorMessage, send } from "@/lib/hooks";
import type { MassCasualtyIncident } from "@/lib/types";
import { cn } from "@/lib/utils";
import { INCIDENT_SITES } from "./constants";

/**
 * ACT 1 — declare.
 *
 * Declaring is the moment the system stops thinking about one patient at a time: every case
 * logged afterwards carries the incident id, and the allocator plans over the whole set instead
 * of ranking hospitals eighty separate times.
 */
export function DeclareIncident({ onDeclared }: { onDeclared: (incident: MassCasualtyIncident) => void | Promise<unknown> }) {
  const [siteId, setSiteId] = useState<string>(INCIDENT_SITES[0].id);
  const [label, setLabel] = useState<string>(`Multi-vehicle pile-up — ${INCIDENT_SITES[0].label}`);
  const [labelEdited, setLabelEdited] = useState(false);
  const [custom, setCustom] = useState(false);
  const [lat, setLat] = useState("21.1458");
  const [lng, setLng] = useState("79.0882");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const site = INCIDENT_SITES.find((s) => s.id === siteId) ?? INCIDENT_SITES[0];
  const latNum = custom ? Number.parseFloat(lat) : site.lat;
  const lngNum = custom ? Number.parseFloat(lng) : site.lng;
  const coordsValid =
    Number.isFinite(latNum) && Number.isFinite(lngNum) && latNum >= 20 && latNum <= 22 && lngNum >= 78 && lngNum <= 80;
  const labelValid = label.trim().length >= 3 && label.trim().length <= 120;

  function chooseSite(id: string) {
    const next = INCIDENT_SITES.find((s) => s.id === id);
    if (!next) return;
    setSiteId(id);
    setCustom(false);
    if (!labelEdited) setLabel(`Multi-vehicle pile-up — ${next.label}`);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!labelValid || !coordsValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await send<{ incident: MassCasualtyIncident }>("/api/incidents", "POST", {
        label: label.trim(),
        lat: latNum,
        lng: lngNum,
      });
      await onDeclared(result.incident);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Declare a mass-casualty incident"
        subtitle="Nothing is allocated until a person declares. Everything logged afterwards is planned as one set, not one patient at a time."
      />
      <CardBody>
        <form className="space-y-5" onSubmit={(e) => void submit(e)}>
          <fieldset className="space-y-2">
            <legend className="block text-sm font-medium text-slate-800">Location</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {INCIDENT_SITES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={!custom && siteId === s.id}
                  onClick={() => chooseSite(s.id)}
                  className={cn(
                    "min-h-11 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2",
                    !custom && siteId === s.id
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
                  )}
                >
                  {s.label}
                  <span
                    className={cn(
                      "mt-0.5 block text-xs tabular-nums",
                      !custom && siteId === s.id ? "text-slate-300" : "text-muted",
                    )}
                  >
                    {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                  </span>
                </button>
              ))}
              <button
                type="button"
                aria-pressed={custom}
                onClick={() => setCustom(true)}
                className={cn(
                  "min-h-11 rounded-lg border border-dashed px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2",
                  custom ? "border-slate-900 bg-slate-100 text-slate-900" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                )}
              >
                Somewhere else — enter coordinates
              </button>
            </div>
          </fieldset>

          {custom && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Latitude" htmlFor="mci-lat" hint="20 to 22" required>
                <TextInput id="mci-lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
              </Field>
              <Field label="Longitude" htmlFor="mci-lng" hint="78 to 80" required>
                <TextInput id="mci-lng" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} />
              </Field>
            </div>
          )}

          <Field
            label="What happened"
            htmlFor="mci-label"
            required
            hint="Shown on every screen that touches this incident, so name it the way the radio would."
            error={label.length > 0 && !labelValid ? "Between 3 and 120 characters." : undefined}
          >
            <TextInput
              id="mci-label"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                setLabelEdited(true);
              }}
            />
          </Field>

          {!coordsValid && (
            <p className="text-sm font-medium text-red-700" role="alert">
              Enter a latitude between 20 and 22 and a longitude between 78 and 80.
            </p>
          )}
          {error && (
            <p className="text-sm font-medium text-red-700" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" variant="danger" className="w-full sm:w-auto" loading={busy} disabled={!labelValid || !coordsValid}>
            Declare incident
          </Button>
          <p className="text-xs text-muted">
            Declaring opens the triage board. Casualties are logged in the next step, and nothing is dispatched
            until a person applies a plan.
          </p>
        </form>
      </CardBody>
    </Card>
  );
}
