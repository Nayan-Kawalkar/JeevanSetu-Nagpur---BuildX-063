/**
 * Contract check for lib/services/extraction.ts and lib/services/ai.ts.
 *
 *   node lib/services/extraction.test.mjs
 *
 * No test framework, no dependency, and it imports nothing from TypeScript —
 * a plain Node script cannot load a .ts module here, so instead of calling the
 * extractor it reads the two source files as text and asserts the rules that
 * must never silently disappear: every keyword term, every baseline mapping,
 * the API contract, and the safety constraints. The behaviour those rules
 * produce is documented below and exercised end to end by the smoke test.
 *
 * ---------------------------------------------------------------------------
 * EXPECTED BEHAVIOUR OF extractByKeyword(input)  (pure, synchronous)
 * ---------------------------------------------------------------------------
 * Keyword families (case-insensitive, leading word boundary, so "fracture"
 * also matches "fractures" but "fits" never matches "benefits"):
 *
 *   head injury | head trauma | unconscious | gcs | skull | concussion |
 *   "sar me chot"                          -> NEUROSURGEON, CT_SCAN, ICU
 *   fracture | femur | broken | deformed |
 *   "haddi"                                -> ORTHOPEDIC_SURGEON, OPERATING_ROOM
 *   bleeding | blood loss | haemorrhage |
 *   hemorrhage | "khoon"                   -> BLOOD_BANK, TRAUMA_TEAM
 *   breathing | breathless | not breathing |
 *   airway | spo2 | "saans"                -> VENTILATOR, ICU
 *   cardiac | chest pain | heart attack |
 *   cardiac arrest                         -> ICU, VENTILATOR
 *   burn | scald                           -> ICU, OPERATING_ROOM
 *   pregnan | labour | labor | delivery    -> OPERATING_ROOM, EMERGENCY_BED
 *   seizure | fits | stroke | paralysis    -> ICU, CT_SCAN, NEUROSURGEON
 *
 * Incident-type baseline, added before any keyword fires:
 *   ROAD_ACCIDENT -> TRAUMA_TEAM, EMERGENCY_BED     CARDIAC -> ICU
 *   FALL          -> ORTHOPEDIC_SURGEON, EMERGENCY_BED   BURN -> ICU
 *   ASSAULT       -> TRAUMA_TEAM, EMERGENCY_BED     OTHER   -> EMERGENCY_BED
 *
 * Unconditional floors:
 *   - EMERGENCY_BED is always required.
 *   - severity CRITICAL always adds ICU and TRAUMA_TEAM.
 *   - a supplied bloodGroup, or any bleeding word, always adds BLOOD_BANK.
 *   - requirements are de-duplicated and returned in RESOURCE_TYPES order.
 *
 * Priority — raised only, never lowered below what the paramedic chose:
 *   - CRITICAL when "unconscious", "cardiac arrest" or "not breathing" appear.
 *   - HIGH when bleeding or head-injury wording appears and the paramedic
 *     chose MEDIUM or LOW.
 *
 * Confidence: HIGH at 3+ distinct families, MEDIUM at 1-2, LOW at none.
 * With no family hit the requirements are only the baseline plus the floors,
 * and missingInformation says the notes were too brief.
 *
 * missingInformation always names a missing blood group when BLOOD_BANK is
 * required but none was supplied, and missing vitals when the notes contain
 * no digits.
 *
 * Example — notes "head injury, heavy bleeding, GCS 8", ROAD_ACCIDENT, MEDIUM:
 *   priority HIGH, confidence MEDIUM, source "KEYWORD", requirements
 *   [ICU, EMERGENCY_BED, NEUROSURGEON, TRAUMA_TEAM, CT_SCAN, BLOOD_BANK],
 *   missingInformation ["blood group not confirmed"].
 *
 * ---------------------------------------------------------------------------
 * EXPECTED BEHAVIOUR OF extractRequirements(input)  (async)
 * ---------------------------------------------------------------------------
 *   - No ANTHROPIC_API_KEY -> getAiProvider() is null -> returns the keyword
 *     result unchanged, with no network call.
 *   - Otherwise the model's raw JSON is validated with Zod and treated as
 *     untrusted. Any throw, timeout, HTTP error, non-JSON body or schema
 *     failure logs one non-sensitive line and returns the keyword result.
 *   - A valid answer is UNIONED onto the keyword floor: requirements merge,
 *     priority may only rise, a paramedic-supplied blood group always wins,
 *     confidence takes the more cautious of the two, and a summary containing
 *     clinical or prescriptive language is discarded. The model can therefore
 *     only ever add to the safety floor, never remove from it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const extraction = readFileSync(join(here, "extraction.ts"), "utf8");
const ai = readFileSync(join(here, "ai.ts"), "utf8");

let checks = 0;
function check(label, fn) {
  fn();
  checks += 1;
  console.log(`ok  ${label}`);
}

check("extraction.ts exports its documented surface", () => {
  for (const name of [
    "export interface ExtractionInput",
    "export interface ExtractionResult",
    "export function extractByKeyword",
    "export async function extractRequirements",
  ]) {
    assert.ok(extraction.includes(name), `missing: ${name}`);
  }
});

check("every keyword term is still present", () => {
  const terms = [
    "head injury", "head trauma", "unconscious", "gcs", "skull", "concussion", "sar me chot",
    "fracture", "femur", "broken", "deformed", "haddi",
    "bleeding", "blood loss", "haemorrhage", "hemorrhage", "khoon",
    "breathing", "breathless", "not breathing", "airway", "spo2", "saans",
    "cardiac", "chest pain", "heart attack", "cardiac arrest",
    "burn", "scald",
    "pregnan", "labour", "labor", "delivery",
    "seizure", "fits", "stroke", "paralysis",
  ];
  for (const term of terms) {
    assert.ok(extraction.includes(`"${term}"`), `keyword dropped: ${term}`);
  }
});

check("every incident-type baseline is still mapped", () => {
  for (const [type, resources] of [
    ["ROAD_ACCIDENT", ['"TRAUMA_TEAM"', '"EMERGENCY_BED"']],
    ["CARDIAC", ['"ICU"']],
    ["BURN", ['"ICU"']],
    ["FALL", ['"ORTHOPEDIC_SURGEON"', '"EMERGENCY_BED"']],
    ["ASSAULT", ['"TRAUMA_TEAM"', '"EMERGENCY_BED"']],
    ["OTHER", ['"EMERGENCY_BED"']],
  ]) {
    const line = extraction.split("\n").find((l) => l.trimStart().startsWith(`${type}:`));
    assert.ok(line, `baseline missing for ${type}`);
    for (const resource of resources) {
      assert.ok(line.includes(resource), `${type} baseline lost ${resource}`);
    }
  }
});

check("the unconditional safety floors are still enforced", () => {
  assert.ok(extraction.includes('required.add("EMERGENCY_BED")'), "EMERGENCY_BED floor removed");
  assert.ok(/severity === "CRITICAL"[\s\S]{0,120}required\.add\("ICU"\)/.test(extraction), "CRITICAL no longer adds ICU");
  assert.ok(/severity === "CRITICAL"[\s\S]{0,160}required\.add\("TRAUMA_TEAM"\)/.test(extraction), "CRITICAL no longer adds TRAUMA_TEAM");
  assert.ok(extraction.includes('required.add("BLOOD_BANK")'), "BLOOD_BANK rule removed");
  assert.ok(extraction.includes("RESOURCE_TYPES.filter"), "requirements are no longer returned in RESOURCE_TYPES order");
});

check("priority can only ever be raised", () => {
  assert.ok(extraction.includes("function raiseSeverity"), "raiseSeverity helper removed");
  assert.ok(/CRITICAL_TRIGGER\s*=\s*\/[^\n]*unconscious/.test(extraction), "CRITICAL trigger no longer covers 'unconscious'");
  assert.ok(/CRITICAL_TRIGGER\s*=\s*\/[^\n]*cardiac arrest/.test(extraction), "CRITICAL trigger no longer covers 'cardiac arrest'");
  assert.ok(/CRITICAL_TRIGGER\s*=\s*\/[^\n]*not breathing/.test(extraction), "CRITICAL trigger no longer covers 'not breathing'");
  assert.ok(!/lowerSeverity|downgrade\s*\(/.test(extraction), "a downgrade path appeared");
});

check("confidence thresholds are unchanged", () => {
  assert.ok(/families\.length >= 3 \? "HIGH"/.test(extraction), "HIGH threshold changed");
  assert.ok(/families\.length >= 1 \? "MEDIUM" : "LOW"/.test(extraction), "MEDIUM/LOW threshold changed");
});

check("missingInformation still names blood group and vitals gaps", () => {
  assert.ok(extraction.includes('"blood group not confirmed"'), "blood group gap removed");
  assert.ok(extraction.includes('"no vital signs recorded"'), "vitals gap removed");
  assert.ok(/!\/\\d\/\.test\(input\.notes\)/.test(extraction), "the 'no digits means no vitals' rule changed");
});

check("AI output is validated and can only add to the keyword floor", () => {
  assert.ok(extraction.includes("AiExtractionSchema"), "Zod schema for AI output removed");
  assert.ok(extraction.includes("safeParse"), "AI output is no longer validated");
  assert.ok(/const keyword = extractByKeyword\(input\)/.test(extraction), "keyword floor is no longer computed first");
  assert.ok(extraction.includes("return keyword"), "the fallback to keyword rules is gone");
  assert.ok(/new Set<ResourceType>\(keyword\.requirements\)/.test(extraction), "the merge no longer starts from the keyword floor");
  assert.ok(extraction.includes("raiseSeverity(keyword.priority, ai.priority)"), "AI priority is no longer clamped upward only");
  assert.ok(extraction.includes("keyword.bloodGroup ?? ai.bloodGroup"), "the model can now override the paramedic's blood group");
  assert.ok(extraction.includes("CLINICAL_LANGUAGE"), "the no-diagnosis guard on the AI summary was removed");
});

check("ai.ts keeps the documented Anthropic request contract", () => {
  assert.ok(ai.includes("https://api.anthropic.com/v1/messages"), "endpoint changed");
  assert.ok(ai.includes('"x-api-key"'), "x-api-key header missing");
  assert.ok(ai.includes('"anthropic-version"') && ai.includes('"2023-06-01"'), "anthropic-version header missing");
  assert.ok(ai.includes('"content-type": "application/json"'), "content-type header missing");
  assert.ok(ai.includes('"claude-sonnet-5"'), "model changed");
  assert.ok(/MAX_TOKENS\s*=\s*700/.test(ai), "max_tokens is no longer 700");
  assert.ok(/TIMEOUT_MS\s*=\s*6_?000/.test(ai), "the 6-second timeout changed");
  assert.ok(ai.includes("AbortSignal.timeout(TIMEOUT_MS)"), "the abort timeout is not wired to the request");
  assert.ok(ai.includes("export interface AiProvider") && ai.includes("export function getAiProvider"), "adapter surface changed");
  assert.ok(ai.includes("getEnv()"), "the key no longer comes from lib/env");
  assert.ok(ai.includes("return null"), "getAiProvider can no longer report 'no provider configured'");
});

check("the system prompt still forbids diagnosis and demands strict JSON", () => {
  assert.ok(/Never diagnose/i.test(ai), "the no-diagnosis instruction was removed");
  assert.ok(/Never suggest treatment/i.test(ai), "the no-treatment instruction was removed");
  assert.ok(/ONE JSON object and nothing else/i.test(ai), "the strict-JSON instruction was removed");
  assert.ok(/untrusted/i.test(ai), "the paramedic note is no longer marked as untrusted data");
});

check("the API key is never logged", () => {
  const logged = ai.split("\n").filter((line) => /console\.(log|warn|error|info|debug)/.test(line));
  for (const line of logged) {
    assert.ok(!/apiKey|API_KEY|x-api-key/.test(line), `a log line references the key: ${line.trim()}`);
  }
  assert.ok(!/console\.(log|warn|error|info|debug)[\s\S]*response\.text\(\)/.test(ai), "a raw response body is logged");
});

check("both files stay within the project's TypeScript rules", () => {
  for (const [name, source] of [["extraction.ts", extraction], ["ai.ts", ai]]) {
    assert.ok(!/:\s*any\b|<any>|\bas any\b/.test(source), `${name} uses "any"`);
    assert.ok(!/[\w)\]]!(?![=])/.test(source), `${name} uses a non-null "!" assertion`);
    assert.ok(!/from "\.\.?\//.test(source), `${name} uses a relative import instead of the @/ alias`);
    assert.ok(/from "@\/lib\//.test(source), `${name} no longer imports through the @/ alias`);
  }
});

console.log(`\n${checks} contract checks passed`);
