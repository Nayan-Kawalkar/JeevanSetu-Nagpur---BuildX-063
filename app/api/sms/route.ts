/**
 * Twist 2 — the SMS bridge endpoint.
 *
 * POST accepts the text of a single SMS sent from a phone with no data connection and turns it
 * into a real case, through exactly the same `createCase` lifecycle the online form uses. GET
 * gives back the encoded message for an existing case so a crew can read it out over a radio or
 * forward it to another control room.
 *
 * The provenance matters and is written to the timeline: this data did not come from a connected
 * device, it came from a text message, and nobody reviewing the case later should have to guess
 * that. Everything in the message was typed by a human — the codec transports it, the system
 * does not infer it.
 *
 * Coordination and decision support only: nothing here diagnoses, prescribes, or presents a
 * reported figure as a live measurement.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, json, parseBody } from "@/lib/api";
import { CASE_ROLES, auditGuardedMutation, requireRole } from "@/lib/auth";
import { createCase } from "@/lib/services/cases";
import { SMS_MAX_LENGTH, decodeCase, encodeCase, smsLink, type SmsCase } from "@/lib/sms";
import { addEvent, getCase } from "@/lib/store";
import type { EmergencyCase } from "@/lib/types";

/** The store changes minute by minute; a prerendered answer here would be a lie by build time. */
export const dynamic = "force-dynamic";

/**
 * A single segment plus a little slack: a gateway may hand us the message with a header or
 * trailing whitespace, and rejecting that outright would be pedantry at the wrong moment.
 */
const SmsBodySchema = z.object({
  text: z.string().trim().min(1).max(SMS_MAX_LENGTH * 2),
});

/** Notes must survive the case validator's minimum length even when the message carried none. */
const NO_NOTE = "No note in SMS; details to follow by radio.";

/** What the case form would have collected, rebuilt from the seven structured fields. */
function caseInputFromSms(decoded: SmsCase) {
  return {
    incidentType: "OTHER" as const,
    notes: decoded.notes.length >= 3 ? decoded.notes : NO_NOTE,
    severity: decoded.severity,
    bloodGroup: decoded.bloodGroup,
    bloodUnitsNeeded: decoded.units,
    age: decoded.age,
    sex: decoded.sex,
    lat: decoded.lat,
    lng: decoded.lng,
    locationLabel: `SMS report ${decoded.lat.toFixed(4)}, ${decoded.lng.toFixed(4)}`,
    requirements: decoded.requirements,
  };
}

/** The reverse direction: a stored case as the seven fields that fit in one message. */
function smsCaseFromCase(c: EmergencyCase): SmsCase {
  return {
    lat: c.lat,
    lng: c.lng,
    severity: c.severity,
    triage: c.triage,
    requirements: c.requirements,
    bloodGroup: c.bloodGroup,
    units: c.bloodUnitsNeeded,
    age: c.age,
    sex: c.sex,
    notes: c.notes,
  };
}

/**
 * GET /api/sms?caseId=CASE-0001 — the encoded message for an existing case.
 *
 * Returns the text, its length, whether the note had to be clipped, and an `sms:` link, so a
 * screen can show the crew exactly what will be sent before they send it.
 */
export async function GET(request: NextRequest): Promise<Response> {
  return handle(() => {
    const caseId = request.nextUrl.searchParams.get("caseId");
    if (!caseId) throw new ApiError(400, 'Query parameter "caseId" is required.');

    const existing = getCase(caseId);
    const encoded = encodeCase(smsCaseFromCase(existing));
    return json({
      caseId: existing.id,
      ...encoded,
      maxLength: SMS_MAX_LENGTH,
      link: smsLink(encoded.text),
    });
  });
}

/**
 * POST /api/sms — decode one message and open the case it describes.
 *
 * A message that does not decode returns 400 carrying the decoder's own sentence, because the
 * operator who pasted it is the person who can get the crew to resend the broken field.
 */
export async function POST(request: NextRequest): Promise<Response> {
  return handle(async () => {
    const session = await requireRole(...CASE_ROLES);
    const body = await parseBody(request, SmsBodySchema);

    const decoded = decodeCase(body.text);
    if (!decoded.ok) throw new ApiError(400, decoded.error);

    const created = await createCase(caseInputFromSms(decoded.value));

    // A triage tag only ever reaches us because a responder wrote it into the message. The
    // system still assigns nothing on its own, least of all BLACK.
    if (decoded.value.triage) created.triage = decoded.value.triage;

    addEvent({
      caseId: created.id,
      type: "CASE_CREATED",
      actorRole: "SYSTEM",
      message:
        `Arrived over SMS during network blackout (${body.text.length} characters). ` +
        `Structured fields decoded from the message; not reported by a connected device.`,
    });
    auditGuardedMutation(session, {
      type: "CASE_CREATED",
      caseId: created.id,
      action: `opened case ${created.id} from an SMS report`,
    });

    return json({ case: created, decoded: decoded.value }, 201);
  });
}
