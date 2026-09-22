/**
 * Requirement extraction: turns a paramedic's free text into the structured
 * coordination requirements the matching service ranks hospitals against.
 *
 * Two layers, deliberately:
 *  1. `extractByKeyword` — pure, synchronous, deterministic. It is the safety
 *     floor and it always runs, so the control room is never left with nothing
 *     when the network, the API key or the model is unavailable.
 *  2. `extractRequirements` — optionally asks Claude for a richer reading and
 *     UNIONS the answer onto the keyword floor, so the model can only ever ADD
 *     to what the deterministic rules already demanded.
 *
 * This is coordination support, not clinical software. Nothing here diagnoses,
 * prescribes, or invents a vital sign; every field is a restatement of what the
 * paramedic typed, and a human confirms it before a hospital is contacted.
 */
import { z } from "zod";
import { getAiProvider } from "@/lib/services/ai";
import {
  BLOOD_GROUPS,
  CASE_SEVERITIES,
  CONFIDENCE_LEVELS,
  INCIDENT_LABEL,
  RESOURCE_TYPES,
  type BloodGroup,
  type CaseSeverity,
  type ConfidenceLevel,
  type IncidentType,
  type ResourceType,
} from "@/lib/types";

// ---------- Public shape ----------

export interface ExtractionInput {
  notes: string;
  incidentType: IncidentType;
  severity: CaseSeverity;
  bloodGroup?: BloodGroup;
  age?: number;
}

export interface ExtractionResult {
  /** May raise, never lower, the severity the paramedic chose. */
  priority: CaseSeverity;
  /** De-duplicated, in RESOURCE_TYPES order. */
  requirements: ResourceType[];
  bloodGroup?: BloodGroup;
  /** One neutral sentence restating the note. Never a diagnosis. */
  incidentSummary: string;
  /** Human-readable gaps a dispatcher should chase, e.g. "blood group not confirmed". */
  missingInformation: string[];
  confidence: ConfidenceLevel;
  source: "KEYWORD" | "AI";
}

// ---------- Keyword rules ----------

interface KeywordFamily {
  /** Stable id so escalation rules can name a family without matching strings twice. */
  readonly id: string;
  /** Neutral phrase used in the incident summary — the paramedic's wording, not a finding. */
  readonly label: string;
  readonly terms: readonly string[];
  readonly resources: readonly ResourceType[];
}

/**
 * English plus common Hindi/Marathi transliterations, because paramedics in
 * Nagpur type in whichever comes fastest under pressure.
 */
const KEYWORD_FAMILIES: readonly KeywordFamily[] = [
  {
    id: "HEAD_INJURY",
    label: "head injury",
    terms: [
      "head injury",
      "head injuries",
      "head trauma",
      "unconscious",
      "gcs",
      "skull",
      "concussion",
      "sar me chot",
      "sar mein chot",
      "sar par chot",
    ],
    resources: ["NEUROSURGEON", "CT_SCAN", "ICU"],
  },
  {
    id: "FRACTURE",
    label: "a fracture",
    terms: ["fracture", "femur", "broken", "deformed", "haddi"],
    resources: ["ORTHOPEDIC_SURGEON", "OPERATING_ROOM"],
  },
  {
    id: "BLEEDING",
    label: "bleeding",
    terms: ["bleeding", "blood loss", "haemorrhage", "hemorrhage", "khoon"],
    resources: ["BLOOD_BANK", "TRAUMA_TEAM"],
  },
  {
    id: "BREATHING",
    label: "breathing difficulty",
    terms: ["breathing", "breathless", "not breathing", "airway", "spo2", "saans"],
    resources: ["VENTILATOR", "ICU"],
  },
  {
    id: "CARDIAC",
    label: "a cardiac or chest complaint",
    terms: ["cardiac", "chest pain", "heart attack", "cardiac arrest"],
    resources: ["ICU", "VENTILATOR"],
  },
  {
    id: "BURN",
    label: "burns",
    terms: ["burn", "scald"],
    resources: ["ICU", "OPERATING_ROOM"],
  },
  {
    id: "OBSTETRIC",
    label: "pregnancy or labour",
    terms: ["pregnan", "labour", "labor", "delivery"],
    resources: ["OPERATING_ROOM", "EMERGENCY_BED"],
  },
  {
    id: "NEURO",
    label: "seizure or stroke wording",
    terms: ["seizure", "fits", "stroke", "paralysis"],
    resources: ["ICU", "CT_SCAN", "NEUROSURGEON"],
  },
];

interface CompiledFamily extends KeywordFamily {
  readonly pattern: RegExp;
}

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds one case-insensitive alternation per family. Each term is anchored with
 * a leading word boundary only, so "fracture" also catches "fractures" while
 * "fits" still cannot fire on "benefits".
 */
function compileFamily(family: KeywordFamily): CompiledFamily {
  const pattern = new RegExp(family.terms.map((t) => `\\b${escapeRegExp(t)}`).join("|"), "i");
  return { ...family, pattern };
}

