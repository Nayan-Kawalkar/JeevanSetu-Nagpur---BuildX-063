/**
 * Hospital matching — the decision-support core of JeevanSetu 360.
 *
 * Given where the ambulance is, what the patient needs and the *last reported* state of every
 * hospital and blood bank, this ranks the hospitals and says, in plain words, why. It is a
 * coordination aid only: it never diagnoses, never prescribes, never invents a vital sign, and
 * never claims a figure is live — every hospital carries the age of its own data and every
 * recommendation carries a human-readable reason a paramedic can argue with.
 *
 * The whole module is pure and synchronous: no store access, no network, and the only clock read
 * is the default for `MatchInput.now`. Same input, same output — which is what makes the demo
 * reproducible and the logic testable.
 */
import {
  BLOOD_GROUP_LABEL,
  COUNTABLE_RESOURCES,
  CRITICAL_RESOURCES,
  SPECIALIST_TYPES,
  type BloodBank,
  type BloodGroup,
  type CaseSeverity,
  type ConfidenceLevel,
  type CountableResource,
  type FacilityTier,
  type Hospital,
  type MatchResult,
  type RankedHospital,
  type ResourceType,
  type SpecialistType,
  type TriageTag,
  triageFromSeverity,
} from "@/lib/types";
import { etaMinutes, haversineKm, roadKm, type LatLng } from "@/lib/geo";

// ---------- Tunables (fixed by the product plan; kept named so the UI can explain them) ----------

/**
 * The five scoring weights, summing to 100. Exported so the breakdown UI can show
 * "8.1 of 15" instead of a bare number, and so the weights live in exactly one place.
 */
export const MATCH_WEIGHTS = {
  capability: 35,
  availability: 25,
  specialists: 15,
  travel: 15,
  freshness: 10,
} as const;

/**
 * Full travel marks at or under this many minutes; zero at or over SLOW_ETA_MINUTES; linear
 * between. Twist 4: the input is *time to definitive care*, not raw ETA — see below.
 */
const FAST_ETA_MINUTES = 5;
const SLOW_ETA_MINUTES = 40;

/** A hospital with no tier recorded is a standing tertiary hospital, so seeded data is unchanged. */
const DEFAULT_TIER: FacilityTier = "TERTIARY";

/** How far down the escalation ladder the recommendation had to walk (Twist 3). */
export const ESCALATION_RUNGS = [
  "TERTIARY_FULL",
  "TERTIARY_STABILISE",
  "SECONDARY_STABILISE",
  "PRIMARY_MINOR",
  "NONE",
] as const;
export type EscalationRung = (typeof ESCALATION_RUNGS)[number];

export const ESCALATION_RUNG_LABEL: Record<EscalationRung, string> = {
  TERTIARY_FULL: "Tertiary hospital, every critical need met",
  TERTIARY_STABILISE: "Tertiary hospital, but not everything is available",
  SECONDARY_STABILISE: "Secondary centre — can stabilise, transfer likely",
  PRIMARY_MINOR: "Primary centre or camp, minor injuries only",
  NONE: "No facility on any rung can take this patient",
};

/** Freshness is full under 10 minutes old and decays to zero at 120 minutes. */
const FRESH_MINUTES = 10;
const FRESHNESS_FLOOR_MINUTES = 120;

/** Past this age the figures are shown with a caution, but the hospital keeps its rank. */
const STALE_AFTER_MINUTES = 30;

/** How much a hospital's own confidence in its numbers discounts the freshness component. */
const CONFIDENCE_MULTIPLIER: Record<ConfidenceLevel, number> = { HIGH: 1, MEDIUM: 0.75, LOW: 0.5 };

/** A blood bank must be this close to the receiving hospital to count as "within reach". */
const BLOOD_RADIUS_KM = 6;
/** Blood stock older than this is a fallback only, and is labelled unverified when used. */
const BLOOD_STALE_MINUTES = 120;
/** Units assumed when the paramedic gave a blood group but no number. */
const DEFAULT_BLOOD_UNITS = 2;

/** Used when a timestamp cannot be parsed: treat unknown as very old rather than as fresh. */
const UNKNOWN_AGE_MINUTES = 1440;

