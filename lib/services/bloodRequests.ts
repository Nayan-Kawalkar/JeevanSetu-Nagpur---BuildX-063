/**
 * Explicit blood requests — the named ask that replaces ringing round WhatsApp groups.
 *
 * Until now blood was only ever held as a side effect of a hospital accepting a case. That
 * covers the scripted path and nothing else: the surgeon who needs two more units at 2 a.m.,
 * the bank whose shelf turns out to hold one, the operator who says no and must say why. This
 * module makes that conversation a record instead of a phone call nobody can audit.
 *
 * Three rules shape it, and they are the same rules reservation.ts already follows.
 *  1. Saying yes means holding the units. An operator who accepts without moving stock from
 *     available to reserved has promised something the next caller can still be given, which
 *     is precisely the failure this replaces. RESERVE therefore checks and moves in one step,
 *     or it changes nothing at all and says what was actually on the shelf.
 *  2. Units never vanish and never multiply. Fulfilment takes them off the reserved pile
 *     without giving them back; release and expiry put back only what is still shown as held,
 *     so an operator's manual stock correction is never overwritten by a later release.
 *  3. Every transition writes one sentence a human can read, naming the units, the group and
 *     the bank, because the timeline is what a coordinator argues with at handover.
 *
 * Coordination only. No donor exists in this model and none is invented here; nothing below
 * diagnoses, prescribes, or guarantees that units will be on the shelf when a courier arrives.
 */
import { ApiError } from "@/lib/api";
import {
  addEvent,
  db,
  getBloodBank,
  getBloodRequest,
  getCase,
  getHospital,
  listBloodRequests,
  nextId,
  nowIso,
} from "@/lib/store";
import {
  BLOOD_COMPONENT_LABEL,
  BLOOD_GROUP_LABEL,
  type BloodComponent,
  type BloodGroup,
  type BloodRequest,
} from "@/lib/types";

/**
 * How long an unanswered ask, or an answered hold nobody collected, survives.
 *
 * Shorter than a resource reservation on purpose: blood held for a case that never sent a
 * courier is blood denied to the next theatre, and ten minutes is long enough for an operator
 * to walk to the refrigerator and back.
 */
export const BLOOD_REQUEST_EXPIRY_MINUTES = 10;

/** Statuses that still hold units on the reserved pile. */
const HOLDING: readonly BloodRequest["status"][] = ["RESERVED"];

export interface CreateBloodRequestInput {
  caseId: string;
  hospitalId: string;
  bloodBankId: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  units: number;
  requestedBy: string;
  /** Client-generated key so a double tap on a phone never sends two asks for one patient. */
  idempotencyKey?: string;
}

export interface RespondBloodRequestInput {
  action: "RESERVE" | "REJECT";
  reason?: string;
  respondedBy: string;
}

export interface BloodRequestOutcome {
  request: BloodRequest;
  /** Set when the answer could not be carried out; in that case nothing was changed. */
  error?: string;
}

// ---------- Idempotency ----------

/**
 * Idempotency keys live beside the store rather than on the record, because BloodRequest is a
 * contract type this module does not own. Kept on globalThis so a hot reload in dev does not
 * turn a retried request into a second hold, and always re-checked against the live store so a
 * demo reset cannot resurrect an id that no longer exists.
 */
const globalRef = globalThis as unknown as { __jeevansetuBloodKeys?: Map<string, string> };

function keyIndex(): Map<string, string> {
  globalRef.__jeevansetuBloodKeys ??= new Map<string, string>();
  return globalRef.__jeevansetuBloodKeys;
}

// ---------- Phrasing ----------

/** "2 units of O−" / "1 unit of AB+", the way an operator reads it back down the phone. */
function unitPhrase(units: number, group: BloodGroup): string {
  return `${units} ${units === 1 ? "unit" : "units"} of ${BLOOD_GROUP_LABEL[group]}`;
}

/** The whole ask in one clause, for an event sentence. */
function describe(request: BloodRequest): string {
  return `${unitPhrase(request.units, request.bloodGroup)} (${BLOOD_COMPONENT_LABEL[
    request.component
  ].toLowerCase()})`;
}

function bankName(id: string): string {
  return db().bloodBanks[id]?.name ?? id;
}

function hospitalName(id: string): string {
  return db().hospitals[id]?.name ?? id;
}

// ---------- Stock movement (never negative, never invented) ----------

/** Moves units from available to reserved. Caller has already proved the stock is there. */
function holdUnits(bankId: string, group: BloodGroup, units: number): void {
  const stock = db().bloodBanks[bankId]?.inventory[group];
  if (!stock) return;
  const moved = Math.min(units, stock.available);
  stock.available = Math.max(0, stock.available - moved);
  stock.reserved = Math.max(0, stock.reserved + moved);
}

/**
 * Puts held units back on the shelf. Gives back only what is still shown as reserved, so an
 * operator who corrected the count by hand while the hold was live keeps their correction.
 * Returns how many units actually moved, for the sentence in the event.
 */