const COMPILED_FAMILIES: readonly CompiledFamily[] = KEYWORD_FAMILIES.map(compileFamily);

/** Words that mean "this patient may not survive the drive" — they force CRITICAL. */
const CRITICAL_TRIGGER = /\bunconscious|\bcardiac arrest|\bnot breathing|\bno breathing|\bbehosh|\bsaans nahi/i;

/** Baseline requirements implied by the incident type alone, before any keyword fires. */
const INCIDENT_BASELINE: Record<IncidentType, readonly ResourceType[]> = {
  ROAD_ACCIDENT: ["TRAUMA_TEAM", "EMERGENCY_BED"],
  CARDIAC: ["ICU"],
  BURN: ["ICU"],
  FALL: ["ORTHOPEDIC_SURGEON", "EMERGENCY_BED"],
  ASSAULT: ["TRAUMA_TEAM", "EMERGENCY_BED"],
  OTHER: ["EMERGENCY_BED"],
};

const SEVERITY_RANK: Record<CaseSeverity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

const BLOOD_GROUP_UNKNOWN = "blood group not confirmed";
const VITALS_UNKNOWN = "no vital signs recorded";
const AGE_UNKNOWN = "patient age not recorded";
const NOTES_TOO_BRIEF = "paramedic notes were too brief for keyword extraction";

/**
 * Returns whichever severity is higher. Used everywhere a rule wants to escalate,
 * so no code path can ever quietly downgrade what the paramedic on scene chose.
 */
function raiseSeverity(current: CaseSeverity, candidate: CaseSeverity): CaseSeverity {
  return SEVERITY_RANK[candidate] > SEVERITY_RANK[current] ? candidate : current;
}

/**
 * Returns the more cautious of two confidence levels, because a dispatcher
 * should be told the weakest evidence behind a recommendation, not the strongest.
 */
function lowerConfidence(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
  return CONFIDENCE_RANK[b] < CONFIDENCE_RANK[a] ? b : a;
}

/**
 * De-duplicates requirements and returns them in RESOURCE_TYPES order, so the
 * same case always renders the same chip order on every screen.
 */
function orderRequirements(values: Iterable<ResourceType>): ResourceType[] {
  const set = new Set(values);
  return RESOURCE_TYPES.filter((type) => set.has(type));
}

/** Collapses whitespace and hard-caps a string so one bad note cannot break a layout. */
function clamp(text: string, max: number): string {
  const tidy = text.replace(/\s+/g, " ").trim();
  return tidy.length <= max ? tidy : `${tidy.slice(0, max - 1).trimEnd()}…`;
}

