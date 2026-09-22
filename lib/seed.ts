/**
 * Fictional Nagpur demo data. Hospital and blood-bank names are invented; areas and
 * coordinates are real neighbourhoods so the map looks right. Nothing here is live data.
 */
import type {
  Ambulance,
  BloodBank,
  BloodGroup,
  EmergencyCase,
  EmergencyEvent,
  Hospital,
  HospitalRequest,
} from "@/lib/types";

export interface SeedData {
  hospitals: Hospital[];
  bloodBanks: BloodBank[];
  ambulances: Ambulance[];
  cases: EmergencyCase[];
  requests: HospitalRequest[];
  events: EmergencyEvent[];
}

const minutesAgo = (now: number, m: number) => new Date(now - m * 60_000).toISOString();

/** The scripted demo patient. The paramedic form has a one-click prefill for this. */
export const ROHAN_SCENARIO = {
  tempPatientId: "TMP-ROHAN-27M",
  age: 27,
  sex: "M" as const,
  incidentType: "ROAD_ACCIDENT" as const,
  severity: "CRITICAL" as const,
  bloodGroup: "O_NEG" as const,
  bloodUnitsNeeded: 2,
  lat: 21.0455,
  lng: 79.014,
  locationLabel: "Wardha Road near Khapri, opposite MIHAN gate",
  notes:
    "Truck vs motorcycle, 27M rider. Head injury, unconscious for about 2 min, now GCS 12. Deformed right thigh, suspected femur fracture. Heavy bleeding from thigh, pressure dressing applied. Pulse 124, BP 90/60.",
};

const emptyInventory = (): Record<BloodGroup, { available: number; reserved: number }> => ({
  A_POS: { available: 0, reserved: 0 },
  A_NEG: { available: 0, reserved: 0 },
  B_POS: { available: 0, reserved: 0 },
  B_NEG: { available: 0, reserved: 0 },
  AB_POS: { available: 0, reserved: 0 },
  AB_NEG: { available: 0, reserved: 0 },
  O_POS: { available: 0, reserved: 0 },
  O_NEG: { available: 0, reserved: 0 },
});

function inventory(units: Partial<Record<BloodGroup, number>>) {
  const inv = emptyInventory();
  for (const [g, n] of Object.entries(units) as [BloodGroup, number][]) inv[g] = { available: n, reserved: 0 };
  return inv;
}