function returnUnits(bankId: string, group: BloodGroup, units: number): number {
  const stock = db().bloodBanks[bankId]?.inventory[group];
  if (!stock) return 0;
  const giveBack = Math.min(units, stock.reserved);
  stock.reserved = Math.max(0, stock.reserved - giveBack);
  stock.available = Math.max(0, stock.available + giveBack);
  return giveBack;
}

/** Takes held units off the reserved pile for good: they have left the building. */
function consumeUnits(bankId: string, group: BloodGroup, units: number): void {
  const stock = db().bloodBanks[bankId]?.inventory[group];
  if (!stock) return;
  stock.reserved = Math.max(0, stock.reserved - Math.min(units, stock.reserved));
}

// ---------- Create ----------

/**
 * Records one hospital asking one bank to hold units for one named case.
 *
 * Refuses a second live ask for the same case and group (409): two banks each holding two
 * units of O− for the same patient is four units out of circulation and one theatre that still
 * only needs two. Idempotent on the caller's key, so a retried POST returns the first request
 * rather than creating a twin.
 */
export function createBloodRequest(input: CreateBloodRequestInput): BloodRequest {
  // Sweep first: an ask that lapsed a second ago must not look live and block this one.
  expireBloodRequests();

  if (input.idempotencyKey) {
    const existingId = keyIndex().get(input.idempotencyKey);
    const existing = existingId ? db().bloodRequests[existingId] : undefined;
    if (existing) return existing;
  }

  const emergencyCase = getCase(input.caseId);
  const hospital = getHospital(input.hospitalId);
  const bank = getBloodBank(input.bloodBankId);

  if (input.units < 1) {
    throw new ApiError(400, "Ask for at least one unit.");
  }

  const live = listBloodRequests({ caseId: emergencyCase.id, status: "PENDING" }).find(
    (r) => r.bloodGroup === input.bloodGroup,
  );
  if (live) {
    throw new ApiError(
      409,
      `Case ${emergencyCase.id} is already waiting on ${bankName(live.bloodBankId)} for ${unitPhrase(
        live.units,
        live.bloodGroup,
      )}. Wait for that answer, or let it lapse, before asking another bank.`,
    );
  }

  const createdAt = nowIso();
  const request: BloodRequest = {
    id: nextId("bloodRequest"),
    caseId: emergencyCase.id,
    hospitalId: hospital.id,
    bloodBankId: bank.id,
    bloodGroup: input.bloodGroup,
    component: input.component,
    units: input.units,
    status: "PENDING",
    requestedBy: input.requestedBy,
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + BLOOD_REQUEST_EXPIRY_MINUTES * 60_000).toISOString(),
  };
  db().bloodRequests[request.id] = request;
  if (input.idempotencyKey) keyIndex().set(input.idempotencyKey, request.id);

  addEvent({
    caseId: request.caseId,
    hospitalId: request.hospitalId,
    bloodBankId: request.bloodBankId,
    type: "BLOOD_REQUESTED",
    actorRole: "HOSPITAL_COORDINATOR",
    message: `${hospital.name} asked ${bank.name} for ${describe(request)} for case ${request.caseId}; ${BLOOD_REQUEST_EXPIRY_MINUTES} min to answer.`,
  });

  return request;
}

// ---------- Answer ----------

/**
 * The operator's answer at the refrigerator door.
 *
 * RESERVE checks the shelf and moves the units in the same step, or refuses and touches
 * nothing. The refusal is a sentence with the real numbers in it, because the coordinator's
 * next move — ask for fewer, ask another bank, or send a courier further — depends on knowing
 * exactly how short the bank is. REJECT frees nothing, since nothing was ever held.
 */
export function respondToBloodRequest(id: string, input: RespondBloodRequestInput): BloodRequestOutcome {
  expireBloodRequests();

  const request = getBloodRequest(id);
  if (request.status !== "PENDING") {
    throw new ApiError(
      409,
      `Blood request ${request.id} was already answered (${request.status.toLowerCase()}); it cannot be answered again.`,
    );
  }

  const bank = getBloodBank(request.bloodBankId);
  const stock = bank.inventory[request.bloodGroup];

  if (input.action === "REJECT") {
    request.status = "REJECTED";
    request.reason = input.reason;
    request.respondedBy = input.respondedBy;
    request.respondedAt = nowIso();

    addEvent({
      caseId: request.caseId,
      hospitalId: request.hospitalId,
      bloodBankId: request.bloodBankId,
      type: "BLOOD_REQUEST_REJECTED",
      actorRole: "BLOOD_BANK_OPERATOR",
      message: `${bank.name} could not supply ${describe(request)} for case ${request.caseId}${
        input.reason ? ` — ${input.reason}` : ""
      }. Nothing was held.`,
    });
    return { request };
  }

  if (stock.available < request.units) {
    // Nothing moves. The sentence carries the two numbers that decide what happens next.
    const error = `Cannot reserve: only ${stock.available} of ${request.units} units of ${BLOOD_GROUP_LABEL[request.bloodGroup]} on the shelf.`;
    return { request, error };
  }

  holdUnits(request.bloodBankId, request.bloodGroup, request.units);
  request.status = "RESERVED";
  request.respondedBy = input.respondedBy;
  request.respondedAt = nowIso();

  addEvent({
    caseId: request.caseId,
    hospitalId: request.hospitalId,
    bloodBankId: request.bloodBankId,
    type: "BLOOD_RESERVED",
    actorRole: "BLOOD_BANK_OPERATOR",
    message: `${bank.name} is holding ${describe(request)} for case ${request.caseId} at ${hospitalName(
      request.hospitalId,
    )}, for ${BLOOD_REQUEST_EXPIRY_MINUTES} minutes.`,
  });

  return { request };
}

