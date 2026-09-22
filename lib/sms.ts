/**
 * Twist 2 — the SMS bridge for a network blackout.
 *
 * When the city's data network fails there is usually still GSM. This module is the codec that
 * lets a whole case travel as one 160-character text: a paramedic's phone with no data can send
 * it, and the control room can paste it back in and get a real case out the other end.
 *
 * Three properties drive the format.
 *  1. ONE message. Concatenated SMS needs a working store-and-forward path for every part; a
 *     single segment is the only length we can actually promise under a degraded network.
 *  2. Readable by a human. If even the SMS fails, the string above is short enough to read out
 *     over a VHF radio and write down at the other end, which is the real fallback.
 *  3. Structured fields survive truncation. The free-text note is LAST and is the only field
 *     ever clipped, so a message that hits the limit still carries location, severity, triage,
 *     requirements and blood group intact.
 *
 * This file is pure and isomorphic: no store, no fetch, no clock. It can run in a service
 * worker, on the server, or in a page that is offline.
 *
 * Coordination and decision support only. The codec transports what a human entered; it does
 * not infer a diagnosis, and it never invents a triage tag that was not in the message.
 */
import { z } from "zod";
import {
  BLOOD_GROUPS,
  CASE_SEVERITIES,
  RESOURCE_TYPES,
  TRIAGE_TAGS,
  type BloodGroup,
  type CaseSeverity,
  type ResourceType,
  type TriageTag,
} from "@/lib/types";

/** One GSM segment. Anything longer is two messages, and two messages is a promise we cannot keep. */
export const SMS_MAX_LENGTH = 160;

/** Wire version. A future format bumps this so an old reader refuses rather than misreads. */
const VERSION = "JS1";

/** Field separator. Stripped out of the free-text note on encode so a note can never split a field. */
const SEP = "|";

/** Nagpur district bounding box, the same one the case API enforces. */
const LAT_MIN = 20.5;
const LAT_MAX = 21.8;
const LNG_MIN = 78.4;
const LNG_MAX = 79.8;

/** A case as it travels over SMS: everything matching needs, and nothing it does not. */
export interface SmsCase {
  lat: number;
  lng: number;
  severity: CaseSeverity;
  triage?: TriageTag;
  requirements: ResourceType[];
  bloodGroup?: BloodGroup;
  units?: number;
  age?: number;
  sex?: "M" | "F" | "OTHER";
  notes: string;
}

// ---------- Short stable codes ----------

const SEVERITY_CODE: Record<CaseSeverity, string> = {
  CRITICAL: "CRIT",
  HIGH: "HIGH",
  MEDIUM: "MED",
  LOW: "LOW",
};

const RESOURCE_CODE: Record<ResourceType, string> = {
  ICU: "ICU",
  EMERGENCY_BED: "EBED",
  NEUROSURGEON: "NEU",
  ORTHOPEDIC_SURGEON: "ORT",
  TRAUMA_TEAM: "TRA",
  CT_SCAN: "CT",
  VENTILATOR: "VENT",
  BLOOD_BANK: "BLD",
  OPERATING_ROOM: "OR",
};

const BLOOD_CODE: Record<BloodGroup, string> = {
  A_POS: "APOS",
  A_NEG: "ANEG",
  B_POS: "BPOS",
  B_NEG: "BNEG",
  AB_POS: "ABPOS",
  AB_NEG: "ABNEG",
  O_POS: "OPOS",
  O_NEG: "ONEG",
};

const SEX_CODE: Record<"M" | "F" | "OTHER", string> = { M: "M", F: "F", OTHER: "X" };

/** Inverts a code table into a lookup the decoder can consult without trusting the input. */
function invert<K extends string>(table: Record<K, string>): ReadonlyMap<string, K> {
  const out = new Map<string, K>();
  for (const key of Object.keys(table) as K[]) out.set(table[key], key);
  return out;
}

const SEVERITY_FROM_CODE = invert<CaseSeverity>(SEVERITY_CODE);
const RESOURCE_FROM_CODE = invert<ResourceType>(RESOURCE_CODE);
const BLOOD_FROM_CODE = invert<BloodGroup>(BLOOD_CODE);
const SEX_FROM_CODE = invert<"M" | "F" | "OTHER">(SEX_CODE);

/** The eight pipe-delimited fields, in order. Positions are fixed; an absent field is empty. */
const FIELD_COUNT = 8;

