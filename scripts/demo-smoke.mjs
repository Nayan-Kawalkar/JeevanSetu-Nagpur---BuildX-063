/**
 * End-to-end smoke test for the JeevanSetu 360 scripted demo.
 *
 * Plain Node 22 ES module, built-ins only (global fetch + node:assert/strict). It drives the
 * running app over HTTP exactly as the presenter will on stage: reset, open the Rohan case,
 * match, request, accept, move the ambulance, close, and finally prove the all-or-nothing
 * reservation rule by making an accept fail and checking that nothing at all was held.
 *
 * Why it exists: the demo is the deliverable. A green typecheck says the code compiles; only
 * this says the story works end to end on a real server, in order, with the numbers moving
 * the way the audience will be told they move.
 *
 * Usage:  node scripts/demo-smoke.mjs        (or: npm run smoke)
 *         BASE_URL=http://host:port npm run smoke
 */
import assert from "node:assert/strict";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** The scripted demo patient, copied literally from ROHAN_SCENARIO in lib/seed.ts. */
const ROHAN = {
  tempPatientId: "TMP-ROHAN-27M",
  age: 27,
  sex: "M",
  incidentType: "ROAD_ACCIDENT",
  severity: "CRITICAL",
  bloodGroup: "O_NEG",
  bloodUnitsNeeded: 2,
  lat: 21.0455,
  lng: 79.014,
  locationLabel: "Wardha Road near Khapri, opposite MIHAN gate",
  notes:
    "Truck vs motorcycle, 27M rider. Head injury, unconscious for about 2 min, now GCS 12. Deformed right thigh, suspected femur fracture. Heavy bleeding from thigh, pressure dressing applied. Pulse 124, BP 90/60.",
};

// ---------- tiny harness ----------

let stepNumber = 0;

/** Prints a tick for a step that passed, so the run reads as a checklist on the terminal. */
function tick(label) {
  console.log(`  ✓ ${label}`);
}

/**
 * Runs one numbered step and prints its heading. Any throw is re-thrown with the step name
 * attached, because "step 8 failed" is what a person debugging at 2 a.m. needs to see first.
 */
async function step(name, fn) {
  stepNumber += 1;
  console.log(`\n${String(stepNumber).padStart(2, " ")}. ${name}`);
  try {
    return await fn();
  } catch (error) {
    error.message = `step ${stepNumber} (${name}): ${error.message}`;
    throw error;
  }
}

/**
 * One HTTP call returning both status and parsed body, never throwing on a non-2xx.
 * Assertions in the steps decide what a given status means, so an unexpected 409 shows up as
 * a readable assertion rather than as a thrown fetch error with no body.
 */