// ---------- Fulfil ----------

/**
 * The units have left the shelf with a courier. Reserved comes down; available does not go up,
 * because those units are now in a cool box on the way to an operating room and advertising
 * them as spendable is how two theatres get promised the same bag.
 */
export function fulfilBloodRequest(id: string, by: string): BloodRequest {
  const request = getBloodRequest(id);
  if (!HOLDING.includes(request.status)) {
    throw new ApiError(
      409,
      `Blood request ${request.id} is ${request.status.toLowerCase()}; only a reserved request can be marked fulfilled.`,
    );
  }

  consumeUnits(request.bloodBankId, request.bloodGroup, request.units);
  request.status = "FULFILLED";
  request.respondedBy = by;
  request.respondedAt = nowIso();

  addEvent({
    caseId: request.caseId,
    hospitalId: request.hospitalId,
    bloodBankId: request.bloodBankId,
    type: "BLOOD_FULFILLED",
    actorRole: "BLOOD_BANK_OPERATOR",
    message: `${describe(request)} issued by ${bankName(request.bloodBankId)} for case ${request.caseId}, recorded by ${by}.`,
  });

  return request;
}

// ---------- Release ----------

/** The hold is off and the units go back on the shelf for whoever calls next. */
export function releaseBloodRequest(id: string, reason: string): BloodRequest {
  const request = getBloodRequest(id);
  if (!HOLDING.includes(request.status)) {
    throw new ApiError(
      409,
      `Blood request ${request.id} is ${request.status.toLowerCase()}; only a reserved request can be released.`,
    );
  }

  const returned = returnUnits(request.bloodBankId, request.bloodGroup, request.units);
  request.status = "RELEASED";
  request.respondedAt = nowIso();

  addEvent({
    caseId: request.caseId,
    hospitalId: request.hospitalId,
    bloodBankId: request.bloodBankId,
    type: "BLOOD_RELEASED",
    actorRole: "BLOOD_BANK_OPERATOR",
    message: `${unitPhrase(returned, request.bloodGroup)} returned to the shelf at ${bankName(
      request.bloodBankId,
    )} for case ${request.caseId} — ${reason}`,
  });

  return request;
}

// ---------- Expiry ----------

/**
 * Lapses everything that has run past its clock, and gives back anything it was holding.
 *
 * Synchronous and cheap, so every read path can call it: a bank's screen must never show units
 * as held for a case whose theatre finished an hour ago, and a hospital must never believe it
 * still has a hold nobody at the bank remembers making. Returns how many requests lapsed.
 */
export function expireBloodRequests(now: number = Date.now()): number {
  let expired = 0;

  for (const request of Object.values(db().bloodRequests)) {
    const live = request.status === "PENDING" || HOLDING.includes(request.status);
    if (!live) continue;
    if (Date.parse(request.expiresAt) >= now) continue;

    const wasHolding = HOLDING.includes(request.status);
    const returned = wasHolding ? returnUnits(request.bloodBankId, request.bloodGroup, request.units) : 0;
    request.status = "EXPIRED";
    request.respondedAt ??= new Date(now).toISOString();
    expired++;

    addEvent({
      caseId: request.caseId,
      hospitalId: request.hospitalId,
      bloodBankId: request.bloodBankId,
      type: wasHolding ? "BLOOD_RELEASED" : "BLOOD_REQUEST_REJECTED",
      actorRole: "SYSTEM",
      message: wasHolding
        ? `Hold at ${bankName(request.bloodBankId)} lapsed after ${BLOOD_REQUEST_EXPIRY_MINUTES} minutes; ${unitPhrase(
            returned,
            request.bloodGroup,
          )} returned to the shelf for case ${request.caseId}.`
        : `Request to ${bankName(request.bloodBankId)} for ${describe(request)} (case ${request.caseId}) lapsed after ${BLOOD_REQUEST_EXPIRY_MINUTES} minutes without an answer. Nothing was held.`,
    });
  }

  return expired;
}