// ---------- Encode ----------

/** 4 decimals is about 11 m on the ground, which is closer than a street address gets us. */
function coord(value: number): string {
  return value.toFixed(4);
}

/** "M27", "F", "27" or "" — whatever the crew actually recorded, never a guess. */
function demographics(c: SmsCase): string {
  const sex = c.sex ? SEX_CODE[c.sex] : "";
  const age = c.age === undefined ? "" : String(Math.trunc(c.age));
  return `${sex}${age}`;
}

/** "ONEG:2", "ONEG" when units were not stated, or "" when no group is known. */
function blood(c: SmsCase): string {
  if (!c.bloodGroup) return "";
  const code = BLOOD_CODE[c.bloodGroup];
  return c.units === undefined ? code : `${code}:${Math.trunc(c.units)}`;
}

/**
 * Packs a case into one SMS.
 *
 * Everything but the note is written first and measured; the note then gets whatever room is
 * left. `truncated` is true when any of the note had to be dropped, so the sender can see — on
 * screen, before pressing send — that the receiving end will not get the full wording.
 */
export function encodeCase(c: SmsCase): { text: string; length: number; truncated: boolean } {
  const fields = [
    VERSION,
    `${coord(c.lat)},${coord(c.lng)}`,
    SEVERITY_CODE[c.severity],
    c.triage ?? "",
    c.requirements.map((r) => RESOURCE_CODE[r]).join(","),
    blood(c),
    demographics(c),
  ];
  const prefix = `${fields.join(SEP)}${SEP}`;

  // Newlines and pipes would break the field grammar; collapse whitespace so the note also reads
  // cleanly when it is spoken over a radio.
  const note = c.notes.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
  const room = SMS_MAX_LENGTH - prefix.length;
  const kept = room <= 0 ? "" : note.slice(0, room);
  const text = `${prefix}${kept}`;
  return { text, length: text.length, truncated: kept.length < note.length };
}

// ---------- Decode ----------

/**
 * Field-level schema. This is untrusted input arriving from outside every boundary the app has —
 * an SMS gateway will happily deliver whatever anyone typed — so every value is checked against
 * the real enums rather than cast into them.
 */
const DecodedSchema = z.object({
  lat: z.number().min(LAT_MIN).max(LAT_MAX),
  lng: z.number().min(LNG_MIN).max(LNG_MAX),
  severity: z.enum(CASE_SEVERITIES),
  triage: z.enum(TRIAGE_TAGS).optional(),
  requirements: z.array(z.enum(RESOURCE_TYPES)).max(RESOURCE_TYPES.length),
  bloodGroup: z.enum(BLOOD_GROUPS).optional(),
  units: z.number().int().min(0).max(20).optional(),
  age: z.number().int().min(0).max(120).optional(),
  sex: z.enum(["M", "F", "OTHER"]).optional(),
  notes: z.string().max(SMS_MAX_LENGTH),
});

type DecodeResult = { ok: true; value: SmsCase } | { ok: false; error: string };

function fail(error: string): DecodeResult {
  return { ok: false, error };
}

function parseCoords(field: string): { lat: number; lng: number } | string {
  const parts = field.split(",");
  if (parts.length !== 2) return `Location must be "lat,lng", not "${field}".`;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return `Location "${field}" is not a pair of numbers.`;
  return { lat, lng };
}

function parseRequirements(field: string): ResourceType[] | string {
  if (field === "") return [];
  const out: ResourceType[] = [];
  for (const raw of field.split(",")) {
    const code = raw.trim().toUpperCase();
    const resource = RESOURCE_FROM_CODE.get(code);
    if (!resource) {
      return `Unknown requirement code "${raw}". Expected some of: ${[...RESOURCE_FROM_CODE.keys()].join(", ")}.`;
    }
    if (!out.includes(resource)) out.push(resource);
  }
  return out;
}

function parseBlood(field: string): { bloodGroup?: BloodGroup; units?: number } | string {
  if (field === "") return {};
  const [groupPart, unitPart] = field.split(":");
  const bloodGroup = BLOOD_FROM_CODE.get(groupPart.trim().toUpperCase());
  if (!bloodGroup) {
    return `Unknown blood group code "${groupPart}". Expected one of: ${[...BLOOD_FROM_CODE.keys()].join(", ")}.`;
  }
  if (unitPart === undefined) return { bloodGroup };
  const units = Number(unitPart);
  if (!Number.isInteger(units)) return `Blood units "${unitPart}" is not a whole number.`;
  return { bloodGroup, units };
}