async function call(method, path, body) {
  const init = { method, headers: { accept: "application/json" } };
  if (body !== undefined) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${BASE_URL}${path}`, init);
  const text = await response.text();
  let parsed;
  try {
    parsed = text === "" ? null : JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

/** Asserts a status and, on a mismatch, shows the body — the error message is the whole point. */
function expectStatus(result, expected, what) {
  assert.equal(
    result.status,
    expected,
    `${what}: expected HTTP ${expected}, got ${result.status} — ${JSON.stringify(result.body)}`,
  );
}

/** The ranked entry for one hospital, or a clear failure naming what was actually ranked. */
function rankedFor(match, hospitalId) {
  const entry = match.ranked.find((r) => r.hospitalId === hospitalId);
  assert.ok(entry, `${hospitalId} missing from the ranking (got: ${match.ranked.map((r) => r.hospitalId).join(", ")})`);
  return entry;
}

/** ICU beds currently free at one hospital, read back over the API the dashboard uses. */
async function icuAvailable(hospitalId) {
  const result = await call("GET", `/api/hospitals/${hospitalId}`);
  expectStatus(result, 200, `GET /api/hospitals/${hospitalId}`);
  return result.body.hospital.resources.ICU.available;
}

/** Every countable resource level plus every blood-bank inventory line, as one comparable snapshot. */
async function resourceSnapshot() {
  const [hospitals, bloodBanks] = await Promise.all([
    call("GET", "/api/hospitals"),
    call("GET", "/api/bloodbanks"),
  ]);
  expectStatus(hospitals, 200, "GET /api/hospitals");
  expectStatus(bloodBanks, 200, "GET /api/bloodbanks");
  const snapshot = {};
  for (const hospital of hospitals.body.hospitals) {
    for (const [resource, slot] of Object.entries(hospital.resources)) {
      snapshot[`${hospital.id}.${resource}`] = `${slot.available}/${slot.total}`;
    }
  }
  for (const bank of bloodBanks.body.bloodBanks) {
    for (const [group, stock] of Object.entries(bank.inventory)) {
      snapshot[`${bank.id}.${group}`] = `${stock.available}+${stock.reserved}`;
    }
  }
  return snapshot;
}

/** Creates the Rohan case and returns its id; used by the main walk and by the rollback check. */
async function createRohanCase() {
  const created = await call("POST", "/api/cases", ROHAN);
  expectStatus(created, 201, "POST /api/cases");
  return created.body.case;
}

async function reset() {
  const result = await call("POST", "/api/demo/reset");
  expectStatus(result, 200, "POST /api/demo/reset");
  assert.equal(result.body.ok, true, "reset did not report ok");
  return result.body;
}

// ---------- the scripted demo ----------

async function main() {
  console.log(`JeevanSetu 360 demo smoke test against ${BASE_URL}`);

  await step("Reset the demo data", async () => {
    const body = await reset();
    tick(`reset ok, ${body.counts.hospitals} hospitals and ${body.counts.bloodBanks} blood banks seeded`);
  });

  await step("Health check", async () => {
    const result = await call("GET", "/api/health");
    expectStatus(result, 200, "GET /api/health");
    assert.equal(result.body.ok, true, "health did not report ok:true");
    assert.equal(result.body.hospitals, 6, "health did not report 6 hospitals");
    tick("ok true, 6 hospitals");
  });

  const rohan = await step("Open the Rohan case", async () => {
    const created = await createRohanCase();
    assert.ok(typeof created.id === "string" && created.id.length > 0, "created case has no id");
    for (const required of ["ICU", "NEUROSURGEON", "CT_SCAN", "ORTHOPEDIC_SURGEON"]) {
      assert.ok(
        created.requirements.includes(required),
        `requirements missing ${required} (got: ${created.requirements.join(", ")})`,
      );
    }
    tick(`${created.id} created, requirements: ${created.requirements.join(", ")}`);
    return created;
  });

  const match = await step("Match hospitals", async () => {
    const result = await call("POST", `/api/cases/${rohan.id}/match`);
    expectStatus(result, 200, `POST /api/cases/${rohan.id}/match`);
    const { match: ranking } = result.body;

    // The closest hospital is present but refused: this is the whole point of the product.
    const closest = rankedFor(ranking, "H1");
    assert.equal(closest.suitability, "UNSUITABLE", "H1 Khapri Wellness should be UNSUITABLE");
    assert.ok(closest.missingCritical.includes("ICU"), "H1 missingCritical should name ICU");
    assert.ok(closest.missingCritical.includes("NEUROSURGEON"), "H1 missingCritical should name NEUROSURGEON");
    tick(`H1 is closest (${closest.distanceKm} km) but UNSUITABLE: ${closest.missingCritical.join(" + ")} missing`);

    assert.equal(ranking.primaryHospitalId, "H2", "primary should be H2");
    const primary = rankedFor(ranking, "H2");
    assert.equal(primary.suitability, "SUITABLE", "H2 should be SUITABLE");
    assert.equal(primary.rank, 1, "H2 should be rank 1");
    assert.ok(typeof primary.bloodBankId === "string" && primary.bloodBankId.length > 0, "H2 has no bloodBankId");
    assert.ok(
      typeof primary.bloodUnitsAvailable === "number" && primary.bloodUnitsAvailable >= 2,
      `H2 bloodUnitsAvailable should be >= 2, got ${primary.bloodUnitsAvailable}`,
    );
    tick(`primary H2 rank 1, ${primary.bloodUnitsAvailable} O- units at ${primary.bloodBankId}`);

    assert.ok(ranking.backupHospitalId, "no backup hospital chosen");
    assert.notEqual(ranking.backupHospitalId, "H1", "backup must not be the unsuitable closest hospital");
    assert.notEqual(ranking.backupHospitalId, "H2", "backup must not be the primary");
    tick(`backup ${ranking.backupHospitalId}`);

    // Suitability outranks score: an unsuitable hospital may never sit above a suitable one.
    const band = { SUITABLE: 0, PARTIAL: 1, UNSUITABLE: 2 };
    for (let i = 1; i < ranking.ranked.length; i++) {
      const above = ranking.ranked[i - 1];
      const below = ranking.ranked[i];
      assert.ok(
        band[above.suitability] <= band[below.suitability],
        `${above.hospitalId} (${above.suitability}) outranks ${below.hospitalId} (${below.suitability})`,
      );
    }
    tick(`no unsuitable hospital outranks a suitable one (${ranking.ranked.map((r) => r.hospitalId).join(" > ")})`);

    return ranking;
  });

  const idempotencyKey = `smoke-${Date.now()}`;

  const request = await step("Request the primary hospital", async () => {
    const result = await call("POST", "/api/requests", {
      caseId: rohan.id,
      hospitalId: match.primaryHospitalId,
      idempotencyKey,
    });
    expectStatus(result, 201, "POST /api/requests");
    assert.equal(result.body.request.status, "PENDING", "new request should be PENDING");
    tick(`${result.body.request.id} PENDING at ${match.primaryHospitalId}`);
    return result.body.request;
  });

  await step("Re-post the same request (idempotency)", async () => {
    const result = await call("POST", "/api/requests", {
      caseId: rohan.id,
      hospitalId: match.primaryHospitalId,
      idempotencyKey,
    });
    assert.ok(result.status < 400, `repeat POST /api/requests failed: ${JSON.stringify(result.body)}`);
    assert.equal(result.body.request.id, request.id, "a repeated idempotencyKey created a second request");

    const all = await call("GET", `/api/requests?caseId=${rohan.id}`);
    expectStatus(all, 200, "GET /api/requests");
    assert.equal(all.body.requests.length, 1, "case should have exactly one request after the repeat");
    tick(`same request id ${request.id}, still one request on the case`);
  });

  const icuBefore = await step("Read H2 ICU availability before accepting", async () => {
    const available = await icuAvailable("H2");
    assert.ok(available >= 1, `H2 should have at least one ICU bed free, got ${available}`);
    tick(`H2 ICU available: ${available}`);
    return available;
  });

  await step("Hospital accepts", async () => {
    const result = await call("PATCH", `/api/requests/${request.id}`, {
      action: "ACCEPT",
      respondedBy: "Smoke test coordinator",
    });
    expectStatus(result, 200, `PATCH /api/requests/${request.id}`);
    assert.equal(result.body.case.status, "ACCEPTED", "case should be ACCEPTED");

    const icu = result.body.reservations.find((r) => r.resourceType === "ICU");
    assert.ok(icu, `no ICU reservation (got: ${result.body.reservations.map((r) => r.resourceType).join(", ")})`);
    const blood = result.body.reservations.find((r) => r.resourceType === "BLOOD_UNITS");
    assert.ok(blood, "no BLOOD_UNITS reservation");
    assert.equal(blood.bloodGroup, "O_NEG", "blood reservation is not for O_NEG");
    tick(`accepted; held ${result.body.reservations.map((r) => r.resourceType).join(", ")}`);
  });

  await step("H2 ICU availability dropped by exactly one", async () => {
    const available = await icuAvailable("H2");
    assert.equal(available, icuBefore - 1, `ICU should be ${icuBefore - 1} after the hold, got ${available}`);
    tick(`H2 ICU available: ${icuBefore} → ${available}`);
  });

  await step("Advance the case to CLOSED, and refuse an out-of-order step", async () => {
    const journey = [
      ["START_JOURNEY", "AMBULANCE_EN_ROUTE"],
      ["ARRIVED", "ARRIVED"],
      ["COMPLETE_HANDOVER", "HANDOVER_COMPLETED"],
      ["CLOSE", "CLOSED"],
    ];
    for (const [action, expected] of journey) {
      const result = await call("POST", `/api/cases/${rohan.id}/status`, { action });
      expectStatus(result, 200, `POST status ${action}`);
      assert.equal(result.body.case.status, expected, `${action} should leave the case ${expected}`);
      tick(`${action} → ${expected}`);
    }

    // A fresh case has not arrived anywhere, so handing it over must be refused, not tolerated.
    const fresh = await createRohanCase();
    const outOfOrder = await call("POST", `/api/cases/${fresh.id}/status`, { action: "COMPLETE_HANDOVER" });
    expectStatus(outOfOrder, 409, "out-of-order COMPLETE_HANDOVER on a fresh case");
    tick(`out-of-order COMPLETE_HANDOVER on ${fresh.id} refused with 409`);
  });

  await step("Timeline records every step of the story", async () => {
    const result = await call("GET", `/api/cases/${rohan.id}`);
    expectStatus(result, 200, `GET /api/cases/${rohan.id}`);
    const seen = new Set(result.body.events.map((e) => e.type));
    const expected = [
      "CASE_CREATED",
      "REQUIREMENTS_EXTRACTED",
      "MATCHING_COMPLETED",
      "HOSPITAL_REQUESTED",
      "HOSPITAL_ACCEPTED",
      "RESOURCES_RESERVED",
      "ARRIVED",
      "HANDOVER_COMPLETED",
      "CASE_CLOSED",
    ];
    const absent = expected.filter((type) => !seen.has(type));
    assert.deepEqual(absent, [], `timeline missing ${absent.join(", ")} (has: ${[...seen].join(", ")})`);
    tick(`all ${expected.length} expected event types present`);
  });

  await step("All-or-nothing: a failed accept reserves absolutely nothing", async () => {
    await reset();
    const second = await createRohanCase();

    const matched = await call("POST", `/api/cases/${second.id}/match`);
    expectStatus(matched, 200, "POST match (second case)");
    assert.equal(matched.body.match.primaryHospitalId, "H2", "second case should also match H2");

    const offered = await call("POST", "/api/requests", { caseId: second.id, hospitalId: "H2" });
    expectStatus(offered, 201, "POST /api/requests (second case)");

    // The last ICU bed goes to a walk-in between the request and the answer.
    const patched = await call("PATCH", "/api/hospitals/H2", {
      resources: { ICU: { available: 0 } },
      updatedBy: "Smoke test coordinator",
    });
    expectStatus(patched, 200, "PATCH /api/hospitals/H2");
    assert.equal(patched.body.hospital.resources.ICU.available, 0, "H2 ICU should now be 0");

    const before = await resourceSnapshot();

    const accept = await call("PATCH", `/api/requests/${offered.body.request.id}`, {
      action: "ACCEPT",
      respondedBy: "Smoke test coordinator",
    });
    expectStatus(accept, 409, "accept with no ICU bed");
    tick(`accept refused with 409: ${accept.body.error}`);

    const after = await resourceSnapshot();
    const moved = Object.keys(before).filter((key) => before[key] !== after[key]);
    assert.deepEqual(
      moved,
      [],
      `the failed accept moved ${moved.map((k) => `${k} ${before[k]}→${after[k]}`).join(", ")}`,
    );
    tick("every hospital resource and blood-bank line unchanged — nothing was held");

    const caseAfter = await call("GET", `/api/cases/${second.id}`);
    expectStatus(caseAfter, 200, "GET case after the failed accept");
    assert.equal(
      caseAfter.body.case.reservations.filter((r) => r.status === "ACTIVE").length,
      0,
      "the failed accept left an active reservation on the case",
    );
    tick("no active reservation left on the case");
  });

  await step("Control-room overview", async () => {
    const result = await call("GET", "/api/overview");
    expectStatus(result, 200, "GET /api/overview");
    assert.ok(Array.isArray(result.body.alerts), "overview.alerts should be an array");
    assert.equal(typeof result.body.counts.active, "number", "overview.counts.active should be a number");
    tick(`${result.body.alerts.length} alerts, ${result.body.counts.active} active cases`);
  });

  await step("Leave the demo presentation-ready", async () => {
    await reset();
    const health = await call("GET", "/api/health");
    expectStatus(health, 200, "GET /api/health after the final reset");
    assert.equal(health.body.hospitals, 6, "final reset did not restore 6 hospitals");
    tick("demo data restored to the scripted starting state");
  });

  console.log(`\nAll ${stepNumber} steps passed.`);
}

main().catch((error) => {
  console.error(`\nSMOKE TEST FAILED — ${error.message}`);
  if (error.cause) console.error(`cause: ${error.cause}`);
  process.exitCode = 1;
});
