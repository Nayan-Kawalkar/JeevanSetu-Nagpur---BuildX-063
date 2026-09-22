"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, TextArea } from "@/components/ui/field";
import { errorMessage, refreshAll, send } from "@/lib/hooks";
import type { SmsCase } from "@/lib/sms";
import {
  BLOOD_GROUP_LABEL,
  RESOURCE_LABEL,
  TRIAGE_LABEL,
  type EmergencyCase,
} from "@/lib/types";

/** A valid Rohan-style message, so a presenter can demonstrate in one tap without typing. */
const EXAMPLE = "JS1|21.0455,79.0140|CRIT|RED|ICU,NEU,CT,OR|ONEG:2|M27|truck v bike head inj femur bleed";

interface DecodeResponse {
  case: EmergencyCase;
  decoded: SmsCase;
}

const SEX_LABEL: Record<"M" | "F" | "OTHER", string> = { M: "Male", F: "Female", OTHER: "Other" };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 border-b border-border py-1.5 last:border-b-0">
      <dt className="w-32 shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

/**
 * RIGHT column — the control room.
 *
 * The paste box hits POST /api/sms, which opens a real case through the same lifecycle the
 * online form uses. What was understood is shown field by field before anyone clicks through,
 * because an operator acting on a decoded message should be able to see exactly what the
 * decoder read out of it — and a bad message shows the decoder's own sentence, unedited.
 */
export function ReceivePanel() {
  const ids = useId();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DecodeResponse | null>(null);

  const decode = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await send<DecodeResponse>("/api/sms", "POST", { text });
      setResult(response);
      refreshAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const decoded = result?.decoded;

  return (
    <Card>
      <CardHeader
        title="Receive — control room"
        subtitle="Paste a message from the field. It becomes a real case, through the normal lifecycle."
      />
      <CardBody className="space-y-4">
        <Field
          label="Message received"
          htmlFor={`${ids}-text`}
          hint="Exactly as it arrived from the handset or the gateway."
        >
          <TextArea
            id={`${ids}-text`}
            className="min-h-[96px] font-mono text-xs"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            placeholder={EXAMPLE}
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void decode()} loading={busy} disabled={text.trim() === ""}>
            Decode
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setText(EXAMPLE);
              setError(null);
              setResult(null);
            }}
          >
            Paste the example
          </Button>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3">
            <p className="text-sm font-semibold text-red-800">The message was not accepted</p>
            <p className="mt-1 text-sm text-red-700">{error}</p>
          </div>
        )}

        {result && decoded && (
          <div className="space-y-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3">
            <p className="text-sm font-semibold text-emerald-900">
              Case {result.case.id} opened from this message.
            </p>
            <dl className="rounded-md border border-border bg-surface px-3 py-1">
              <Row label="Location" value={`${decoded.lat.toFixed(4)}, ${decoded.lng.toFixed(4)}`} />
              <Row label="Severity" value={decoded.severity} />
              <Row label="Triage" value={decoded.triage ? TRIAGE_LABEL[decoded.triage] : "Not tagged in message"} />
              <Row
                label="Needs"
                value={
                  decoded.requirements.length === 0
                    ? "None stated"
                    : decoded.requirements.map((r) => RESOURCE_LABEL[r]).join(", ")
                }
              />
              <Row
                label="Blood"
                value={
                  decoded.bloodGroup
                    ? `${BLOOD_GROUP_LABEL[decoded.bloodGroup]}${decoded.units === undefined ? "" : ` · ${decoded.units} units`}`
                    : "Not stated"
                }
              />
              <Row
                label="Patient"
                value={
                  [decoded.sex ? SEX_LABEL[decoded.sex] : null, decoded.age === undefined ? null : `${decoded.age}y`]
                    .filter((v): v is string => v !== null)
                    .join(", ") || "Not stated"
                }
              />
              <Row label="Note" value={decoded.notes === "" ? "None in message" : decoded.notes} />
            </dl>
            <p className="text-xs text-emerald-900">
              Every field above was typed by a responder and carried in the message. Nothing here was inferred.
            </p>
            <Link
              href={`/paramedic/cases/${result.case.id}`}
              className="inline-flex min-h-[36px] items-center rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              Open {result.case.id}
            </Link>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