function parseDemographics(field: string): { age?: number; sex?: "M" | "F" | "OTHER" } | string {
  if (field === "") return {};
  const match = /^([MFX]?)(\d{0,3})$/.exec(field.trim().toUpperCase());
  if (!match) return `Patient field "${field}" must look like "M27", "F", "27" or be empty.`;
  const sex = match[1] === "" ? undefined : SEX_FROM_CODE.get(match[1]);
  const age = match[2] === "" ? undefined : Number(match[2]);
  if (sex === undefined && age === undefined) return `Patient field "${field}" carries no sex or age.`;
  return { age, sex };
}

/**
 * Reads an SMS back into a case.
 *
 * Returns a result rather than throwing, because the caller is usually a control-room operator
 * pasting a garbled message: they need a sentence telling them which field is wrong so they can
 * ask the crew to resend that one part, not a stack trace.
 */
export function decodeCase(text: string): DecodeResult {
  const trimmed = text.trim();
  if (trimmed === "") return fail("The message is empty.");

  // Only the first FIELD_COUNT-1 separators are structural; the rest belong to the note, which
  // is the last field and may legitimately contain anything the encoder let through.
  const parts = trimmed.split(SEP);
  if (parts.length < FIELD_COUNT) {
    return fail(`Expected ${FIELD_COUNT} fields separated by "|", found ${parts.length}.`);
  }
  const [version, location, severityCode, triageCode, requirementField, bloodField, patientField] = parts;
  const notes = parts.slice(FIELD_COUNT - 1).join(SEP);

  if (version.toUpperCase() !== VERSION) {
    return fail(`Unknown message version "${version}". This control room reads ${VERSION} messages.`);
  }

  const coords = parseCoords(location);
  if (typeof coords === "string") return fail(coords);

  const severity = SEVERITY_FROM_CODE.get(severityCode.trim().toUpperCase());
  if (!severity) {
    return fail(`Unknown severity code "${severityCode}". Expected one of: ${[...SEVERITY_FROM_CODE.keys()].join(", ")}.`);
  }

  const triageRaw = triageCode.trim().toUpperCase();
  const triage = triageRaw === "" ? undefined : TRIAGE_TAGS.find((tag) => tag === triageRaw);
  if (triageRaw !== "" && triage === undefined) {
    return fail(`Unknown triage tag "${triageCode}". Expected one of: ${TRIAGE_TAGS.join(", ")}.`);
  }

  const requirements = parseRequirements(requirementField);
  if (typeof requirements === "string") return fail(requirements);

  const bloodParsed = parseBlood(bloodField);
  if (typeof bloodParsed === "string") return fail(bloodParsed);

  const demographicsParsed = parseDemographics(patientField);
  if (typeof demographicsParsed === "string") return fail(demographicsParsed);

  const parsed = DecodedSchema.safeParse({
    lat: coords.lat,
    lng: coords.lng,
    severity,
    triage,
    requirements,
    bloodGroup: bloodParsed.bloodGroup,
    units: bloodParsed.units,
    age: demographicsParsed.age,
    sex: demographicsParsed.sex,
    notes: notes.trim(),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.join(".") || "message";
    // The bounding box is the check most likely to fire on a real mistyped message, so it gets
    // a sentence an operator can act on rather than Zod's own wording.
    if (field === "lat" || field === "lng") {
      return fail(
        `Coordinates ${coords.lat},${coords.lng} are outside the Nagpur area ` +
          `(lat ${LAT_MIN}-${LAT_MAX}, lng ${LNG_MIN}-${LNG_MAX}).`,
      );
    }
    return fail(`Field "${field}" is invalid: ${issue.message}.`);
  }

  return { ok: true, value: parsed.data };
}

/**
 * An `sms:` URI, so a paramedic taps one link and their phone's messaging app opens with the
 * encoded case already in the body. No data connection is involved at any point.
 */
export function smsLink(text: string, to?: string): string {
  const recipient = to ? to.replace(/[^\d+]/g, "") : "";
  return `sms:${recipient}?body=${encodeURIComponent(text)}`;
}
