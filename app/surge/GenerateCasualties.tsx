"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { errorMessage, send } from "@/lib/hooks";
import { MAX_GENERATED_CASUALTIES } from "./constants";
import { cn } from "@/lib/utils";

/** The three numbers a presenter actually uses. Nobody should type on stage. */
const PRESETS = [20, 80, 150] as const;

/**
 * Logs casualties against an open incident.
 *
 * One request for the whole count, deliberately. An earlier version split it into batches of
 * twenty-five so a progress bar could fill, and the batches numbered their patients from one
 * each time: the board then showed six patients called MCI-0001-004. Unique case ids are worth
 * more than a determinate bar. Instead the control states plainly what it is doing and for how
 * many, and the board behind it fills the moment the request returns.
 */
export function GenerateCasualties({
  incidentId,
  defaultCount = 80,
  label = "Generate casualties",
  onGenerated,
}: {
  incidentId: string;
  defaultCount?: number;
  label?: string;
  onGenerated: () => void | Promise<unknown>;
}) {
  const [count, setCount] = useState<number>(defaultCount);
  const [raw, setRaw] = useState<string>(String(defaultCount));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = Number.isInteger(count) && count >= 1 && count <= MAX_GENERATED_CASUALTIES;

  function choose(next: number) {
    setCount(next);
    setRaw(String(next));
  }

  async function run() {
    if (!valid) return;
    setError(null);
    setBusy(true);
    try {
      await send(`/api/incidents/${incidentId}`, "POST", { action: "GENERATE", count });
      await onGenerated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Casualty count">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={busy}
              aria-pressed={count === preset}
              onClick={() => choose(preset)}
              className={cn(
                "inline-flex min-h-11 min-w-[4rem] items-center justify-center rounded-lg border px-4 text-base font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:opacity-60",
                count === preset
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
              )}
            >
              {preset}
            </button>
          ))}
        </div>
        <Field label="Or a number" htmlFor="surge-count" className="w-28">
          <TextInput
            id="surge-count"
            inputMode="numeric"
            value={raw}
            disabled={busy}
            onChange={(e) => {
              setRaw(e.target.value);
              const parsed = Number.parseInt(e.target.value, 10);
              setCount(Number.isNaN(parsed) ? -1 : parsed);
            }}
          />
        </Field>
      </div>

      <Button
        type="button"
        size="lg"
        variant="danger"
        className="w-full sm:w-auto"
        disabled={!valid}
        loading={busy}
        onClick={() => void run()}
      >
        {busy ? `Logging ${count} casualties…` : `${label} (${valid ? count : "—"})`}
      </Button>

      {busy && (
        <div>
          {/*
            Indeterminate on purpose: the server logs the whole batch in one transaction, so any
            percentage here would be invented. A moving bar that is honestly a "working" signal
            beats a fake one that claims to know how far along it is.
          */}
          <div
            role="progressbar"
            aria-label="Logging casualties"
            className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
          >
            <div className="h-full w-1/3 animate-pulse rounded-full bg-red-600" />
          </div>
          <p className="mt-1 text-xs text-muted">
            Logging {count} casualties against this incident and re-reading the board.
          </p>
        </div>
      )}

      {!valid && !busy && (
        <p className="text-sm font-medium text-red-700" role="alert">
          Enter a whole number between 1 and {MAX_GENERATED_CASUALTIES}.
        </p>
      )}
      {error && (
        <p className="text-sm font-medium text-red-700" role="alert">
          {error}
        </p>
      )}
      <p className="text-xs text-muted">
        Fictional casualties for the demonstration, with the triage tag recorded as if a crew had tagged them at
        the scene. No real patient data is involved.
      </p>
    </div>
  );
}