export function buildSeed(now: number = Date.now()): SeedData {
  const hospitals: Hospital[] = [
    {
      id: "H1",
      name: "Khapri Wellness Hospital",
      type: "PRIVATE",
      area: "Khapri",
      address: "Wardha Road, Khapri, Nagpur 441108",
      phone: "0712-2000-101",
      lat: 21.0625,
      lng: 79.029,
      capabilities: ["ICU", "EMERGENCY_BED", "ORTHOPEDIC_SURGEON", "OPERATING_ROOM", "VENTILATOR"],
      resources: {
        ICU: { total: 4, available: 0 },
        EMERGENCY_BED: { total: 6, available: 2 },
        VENTILATOR: { total: 2, available: 0 },
        CT_SCAN: { total: 0, available: 0 },
        OPERATING_ROOM: { total: 1, available: 1 },
      },
      specialists: {
        NEUROSURGEON: { onCall: false, note: "No neurosurgery department" },
        ORTHOPEDIC_SURGEON: { onCall: true, name: "Dr. Pillai" },
        TRAUMA_TEAM: { onCall: false, note: "No dedicated trauma team" },
      },
      lastUpdatedAt: minutesAgo(now, 4),
      updatedBy: "Night duty coordinator",
      sourceType: "SEED",
      confidenceLevel: "HIGH",
    },
    {
      id: "H2",
      name: "Wardha Road Trauma & Neuro Centre",
      type: "PRIVATE",
      area: "Somalwada",
      address: "Wardha Road, Somalwada, Nagpur 440025",
      phone: "0712-2000-202",
      lat: 21.0985,
      lng: 79.064,
      capabilities: [
        "ICU",
        "EMERGENCY_BED",
        "NEUROSURGEON",
        "ORTHOPEDIC_SURGEON",
        "TRAUMA_TEAM",
        "CT_SCAN",
        "VENTILATOR",
        "OPERATING_ROOM",
      ],
      resources: {
        ICU: { total: 8, available: 2 },
        EMERGENCY_BED: { total: 12, available: 5 },
        VENTILATOR: { total: 4, available: 2 },
        CT_SCAN: { total: 1, available: 1 },
        OPERATING_ROOM: { total: 2, available: 1 },
      },
      specialists: {
        NEUROSURGEON: { onCall: true, name: "Dr. Meshram" },
        ORTHOPEDIC_SURGEON: { onCall: true, name: "Dr. Kale" },
        TRAUMA_TEAM: { onCall: true, name: "Trauma team A" },
      },
      lastUpdatedAt: minutesAgo(now, 6),
      updatedBy: "ER coordinator",
      sourceType: "SEED",
      confidenceLevel: "HIGH",
    },
    {
      id: "H3",
      name: "Government Medical Hospital, Sitabuldi",
      type: "GOVERNMENT",
      area: "Sitabuldi",
      address: "Central Avenue, Sitabuldi, Nagpur 440012",
      phone: "0712-2000-303",
      lat: 21.144,
      lng: 79.087,
      capabilities: [
        "ICU",
        "EMERGENCY_BED",
        "NEUROSURGEON",
        "ORTHOPEDIC_SURGEON",
        "TRAUMA_TEAM",
        "CT_SCAN",
        "VENTILATOR",
        "OPERATING_ROOM",
      ],
      resources: {
        ICU: { total: 24, available: 3 },
        EMERGENCY_BED: { total: 40, available: 9 },
        VENTILATOR: { total: 10, available: 1 },
        CT_SCAN: { total: 2, available: 1 },
        OPERATING_ROOM: { total: 4, available: 2 },
      },
      specialists: {
        NEUROSURGEON: { onCall: true, name: "Dr. Bhoyar" },
        ORTHOPEDIC_SURGEON: { onCall: true, name: "Dr. Tiwari" },
        TRAUMA_TEAM: { onCall: true, name: "Casualty team" },
      },
      lastUpdatedAt: minutesAgo(now, 58),
      updatedBy: "Casualty register (phone)",
      sourceType: "SEED",
      confidenceLevel: "MEDIUM",
    },
    {
      id: "H4",
      name: "Dharampeth Heart & Ortho Institute",
      type: "PRIVATE",
      area: "Dharampeth",
      address: "West High Court Road, Dharampeth, Nagpur 440010",
      phone: "0712-2000-404",
      lat: 21.1425,
      lng: 79.0605,
      capabilities: ["ICU", "EMERGENCY_BED", "ORTHOPEDIC_SURGEON", "CT_SCAN", "VENTILATOR", "OPERATING_ROOM"],
      resources: {
        ICU: { total: 6, available: 2 },
        EMERGENCY_BED: { total: 8, available: 3 },
        VENTILATOR: { total: 3, available: 2 },
        CT_SCAN: { total: 1, available: 1 },
        OPERATING_ROOM: { total: 2, available: 2 },
      },
      specialists: {
        NEUROSURGEON: { onCall: false, note: "No neurosurgery department" },
        ORTHOPEDIC_SURGEON: { onCall: true, name: "Dr. Deshpande" },
        TRAUMA_TEAM: { onCall: false, note: "Cardiac team only" },
      },
      lastUpdatedAt: minutesAgo(now, 12),
      updatedBy: "ICU in-charge",
      sourceType: "SEED",
      confidenceLevel: "HIGH",
    },
    {
      id: "H5",
      name: "Kamptee Road Civil Hospital",
      type: "GOVERNMENT",
      area: "Kamptee Road",
      address: "Kamptee Road, near Automotive Square, Nagpur 440026",
      phone: "0712-2000-505",
      lat: 21.176,
      lng: 79.112,
      capabilities: ["ICU", "EMERGENCY_BED", "NEUROSURGEON", "ORTHOPEDIC_SURGEON", "CT_SCAN", "VENTILATOR", "OPERATING_ROOM"],
      resources: {
        ICU: { total: 10, available: 1 },
        EMERGENCY_BED: { total: 20, available: 5 },
        VENTILATOR: { total: 4, available: 1 },
        CT_SCAN: { total: 1, available: 0 },
        OPERATING_ROOM: { total: 2, available: 1 },
      },
      specialists: {
        NEUROSURGEON: { onCall: false, note: "On call from 08:00" },
        ORTHOPEDIC_SURGEON: { onCall: true, name: "Dr. Wankhede" },
        TRAUMA_TEAM: { onCall: false, note: "Day shift only" },
      },
      lastUpdatedAt: minutesAgo(now, 25),
      updatedBy: "Ward clerk",
      sourceType: "SEED",
      confidenceLevel: "MEDIUM",
    },
    {
      id: "H6",
      name: "Hingna MIDC Emergency Hospital",
      type: "PRIVATE",
      area: "Hingna",
      address: "MIDC Road, Hingna, Nagpur 441110",
      phone: "0712-2000-606",
      lat: 21.093,
      lng: 78.972,
      capabilities: ["ICU", "EMERGENCY_BED", "ORTHOPEDIC_SURGEON", "VENTILATOR", "OPERATING_ROOM"],
      resources: {
        ICU: { total: 3, available: 0 },
        EMERGENCY_BED: { total: 5, available: 1 },
        VENTILATOR: { total: 1, available: 0 },
        CT_SCAN: { total: 0, available: 0 },
        OPERATING_ROOM: { total: 1, available: 1 },
      },
      specialists: {
        NEUROSURGEON: { onCall: false, note: "No neurosurgery department" },
        ORTHOPEDIC_SURGEON: { onCall: true, name: "Dr. Raut" },
        TRAUMA_TEAM: { onCall: false },
      },
      lastUpdatedAt: minutesAgo(now, 9),
      updatedBy: "Night duty coordinator",
      sourceType: "SEED",
      confidenceLevel: "HIGH",
    },
  ];

  const bloodBanks: BloodBank[] = [
    {
      id: "BB1",
      name: "Somalwada Regional Blood Centre",
      area: "Somalwada",
      phone: "0712-3000-101",
      lat: 21.101,
      lng: 79.0655,
      inventory: inventory({ O_NEG: 4, O_POS: 18, A_POS: 12, A_NEG: 2, B_POS: 15, B_NEG: 1, AB_POS: 5, AB_NEG: 0 }),
      lastUpdatedAt: minutesAgo(now, 8),
      updatedBy: "Blood bank operator",
      confidenceLevel: "HIGH",
    },
    {
      id: "BB2",
      name: "Central Blood Bank, Sitabuldi",
      area: "Sitabuldi",
      phone: "0712-3000-202",
      lat: 21.1455,
      lng: 79.089,
      inventory: inventory({ O_NEG: 1, O_POS: 30, A_POS: 20, A_NEG: 3, B_POS: 25, B_NEG: 2, AB_POS: 8, AB_NEG: 1 }),
      lastUpdatedAt: minutesAgo(now, 130),
      updatedBy: "Evening register",
      confidenceLevel: "LOW",
    },
    {
      id: "BB3",
      name: "Khapri Blood Storage Unit",
      area: "Khapri",
      phone: "0712-3000-303",
      lat: 21.061,
      lng: 79.03,
      inventory: inventory({ O_NEG: 0, O_POS: 6, A_POS: 4, A_NEG: 0, B_POS: 5, B_NEG: 0, AB_POS: 1, AB_NEG: 0 }),
      lastUpdatedAt: minutesAgo(now, 15),
      updatedBy: "Storage technician",
      confidenceLevel: "HIGH",
    },
  ];

  const ambulances: Ambulance[] = [
    { id: "A1", callSign: "AMB-108-21", crew: "Suresh & Vaishali", lat: 21.047, lng: 79.015, status: "AVAILABLE" },
    { id: "A2", callSign: "AMB-108-07", crew: "Imran & Pooja", lat: 21.145, lng: 79.082, status: "AVAILABLE" },
    {
      id: "A3",
      callSign: "AMB-108-14",
      crew: "Ganesh & Rekha",
      lat: 21.168,
      lng: 79.105,
      status: "EN_ROUTE",
      caseId: "JS-2026-0002",
    },
    { id: "A4", callSign: "AMB-108-33", crew: "Nitin & Sana", lat: 21.094, lng: 78.975, status: "AVAILABLE" },
  ];

  // A closed case from earlier tonight and one active case, so dashboards are not empty.
  const closedCreated = minutesAgo(now, 190);
  const activeCreated = minutesAgo(now, 18);

  const cases: EmergencyCase[] = [
    {
      id: "JS-2026-0001",
      tempPatientId: "TMP-54F-CHEST",
      age: 54,
      sex: "F",
      incidentType: "CARDIAC",
      notes: "Chest pain radiating to left arm, sweating, BP 150/95. Conscious and oriented.",
      severity: "HIGH",
      lat: 21.1398,
      lng: 79.0582,
      locationLabel: "Dharampeth, near Shankar Nagar square",
      requirements: ["ICU", "VENTILATOR"],
      requirementSource: "KEYWORD",
      missingInformation: [],
      status: "CLOSED",
      ambulanceId: "A2",
      hospitalId: "H4",
      reservations: [],
      createdAt: closedCreated,
      updatedAt: minutesAgo(now, 140),
    },
    {
      id: "JS-2026-0002",
      tempPatientId: "TMP-68F-FALL",
      age: 68,
      sex: "F",
      incidentType: "FALL",
      notes: "Fall from stairs, hip pain, unable to stand. Alert, no head injury reported.",
      severity: "MEDIUM",
      lat: 21.1702,
      lng: 79.1084,
      locationLabel: "Kamptee Road, Automotive Square",
      requirements: ["EMERGENCY_BED", "ORTHOPEDIC_SURGEON"],
      requirementSource: "KEYWORD",
      missingInformation: ["blood group"],
      status: "AMBULANCE_EN_ROUTE",
      ambulanceId: "A3",
      hospitalId: "H5",
      backupHospitalId: "H3",
      reservations: [
        {
          id: "RSV-0001",
          caseId: "JS-2026-0002",
          hospitalId: "H5",
          resourceType: "EMERGENCY_BED",
          quantity: 1,
          status: "ACTIVE",
          createdAt: minutesAgo(now, 12),
          expiresAt: new Date(now + 33 * 60_000).toISOString(),
        },
      ],
      createdAt: activeCreated,
      updatedAt: minutesAgo(now, 9),
    },
  ];

  const requests: HospitalRequest[] = [
    {
      id: "REQ-0001",
      caseId: "JS-2026-0002",
      hospitalId: "H5",
      status: "ACCEPTED",
      createdAt: minutesAgo(now, 14),
      expiresAt: minutesAgo(now, 4),
      respondedAt: minutesAgo(now, 12),
      respondedBy: "Ward clerk",
    },
  ];

  let eventSeq = 0;
  const ev = (
    caseId: string | undefined,
    type: EmergencyEvent["type"],
    actorRole: EmergencyEvent["actorRole"],
    message: string,
    at: string,
    extra: Partial<EmergencyEvent> = {},
  ): EmergencyEvent => ({ id: `EVT-SEED-${++eventSeq}`, caseId, type, actorRole, message, at, ...extra });

  const events: EmergencyEvent[] = [
    ev("JS-2026-0001", "CASE_CREATED", "PARAMEDIC", "Case created at Dharampeth (cardiac, HIGH).", closedCreated),
    ev("JS-2026-0001", "HOSPITAL_ACCEPTED", "HOSPITAL_COORDINATOR", "Dharampeth Heart & Ortho Institute accepted.", minutesAgo(now, 184)),
    ev("JS-2026-0001", "ARRIVED", "PARAMEDIC", "Ambulance AMB-108-07 arrived.", minutesAgo(now, 165)),
    ev("JS-2026-0001", "HANDOVER_COMPLETED", "HOSPITAL_COORDINATOR", "Digital handover confirmed by ICU in-charge.", minutesAgo(now, 160)),
    ev("JS-2026-0001", "CASE_CLOSED", "SYSTEM", "Case closed.", minutesAgo(now, 140)),
    ev("JS-2026-0002", "CASE_CREATED", "PARAMEDIC", "Case created at Kamptee Road (fall, MEDIUM).", activeCreated),
    ev("JS-2026-0002", "REQUIREMENTS_EXTRACTED", "SYSTEM", "Requirements: Emergency bed, Orthopaedic surgeon.", minutesAgo(now, 17)),
    ev("JS-2026-0002", "HOSPITAL_REQUESTED", "PARAMEDIC", "Request sent to Kamptee Road Civil Hospital.", minutesAgo(now, 14)),
    ev("JS-2026-0002", "HOSPITAL_ACCEPTED", "HOSPITAL_COORDINATOR", "Kamptee Road Civil Hospital accepted.", minutesAgo(now, 12)),
    ev("JS-2026-0002", "RESOURCES_RESERVED", "SYSTEM", "Reserved 1 emergency bed (expires in 45 min).", minutesAgo(now, 12)),
    ev("JS-2026-0002", "AMBULANCE_EN_ROUTE", "PARAMEDIC", "AMB-108-14 en route, ETA 9 min.", minutesAgo(now, 9)),
    ev(undefined, "RESOURCE_UPDATED", "HOSPITAL_COORDINATOR", "Khapri Wellness Hospital: ICU 0 of 4 free.", minutesAgo(now, 4), { hospitalId: "H1" }),
  ];

  return { hospitals, bloodBanks, ambulances, cases, requests, events };
}