/** Joins phrases as "a, b and c" so the summary reads as a sentence, not a list. */
function joinPhrases(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Builds the one neutral sentence shown to the control room. It only restates
 * the dispatch metadata and which keyword families the note tripped — it never
 * names a condition, so the prototype cannot be read as diagnosing anybody.
 */
function buildSummary(input: ExtractionInput, families: readonly CompiledFamily[]): string {
  const age = typeof input.age === "number" ? `, patient aged ${input.age}` : "";
  const signal =
    families.length > 0
      ? `the notes mention ${joinPhrases(families.map((f) => f.label))}`
      : "the notes contain no recognised keywords";
  return clamp(
    `Incident logged as ${INCIDENT_LABEL[input.incidentType]}${age}, severity ${input.severity}; ${signal} — wording is the paramedic's own and is not a clinical assessment.`,
    300,
  );
}

/**
 * Lists the gaps a dispatcher should close before handover. These drive the
 * "confirm this" prompts in the UI, which is how the prototype stays honest
 * about what it does not know instead of filling the blanks itself.
 */
function buildMissingInformation(
  input: ExtractionInput,
  requirements: readonly ResourceType[],
  families: readonly CompiledFamily[],
): string[] {
  const missing: string[] = [];
  if (requirements.includes("BLOOD_BANK") && !input.bloodGroup) missing.push(BLOOD_GROUP_UNKNOWN);
  if (!/\d/.test(input.notes)) missing.push(VITALS_UNKNOWN);
  if (typeof input.age !== "number") missing.push(AGE_UNKNOWN);
  if (families.length === 0) missing.push(NOTES_TOO_BRIEF);
  return missing;
}

/**
 * Deterministic extraction. Pure and synchronous so it can run on every request,
 * be reasoned about in a demo, and act as the floor the AI layer may only add to.
 */
export function extractByKeyword(input: ExtractionInput): ExtractionResult {
  const notes = input.notes ?? "";
  const families = COMPILED_FAMILIES.filter((family) => family.pattern.test(notes));
  const hit = (id: string): boolean => families.some((family) => family.id === id);

  // Requirements: incident baseline + keyword families + unconditional safety floors.
  const required = new Set<ResourceType>(INCIDENT_BASELINE[input.incidentType]);
  required.add("EMERGENCY_BED");
  for (const family of families) {
    for (const resource of family.resources) required.add(resource);
  }
  if (input.severity === "CRITICAL") {
    required.add("ICU");
    required.add("TRAUMA_TEAM");
  }
  if (input.bloodGroup || hit("BLEEDING")) required.add("BLOOD_BANK");
  const requirements = orderRequirements(required);

  // Priority: escalate only. The paramedic is on scene; we are not.
  let priority = input.severity;
  if (CRITICAL_TRIGGER.test(notes)) priority = raiseSeverity(priority, "CRITICAL");
  if (hit("BLEEDING") || hit("HEAD_INJURY")) priority = raiseSeverity(priority, "HIGH");

  const confidence: ConfidenceLevel = families.length >= 3 ? "HIGH" : families.length >= 1 ? "MEDIUM" : "LOW";

  return {
    priority,
    requirements,
    bloodGroup: input.bloodGroup,
    incidentSummary: buildSummary(input, families),
    missingInformation: buildMissingInformation(input, requirements, families),
    confidence,
    source: "KEYWORD",
  };
}

// ---------- AI layer ----------

/**
 * Contract the model must satisfy. AI output is UNTRUSTED input: anything that
 * fails this schema is discarded wholesale rather than partially trusted.
 */
const AiExtractionSchema = z.object({
  priority: z.enum(CASE_SEVERITIES),
  requirements: z.array(z.enum(RESOURCE_TYPES)).max(RESOURCE_TYPES.length * 2),
  bloodGroup: z.enum(BLOOD_GROUPS).nullish(),
  incidentSummary: z.string().max(300),
  missingInformation: z.array(z.string().min(1).max(160)).max(12).default([]),
  confidence: z.enum(CONFIDENCE_LEVELS),
});

type AiExtraction = z.infer<typeof AiExtractionSchema>;

/**
 * Phrases that would turn a coordination note into clinical advice. A model told
 * not to diagnose can still slip, so the summary is checked before a human reads it.
 */
const CLINICAL_LANGUAGE = /\b(diagnos|prescrib|administer|dosage|\d+\s?mg\b|treat with|suffering from|likely has|confirmed case)/i;

/**
 * Accepts the model's sentence only if it is short and free of clinical phrasing;
 * otherwise the caller falls back to the deterministic summary. Keeps rule 6
 * ("never diagnose") enforced in code, not only in the prompt.
 */
function safeSummary(text: string): string | null {
  const cleaned = clamp(text, 300);
  if (cleaned.length < 10) return null;
  if (CLINICAL_LANGUAGE.test(cleaned)) return null;
  return cleaned;
}

/**
 * Unions an AI reading onto the keyword floor. Requirements are merged, priority
 * may only rise, the paramedic's blood group always wins, and confidence takes the
 * more cautious of the two — so a wrong model answer can add work, never remove it.
 */
function mergeWithKeyword(keyword: ExtractionResult, ai: AiExtraction): ExtractionResult {
  const bloodGroup = keyword.bloodGroup ?? ai.bloodGroup ?? undefined;

  const required = new Set<ResourceType>(keyword.requirements);
  for (const resource of ai.requirements) required.add(resource);
  if (bloodGroup) required.add("BLOOD_BANK");
  const requirements = orderRequirements(required);

  const missingInformation = Array.from(
    new Set([...keyword.missingInformation, ...ai.missingInformation.map((m) => m.trim()).filter((m) => m.length > 0)]),
  );
  if (requirements.includes("BLOOD_BANK") && !bloodGroup && !missingInformation.includes(BLOOD_GROUP_UNKNOWN)) {
    missingInformation.push(BLOOD_GROUP_UNKNOWN);
  }

  return {
    priority: raiseSeverity(keyword.priority, ai.priority),
    requirements,
    bloodGroup,
    incidentSummary: safeSummary(ai.incidentSummary) ?? keyword.incidentSummary,
    missingInformation,
    confidence: lowerConfidence(keyword.confidence, ai.confidence),
    source: "AI",
  };
}

/** One short, credential-free line for the server log. Never includes the API key. */
function describeFailure(error: unknown): string {
  if (error instanceof Error) return clamp(`${error.name}: ${error.message}`, 140);
  return "unknown error";
}

/**
 * Extraction entry point. Returns the keyword result immediately when no AI
 * provider is configured, and falls back to it on any throw, timeout or invalid
 * model output — an ambulance must never wait on a third-party API.
 */
export async function extractRequirements(input: ExtractionInput): Promise<ExtractionResult> {
  const keyword = extractByKeyword(input);
  const provider = getAiProvider();
  if (!provider) return keyword;

  try {
    const raw = await provider.extract(input);
    const parsed = AiExtractionSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(`[extraction] ${provider.name} returned an unusable shape; using keyword rules.`);
      return keyword;
    }
    return mergeWithKeyword(keyword, parsed.data);
  } catch (error) {
    console.warn(`[extraction] ${provider.name} unavailable (${describeFailure(error)}); using keyword rules.`);
    return keyword;
  }
}