/** Suitability outranks score, so it sorts first. */
const BAND_ORDER: Record<RankedHospital["suitability"], number> = {
  SUITABLE: 0,
  PARTIAL: 1,
  UNSUITABLE: 2,
};

/** At most this many resources are named in one explanation; a 2 a.m. sentence must stay short. */
const MAX_NAMED_REASONS = 3;

/** Most decision-relevant first, so a truncated explanation names the things that matter. */
const PHRASE_PRIORITY: readonly ResourceType[] = [
  "ICU",
  "NEUROSURGEON",
  "OPERATING_ROOM",
  "VENTILATOR",
  "TRAUMA_TEAM",
  "CT_SCAN",
  "ORTHOPEDIC_SURGEON",
  "EMERGENCY_BED",
  "BLOOD_BANK",
];

/** Plain-language "we have it" phrases. Blood is phrased separately because it names a bank. */
const READY_PHRASE: Record<Exclude<ResourceType, "BLOOD_BANK">, string> = {
  ICU: "ICU bed free",
  EMERGENCY_BED: "emergency bed free",
  VENTILATOR: "ventilator free",
  CT_SCAN: "CT scanner free",
  OPERATING_ROOM: "operating room free",
  NEUROSURGEON: "neurosurgeon on call",
  ORTHOPEDIC_SURGEON: "orthopaedic surgeon on call",
  TRAUMA_TEAM: "trauma team on call",
};

/** Plain-language "we do not have it" phrases. */
const MISSING_PHRASE: Record<Exclude<ResourceType, "BLOOD_BANK">, string> = {
  ICU: "no ICU bed",
  EMERGENCY_BED: "no emergency bed",
  VENTILATOR: "no ventilator",
  CT_SCAN: "no CT scanner",
  OPERATING_ROOM: "no operating room",
  NEUROSURGEON: "no neurosurgeon on call",
  ORTHOPEDIC_SURGEON: "no orthopaedic surgeon on call",
  TRAUMA_TEAM: "no trauma team on call",
};

// ---------- Input ----------

/**
 * Everything the ranking needs, passed in explicitly so the function stays pure and the caller
 * (a route handler) owns all store and clock access.
 */
export interface MatchInput {
  /** Where the ambulance is now — the point travel time is measured from. */
  origin: LatLng;
  /** What this patient needs, as extracted from the case and editable by the paramedic. */
  requirements: ResourceType[];
  /**
   * Case severity. Recorded on the decision for the audit trail and for future triage rules;
   * it deliberately does not bend the weights, because the weights are fixed by the product plan
   * and a hospital that cannot treat the patient is not made suitable by the patient being sicker.
   */
  severity: CaseSeverity;
  bloodGroup?: BloodGroup;
  bloodUnitsNeeded?: number;
  hospitals: Hospital[];
  bloodBanks: BloodBank[];
  /**
   * Twist 3: human-set triage tag, used only to decide which rung of the facility ladder this
   * patient may be sent down to. Defaults to `triageFromSeverity(severity)`. It never bends the
   * weights and it never makes an unsuitable hospital suitable.
   */
  triage?: TriageTag;
  /**
   * Twist 3: allow the ladder to walk below tertiary when no tertiary hospital is suitable.
   * Defaults to true. Set false to keep the pool tertiary-only (a coordinator's override).
   */
  allowEscalation?: boolean;
  /** Reference time in epoch ms. Defaults to now; pass it to make results reproducible. */
  now?: number;
}

// ---------- Extended result (Twists 3 and 4) ----------

/**
 * A ranked hospital with the two things `RankedHospital` in `lib/types.ts` cannot yet carry.
 * Callers that want the twist fields should type against this rather than `RankedHospital`;
 * it is a structural superset, so existing code reading a `RankedHospital` keeps working.
 */
export interface TimedRankedHospital extends RankedHospital {
  /**
   * Twist 4: worst `readinessMinutes` among the resources *this* patient needs. Zero when the
   * hospital reported nothing, which means ready now.
   */
  readinessDelayMinutes: number;
  /** Twist 4: `etaMinutes + readinessDelayMinutes` — when treatment can actually start. */
  timeToDefinitiveCare: number;
  /** The resource responsible for the delay, when there is one. */
  readinessBlocker?: ResourceType;
  /** Twist 3: the rung this facility sits on. `TERTIARY` when the facility did not say. */
  tier: FacilityTier;
  /** Set only when the tier itself changed the verdict, e.g. "can stabilise, transfer likely". */
  tierNote?: string;
}

/** Which rung the recommendation reached, and why — so the UI can be honest that we escalated. */
export interface EscalationSummary {
  rung: EscalationRung;
  /** The tier of the primary recommendation, absent when there is no recommendation at all. */
  reachedTier?: FacilityTier;
  /** True when we had to go below "a tertiary hospital that meets every critical need". */
  escalated: boolean;
  /** One plain sentence a coordinator can read out. */
  reason: string;
}

export interface TimedMatchResult extends MatchResult {
  ranked: TimedRankedHospital[];
  escalation: EscalationSummary;
}

// ---------- Small pure helpers ----------

const round1 = (n: number): number => Math.round(n * 10) / 10;

function isCountable(r: ResourceType): r is CountableResource {
  return (COUNTABLE_RESOURCES as readonly string[]).includes(r);
}

function isSpecialist(r: ResourceType): r is SpecialistType {
  return (SPECIALIST_TYPES as readonly string[]).includes(r);
}

/** Age of a reported figure in whole minutes. Unparseable timestamps count as very old, never fresh. */
function ageInMinutes(iso: string, now: number): number {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return UNKNOWN_AGE_MINUTES;
  return Math.max(0, Math.round((now - at) / 60_000));
}

/** Share of a list that satisfies a test; an empty list scores 1 so nobody is punished for a requirement nobody asked for. */
function share<T>(items: readonly T[], ok: (item: T) => boolean): number {
  if (items.length === 0) return 1;
  return items.filter(ok).length / items.length;
}

function travelFraction(eta: number): number {
  if (eta <= FAST_ETA_MINUTES) return 1;
  if (eta >= SLOW_ETA_MINUTES) return 0;
  return (SLOW_ETA_MINUTES - eta) / (SLOW_ETA_MINUTES - FAST_ETA_MINUTES);
}

function freshnessFraction(ageMinutes: number, confidence: ConfidenceLevel): number {
  const decay =
    ageMinutes < FRESH_MINUTES
      ? 1
      : ageMinutes >= FRESHNESS_FLOOR_MINUTES
        ? 0
        : (FRESHNESS_FLOOR_MINUTES - ageMinutes) / (FRESHNESS_FLOOR_MINUTES - FRESH_MINUTES);
  return decay * CONFIDENCE_MULTIPLIER[confidence];
}

function byPriority(a: ResourceType, b: ResourceType): number {
  const ia = PHRASE_PRIORITY.indexOf(a);
  const ib = PHRASE_PRIORITY.indexOf(b);
  return (ia < 0 ? PHRASE_PRIORITY.length : ia) - (ib < 0 ? PHRASE_PRIORITY.length : ib);
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/** "a", "a and b", "a, b and c" — for the things a hospital is missing. */
function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// ---------- Blood ----------

interface BloodMatch {
  bankId: string;
  distanceKm: number;
  units: number;
  /** True when the only bank that fits has not reported for over two hours. */
  unverified: boolean;
  name: string;
}

interface BloodCandidate {
  bank: BloodBank;
  km: number;
  units: number;
  ageMinutes: number;
}

/** Most units first, then closest, then id — a total order, so the pick never depends on input order. */
function bestBloodCandidate(list: BloodCandidate[]): BloodCandidate | undefined {
  let best: BloodCandidate | undefined;
  for (const c of list) {
    if (
      best === undefined ||
      c.units > best.units ||
      (c.units === best.units && c.km < best.km) ||
      (c.units === best.units && c.km === best.km && c.bank.id.localeCompare(best.bank.id) < 0)
    ) {
      best = c;
    }
  }
  return best;
}

/**
 * Finds the blood bank that can actually serve this hospital: enough units of the right group,
 * within reach of the hospital (not of the crash site — the units have to travel to the patient).
 * Stale stock is a last resort and is flagged, because sending an ambulance on a two-hour-old
 * number is the failure this product exists to prevent.
 */
function findBlood(
  hospital: Hospital,
  banks: BloodBank[],
  group: BloodGroup,
  unitsNeeded: number,
  now: number,
): BloodMatch | undefined {
  const at: LatLng = { lat: hospital.lat, lng: hospital.lng };
  const candidates: BloodCandidate[] = [];
  for (const bank of banks) {
    const km = round1(haversineKm(at, bank));
    if (km > BLOOD_RADIUS_KM) continue;
    const units = bank.inventory[group].available;
    if (units < unitsNeeded) continue;
    candidates.push({ bank, km, units, ageMinutes: ageInMinutes(bank.lastUpdatedAt, now) });
  }
  const fresh = candidates.filter((c) => c.ageMinutes <= BLOOD_STALE_MINUTES);
  const chosen = fresh.length > 0 ? bestBloodCandidate(fresh) : bestBloodCandidate(candidates);
  if (!chosen) return undefined;
  return {
    bankId: chosen.bank.id,
    distanceKm: chosen.km,
    units: chosen.units,
    unverified: chosen.ageMinutes > BLOOD_STALE_MINUTES,
    name: chosen.bank.name,
  };
}

// ---------- Explanation ----------

function bloodReadyPhrase(group: BloodGroup, blood: BloodMatch): string {
  const base = `${BLOOD_GROUP_LABEL[group]} available ${blood.distanceKm} km away`;
  return blood.unverified ? `${base} (unverified, not reported recently)` : base;
}

function readyPhrase(r: ResourceType, group: BloodGroup | undefined, blood: BloodMatch | undefined): string {
  if (r === "BLOOD_BANK") {
    return group && blood ? bloodReadyPhrase(group, blood) : "matched blood within reach";
  }
  return READY_PHRASE[r];
}

function missingPhrase(r: ResourceType): string {
  return r === "BLOOD_BANK" ? "no matched blood within reach" : MISSING_PHRASE[r];
}

/** Names up to three resources, then says how many more there were, so the sentence stays honest and short. */
function namedList(resources: ResourceType[], phrase: (r: ResourceType) => string, separator: "comma" | "and"): string {
  const ordered = resources.slice().sort(byPriority);
  const shown = ordered.slice(0, MAX_NAMED_REASONS).map(phrase);
  const hidden = ordered.length - shown.length;
  const body = separator === "and" ? joinAnd(shown) : shown.join(", ");
  if (hidden <= 0) return body;
  return `${body} and ${hidden} more`;
}

interface ExplanationInput {
  suitability: RankedHospital["suitability"];
  matched: ResourceType[];
  missing: ResourceType[];
  missingCritical: ResourceType[];
  eta: number;
  stale: boolean;
  dataAgeMinutes: number;
  bloodGroup?: BloodGroup;
  blood?: BloodMatch;
  /** Twist 4: zero means ready on arrival, and the sentence then reads exactly as it always did. */
  readinessDelayMinutes: number;
  readinessBlocker?: ResourceType;
  timeToDefinitiveCare: number;
  /** Twist 3: set only when the facility's rung changed the verdict. */
  tierNote?: string;
}

/**
 * The closing sentence. With nothing to wait for it is the familiar "12 min away."; when something
 * the patient needs is not yet usable it says so and gives the number that actually matters.
 */
function arrivalSentence(x: ExplanationInput, cannotTake: boolean): string {
  if (x.readinessDelayMinutes > 0 && x.readinessBlocker) {
    const noun = RESOURCE_NOUN[x.readinessBlocker];
    const tail = cannotTake ? ", and cannot take this patient" : "";
    return `${x.eta} min away, but the ${noun} is not usable for another ${x.readinessDelayMinutes} min — ${x.timeToDefinitiveCare} min to treatment${tail}.`;
  }
  return cannotTake ? `${x.eta} min away, but cannot take this patient.` : `${x.eta} min away.`;
}

/**
 * Builds the one-to-three-sentence reason a paramedic reads at 2 a.m.: a caution first if the
 * figures are old, then the concrete things this hospital has or lacks, then how far away it is.
 * No percentages and no jargon — the numeric breakdown is shown separately for whoever wants it.
 */
function buildExplanation(x: ExplanationInput): string {
  const sentences: string[] = [];

  if (x.stale) {
    sentences.push(`Figures unconfirmed, last reported ${x.dataAgeMinutes} min ago.`);
  }

  if (x.suitability === "UNSUITABLE") {
    // Name the blockers, and blood too when it is missing: the crew still has to solve that
    // somewhere else, so it must not disappear just because something worse is wrong here.
    const problems = x.missing.includes("BLOOD_BANK")
      ? [...x.missingCritical, "BLOOD_BANK" as const]
      : x.missingCritical;
    if (problems.length > 0) sentences.push(`${capitalise(namedList(problems, missingPhrase, "and"))}.`);
    if (x.tierNote) sentences.push(x.tierNote);
    sentences.push(arrivalSentence(x, true));
    return sentences.join(" ");
  }

  const nonBlood = x.matched.filter((r) => r !== "BLOOD_BANK");
  const good: string[] = [];
  const orderedGood = nonBlood.slice().sort(byPriority);
  for (const r of orderedGood.slice(0, MAX_NAMED_REASONS)) good.push(readyPhrase(r, x.bloodGroup, x.blood));
  // Blood is named even when the crew only gave a group without listing it as a requirement,
  // because "is O- there?" is the question crews actually ask on the radio.
  if (x.bloodGroup && x.blood) good.push(bloodReadyPhrase(x.bloodGroup, x.blood));
  const hiddenGood = orderedGood.length - Math.min(orderedGood.length, MAX_NAMED_REASONS);

  let first = "";
  if (good.length > 0) {
    first = capitalise(good.join(", "));
    if (hiddenGood > 0) first += `, plus ${hiddenGood} more ready`;
  } else {
    first = "Nothing specific was requested for this patient";
  }
  if (x.missing.length > 0) {
    first += `, but ${namedList(x.missing, missingPhrase, "and")}`;
  }
  sentences.push(`${first}.`);
  if (x.tierNote) sentences.push(x.tierNote);
  sentences.push(arrivalSentence(x, false));
  return sentences.join(" ");
}

/**
 * Turns one ranked hospital into a single sentence naming the hospital, where it stands and why.
 * Used in the timeline, the event log and anywhere a row is read out loud, so the reason always
 * travels with the recommendation instead of being a bare number on a screen.
 */
export function explainRanked(r: RankedHospital, hospitalName: string): string {
  const lead =
    r.suitability === "UNSUITABLE"
      ? "Not suitable"
      : r.suitability === "PARTIAL"
        ? "Partly suitable"
        : r.rank === 1
          ? "Best match"
          : `Option ${r.rank}`;
  return `${lead}: ${hospitalName}. ${r.explanation}`;
}

// ---------- Twist 4: time to definitive care ----------

/** Plain nouns for the readiness sentence: "the neurosurgeon is 40 min away". */
const RESOURCE_NOUN: Record<ResourceType, string> = {
  ICU: "ICU bed",
  EMERGENCY_BED: "emergency bed",
  VENTILATOR: "ventilator",
  CT_SCAN: "CT scanner",
  OPERATING_ROOM: "operating room",
  NEUROSURGEON: "neurosurgeon",
  ORTHOPEDIC_SURGEON: "orthopaedic surgeon",
  TRAUMA_TEAM: "trauma team",
  BLOOD_BANK: "blood",
};

interface Readiness {
  delayMinutes: number;
  blocker?: ResourceType;
}

/**
 * How long after arrival this patient can actually be treated here.
 *
 * A hospital is not "available" the moment the ambulance stops: the neurosurgeon may be paged but
 * driving in, the CT may have a queue, the theatre may be mid-case. The delay is the **worst** of
 * the resources this patient needs — you wait for the slowest one — and only those; a busy theatre
 * is irrelevant to a patient who needs an emergency bed. A hospital that reported nothing is taken
 * at its word as ready now, which is why seeded data behaves exactly as it did before.
 */
function readinessFor(h: Hospital, required: readonly ResourceType[]): Readiness {
  const reported = h.readinessMinutes;
  if (!reported) return { delayMinutes: 0 };
  let delayMinutes = 0;
  let blocker: ResourceType | undefined;
  for (const r of required) {
    const minutes = reported[r];
    if (minutes === undefined || minutes <= delayMinutes) continue;
    delayMinutes = Math.max(0, Math.round(minutes));
    blocker = r;
  }
  return { delayMinutes, blocker };
}

// ---------- Twist 3: the escalation ladder ----------

interface TierVerdict {
  /** Hard ceiling this tier puts on the verdict, or undefined for "no constraint". */
  cap?: RankedHospital["suitability"];
  note?: string;
}

/**
 * What a facility's rung permits for this patient. Tertiary hospitals are unconstrained, which is
 * every seeded facility, so nothing changes until someone records a tier.
 *
 * The ladder is deliberately conservative in the clinical direction: a secondary centre is never
 * offered as a complete answer, only as a place that can stabilise; primary centres and camps are
 * offered for GREEN-level need alone, which protects the tier above for the patients who need it.
 */
function tierVerdict(
  tier: FacilityTier,
  missingCriticalCount: number,
  greenLevel: boolean,
  allowEscalation: boolean,
): TierVerdict {
  if (tier === "TERTIARY") return {};
  if (!allowEscalation) {
    return { cap: "UNSUITABLE", note: "Not a tertiary hospital, and escalation is switched off." };
  }
  if (tier === "SECONDARY") {
    if (missingCriticalCount > 0) {
      return { cap: "UNSUITABLE", note: "Secondary centre, and it is missing something critical." };
    }
    return { cap: "PARTIAL", note: "Secondary centre: can stabilise, transfer likely." };
  }
  // PRIMARY and CAMP.
  if (!greenLevel) {
    const what = tier === "CAMP" ? "An emergency camp" : "A primary health centre";
    return { cap: "UNSUITABLE", note: `${what} cannot take a patient at this level of need.` };
  }
  return { cap: "PARTIAL", note: "Minor injuries only, taken here to protect trauma capacity." };
}

/** UNSUITABLE beats PARTIAL beats SUITABLE when a tier caps the verdict. */
function applyCap(
  suitability: RankedHospital["suitability"],
  cap: RankedHospital["suitability"] | undefined,
): RankedHospital["suitability"] {
  if (!cap) return suitability;
  return BAND_ORDER[cap] > BAND_ORDER[suitability] ? cap : suitability;
}

// ---------- Ranking ----------

function canSupplyNow(h: Hospital, r: ResourceType, blood: BloodMatch | undefined): boolean {
  // Blood is supplied by a partner bank, not by the hospital's own department list, so judging it
  // against `capabilities` would mark every hospital in the city as unable to transfuse.
  if (r === "BLOOD_BANK") return blood !== undefined;
  if (!h.capabilities.includes(r)) return false;
  if (isCountable(r)) return h.resources[r].available > 0;
  if (isSpecialist(r)) return h.specialists[r].onCall;
  return true;
}

function hasCapability(h: Hospital, r: ResourceType, blood: BloodMatch | undefined): boolean {
  if (r === "BLOOD_BANK") return blood !== undefined;
  return h.capabilities.includes(r);
}

/**
 * Ranks every hospital for one patient and returns the primary and backup recommendation.
 *
 * Two rules matter more than the score. First, a hospital that cannot supply a critical resource
 * right now (no ICU bed, no neurosurgeon, no ventilator, no operating room) is UNSUITABLE and can
 * never be placed above a suitable hospital or chosen as primary or backup, however close it is —
 * the nearest hospital is not the right hospital. Second, every row carries the age of the data it
 * was judged on, because a confident number from an hour ago is still an hour old.
 *
 * Pure: the only clock read is the default for `input.now`, and every hospital passed in appears
 * in `ranked` exactly once.
 */
export function rankHospitals(input: MatchInput): TimedMatchResult {
  const now = input.now ?? Date.now();
  const required = Array.from(new Set(input.requirements));
  const allowEscalation = input.allowEscalation ?? true;
  const triage = input.triage ?? triageFromSeverity(input.severity);
  // "GREEN-level need" is both a green tag and an absence of critical requirements: a tag alone
  // must not be able to send a patient who needs a ventilator to a field camp.
  const greenLevel = triage === "GREEN" && !required.some((r) => CRITICAL_RESOURCES.includes(r));
  const requiredCountable = required.filter(isCountable);
  const requiredSpecialists = required.filter(isSpecialist);
  const unitsNeeded = input.bloodUnitsNeeded ?? DEFAULT_BLOOD_UNITS;
  const group = input.bloodGroup;

  const rows: TimedRankedHospital[] = input.hospitals.map((h) => {
    // The bank is looked up whenever a group is known: the crew asks "is O- there?" even when
    // blood was never added to the formal requirement list.
    const blood = group ? findBlood(h, input.bloodBanks, group, unitsNeeded, now) : undefined;

    const matched: ResourceType[] = [];
    const missing: ResourceType[] = [];
    for (const r of required) {
      if (canSupplyNow(h, r, blood)) matched.push(r);
      else missing.push(r);
    }
    const missingCritical = missing.filter((r) => CRITICAL_RESOURCES.includes(r));

    const baseSuitability: RankedHospital["suitability"] =
      missingCritical.length > 0 ? "UNSUITABLE" : missing.length > 0 ? "PARTIAL" : "SUITABLE";

    const tier = h.tier ?? DEFAULT_TIER;
    const verdict = tierVerdict(tier, missingCritical.length, greenLevel, allowEscalation);
    const suitability = applyCap(baseSuitability, verdict.cap);
    // Tertiary facilities produce no note at all, so an existing recommendation reads unchanged.
    const tierNote = verdict.note;

    const at: LatLng = { lat: h.lat, lng: h.lng };
    const distanceKm = roadKm(input.origin, at);
    const eta = etaMinutes(input.origin, at);
    const readiness = readinessFor(h, required);
    const timeToDefinitiveCare = eta + readiness.delayMinutes;
    const dataAgeMinutes = ageInMinutes(h.lastUpdatedAt, now);
    const stale = dataAgeMinutes > STALE_AFTER_MINUTES;

    const capability = share(required, (r) => hasCapability(h, r, blood)) * MATCH_WEIGHTS.capability;
    const availability =
      share(requiredCountable, (r) => h.resources[r].available > 0) * MATCH_WEIGHTS.availability;
    const specialists =
      share(requiredSpecialists, (r) => h.specialists[r].onCall) * MATCH_WEIGHTS.specialists;
    // Twist 4: the weight is unchanged at 15 — the *input* was wrong. Scoring raw travel time
    // rewards a hospital you can reach quickly and then wait in.
    const travel = travelFraction(timeToDefinitiveCare) * MATCH_WEIGHTS.travel;
    const freshness = freshnessFraction(dataAgeMinutes, h.confidenceLevel) * MATCH_WEIGHTS.freshness;
    const score = round1(capability + availability + specialists + travel + freshness);

    return {
      hospitalId: h.id,
      rank: 0, // assigned after sorting
      score,
      suitability,
      distanceKm,
      etaMinutes: eta,
      matched,
      missing,
      missingCritical,
      bloodBankId: blood?.bankId,
      bloodDistanceKm: blood?.distanceKm,
      bloodUnitsAvailable: blood?.units,
      dataAgeMinutes,
      stale,
      readinessDelayMinutes: readiness.delayMinutes,
      timeToDefinitiveCare,
      readinessBlocker: readiness.blocker,
      tier,
      tierNote,
      breakdown: {
        capability: round1(capability),
        availability: round1(availability),
        specialists: round1(specialists),
        travel: round1(travel),
        freshness: round1(freshness),
      },
      explanation: buildExplanation({
        suitability,
        matched,
        missing,
        missingCritical,
        eta,
        stale,
        dataAgeMinutes,
        bloodGroup: group,
        blood,
        readinessDelayMinutes: readiness.delayMinutes,
        readinessBlocker: readiness.blocker,
        timeToDefinitiveCare,
        tierNote,
      }),
    };
  });

  // Band first (a suitable hospital always beats an unsuitable one), then score, then the faster
  // arrival, then id so the order is total and the demo is reproducible.
  // The tie-break is time to definitive care rather than ETA for the same reason the score is:
  // with no readiness reported the two are equal, so seeded behaviour is untouched.
  const ranked: TimedRankedHospital[] = rows
    .slice()
    .sort(
      (a, b) =>
        BAND_ORDER[a.suitability] - BAND_ORDER[b.suitability] ||
        b.score - a.score ||
        a.timeToDefinitiveCare - b.timeToDefinitiveCare ||
        a.hospitalId.localeCompare(b.hospitalId),
    )
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const primary = ranked.find((r) => r.suitability === "SUITABLE") ?? ranked.find((r) => r.suitability === "PARTIAL");
  const backup = primary
    ? ranked.find(
        (r) => r.hospitalId !== primary.hospitalId && BAND_ORDER[r.suitability] <= BAND_ORDER[primary.suitability],
      )
    : undefined;

  return {
    at: new Date(now).toISOString(),
    primaryHospitalId: primary?.hospitalId,
    backupHospitalId: backup?.hospitalId,
    ranked: withReadinessArgument(ranked, primary),
    escalation: summariseEscalation(primary, allowEscalation, greenLevel),
  };
}

/**
 * Says out loud when readiness — not distance — chose the winner.
 *
 * Only when the recommendation is genuinely not the closest offerable hospital *and* it still
 * reaches treatment sooner. Otherwise the sentence would be a boast with nothing behind it, and
 * with no readiness reported anywhere the condition can never fire, so seeded output is byte-identical.
 */
function withReadinessArgument(
  ranked: TimedRankedHospital[],
  primary: TimedRankedHospital | undefined,
): TimedRankedHospital[] {
  if (!primary) return ranked;
  const offerable = ranked.filter((r) => r.suitability !== "UNSUITABLE" && r.hospitalId !== primary.hospitalId);
  let closest: TimedRankedHospital | undefined;
  for (const r of offerable) {
    if (!closest || r.etaMinutes < closest.etaMinutes) closest = r;
  }
  if (!closest) return ranked;
  if (closest.etaMinutes >= primary.etaMinutes) return ranked;
  if (closest.timeToDefinitiveCare <= primary.timeToDefinitiveCare) return ranked;

  const further = primary.etaMinutes - closest.etaMinutes;
  const blocker = closest.readinessBlocker ? RESOURCE_NOUN[closest.readinessBlocker] : "the team there";
  const sentence = `${further} min further, but ${blocker} is ready here — ${primary.timeToDefinitiveCare} min to treatment against ${closest.timeToDefinitiveCare}.`;
  return ranked.map((r) =>
    r.hospitalId === primary.hospitalId ? { ...r, explanation: `${r.explanation} ${sentence}` } : r,
  );
}

/** Which rung the primary recommendation landed on, and one sentence saying why that is honest. */
function summariseEscalation(
  primary: TimedRankedHospital | undefined,
  allowEscalation: boolean,
  greenLevel: boolean,
): EscalationSummary {
  if (!primary) {
    return {
      rung: "NONE",
      escalated: true,
      reason: allowEscalation
        ? "No facility on any rung can take this patient right now. Consider standing up a camp or widening the search."
        : "No tertiary hospital can take this patient, and escalation below tertiary is switched off.",
    };
  }
  if (primary.tier === "TERTIARY") {
    if (primary.suitability === "SUITABLE") {
      return {
        rung: "TERTIARY_FULL",
        reachedTier: "TERTIARY",
        escalated: false,
        reason: "A tertiary hospital meets every critical need, so no escalation was needed.",
      };
    }
    return {
      rung: "TERTIARY_STABILISE",
      reachedTier: "TERTIARY",
      escalated: true,
      reason: "No tertiary hospital has everything. The best one can still take the patient, but something on the list is missing.",
    };
  }
  if (primary.tier === "SECONDARY") {
    return {
      rung: "SECONDARY_STABILISE",
      reachedTier: "SECONDARY",
      escalated: true,
      reason: "No tertiary hospital is suitable, so we escalated down to a secondary centre that meets the critical needs. Plan for onward transfer.",
    };
  }
  return {
    rung: "PRIMARY_MINOR",
    reachedTier: primary.tier,
    escalated: true,
    reason: greenLevel
      ? "Minor injuries, sent to a primary centre or camp on purpose so trauma capacity stays free for patients who need it."
      : "Only a primary centre or camp is available. This is a holding position, not definitive care.",
  };
}
