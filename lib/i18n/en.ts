/**
 * English strings — the source of truth for every translation key.
 *
 * `mr.ts` and `hi.ts` are `Partial` of these keys: a missing key falls back to the English
 * sentence rather than showing a raw key, because an untranslated word is far better than a
 * broken screen while an ambulance is moving.
 *
 * Key shape: `namespace.name`, and for anything derived from an enum in `lib/types.ts` the leaf
 * is the enum member itself (`status.AMBULANCE_EN_ROUTE`) so a caller can build the key from a
 * value it already holds: `t(\`status.${caseRecord.status}\`)`.
 *
 * Interpolation uses `{name}` placeholders filled from the vars object passed to `t()`.
 */

import type {
  AmbulanceStatus,
  BloodComponent,
  BloodGroup,
  BloodRequestStatus,
  CaseSeverity,
  CaseStatus,
  IncidentType,
  RequestStatus,
  ReservationStatus,
  ResourceType,
} from "@/lib/types";

/**
 * Keys that must exist for every member of an enum. The `satisfies` below turns a forgotten
 * enum member into a compile error instead of a screen that renders `status.CLOSED`.
 */
type EnumKey =
  | `status.${CaseStatus}`
  | `severity.${CaseSeverity}`
  | `incident.${IncidentType}`
  | `resource.${ResourceType}`
  | `bloodGroup.${BloodGroup}`
  | `bloodComponent.${BloodComponent}`
  | `requestStatus.${RequestStatus}`
  | `bloodRequestStatus.${BloodRequestStatus}`
  | `reservationStatus.${ReservationStatus}`
  | `ambulanceStatus.${AmbulanceStatus}`;

export const en = {
  // ---------- App-wide ----------
  "app.name": "JeevanSetu 360",
  "app.tagline": "The right hospital, not merely the nearest one",
  "app.disclaimer":
    "This tool coordinates care between the crew, hospitals and blood banks. It does not diagnose and does not advise treatment.",
  "app.demoBanner":
    "DEMO DATA · All hospitals, patients, ambulances and blood stock are fictional. Coordination aid only — not a diagnostic or treatment tool.",
  "app.demoDataShort": "Demo data",

  // ---------- Navigation and roles ----------
  "nav.language": "Language",
  "nav.home": "Home",
  "nav.cases": "Cases",
  "role.paramedic": "Paramedic",
  "role.hospitalCoordinator": "Hospital coordinator",
  "role.controlRoom": "Control room",
  "role.bloodBank": "Blood bank",
  "role.family": "Family",

  // ---------- Common actions ----------
  "action.save": "Save",
  "action.cancel": "Cancel",
  "action.retry": "Retry",
  "action.confirm": "Confirm",
  "action.close": "Close",
  "action.back": "Back",
  "action.loading": "Loading…",
  "action.search": "Search",
  "action.copy": "Copy",
  "action.refresh": "Refresh",

  // ---------- Case status (mirrors STATUS_LABEL in components/labels.tsx) ----------
  "status.CREATED": "Created",
  "status.REQUIREMENTS_EXTRACTED": "Requirements ready",
  "status.MATCHING": "Choosing hospital",
  "status.HOSPITAL_REQUESTED": "Awaiting hospital",
  "status.ACCEPTED": "Hospital accepted",
  "status.AMBULANCE_EN_ROUTE": "En route",
  "status.ARRIVED": "Arrived",
  "status.HANDOVER_COMPLETED": "Handover done",
  "status.CLOSED": "Closed",
  "status.CANCELLED": "Cancelled",

  // ---------- Severity ----------
  "severity.CRITICAL": "Critical",
  "severity.HIGH": "High",
  "severity.MEDIUM": "Medium",
  "severity.LOW": "Low",

  // ---------- Incident type ----------
  "incident.ROAD_ACCIDENT": "Road accident",
  "incident.CARDIAC": "Cardiac",
  "incident.BURN": "Burn",
  "incident.FALL": "Fall",
  "incident.ASSAULT": "Assault",
  "incident.OTHER": "Other",

  // ---------- Resources (clinical names stay bilingual in mr/hi) ----------
  "resource.ICU": "ICU bed",
  "resource.EMERGENCY_BED": "Emergency bed",
  "resource.NEUROSURGEON": "Neurosurgeon",
  "resource.ORTHOPEDIC_SURGEON": "Orthopaedic surgeon",
  "resource.TRAUMA_TEAM": "Trauma team",
  "resource.CT_SCAN": "CT scan",
  "resource.VENTILATOR": "Ventilator",
  "resource.BLOOD_BANK": "Blood (matched group)",
  "resource.OPERATING_ROOM": "Operating room",

  // ---------- Blood groups (identical in every locale — see mr.ts) ----------
  "bloodGroup.A_POS": "A+",
  "bloodGroup.A_NEG": "A-",
  "bloodGroup.B_POS": "B+",
  "bloodGroup.B_NEG": "B-",
  "bloodGroup.AB_POS": "AB+",
  "bloodGroup.AB_NEG": "AB-",
  "bloodGroup.O_POS": "O+",
  "bloodGroup.O_NEG": "O-",

  // ---------- Blood components ----------
  "bloodComponent.WHOLE_BLOOD": "Whole blood",
  "bloodComponent.PACKED_RED_CELLS": "Packed red cells",
  "bloodComponent.PLASMA": "Plasma",
  "bloodComponent.PLATELETS": "Platelets",

  // ---------- Hospital request status ----------
  "requestStatus.PENDING": "Pending",
  "requestStatus.ACCEPTED": "Accepted",
  "requestStatus.REJECTED": "Rejected",
  "requestStatus.EXPIRED": "Expired",

  // ---------- Blood request status ----------
  "bloodRequestStatus.PENDING": "Pending",
  "bloodRequestStatus.RESERVED": "Reserved",
  "bloodRequestStatus.REJECTED": "Rejected",
  "bloodRequestStatus.FULFILLED": "Fulfilled",
  "bloodRequestStatus.RELEASED": "Released",
  "bloodRequestStatus.EXPIRED": "Expired",

  // ---------- Reservation status (what a hold on a bed or a unit is doing) ----------
  "reservationStatus.ACTIVE": "active",
  "reservationStatus.RELEASED": "released",
  "reservationStatus.EXPIRED": "expired",
  "reservationStatus.CONSUMED": "consumed",

  // ---------- Hospital suitability ----------
  "suitability.SUITABLE": "Suitable",
  "suitability.PARTIAL": "Partly suitable",
  "suitability.UNSUITABLE": "Cannot treat this patient",

  // ---------- Ambulance status ----------
  "ambulanceStatus.AVAILABLE": "Available",
  "ambulanceStatus.ASSIGNED": "Assigned",
  "ambulanceStatus.EN_ROUTE": "En route",
  "ambulanceStatus.AT_HOSPITAL": "At hospital",

  // ---------- Paramedic ----------
  "paramedic.newCase": "New emergency case",
  "paramedic.whatDoYouSee": "What do you see?",
  "paramedic.severity": "Severity",
  "paramedic.location": "Location",
  "paramedic.findHospitals": "Find hospitals",
  "paramedic.sendRequest": "Send request",
  "paramedic.requirements": "Requirements",
  "paramedic.bloodGroup": "Blood group",
  "paramedic.unitsNeeded": "Units needed",

  // ---------- Blood ----------
  "blood.unitsOfGroup": "{count} units of {group}",
  "blood.units": "{count} units",
  "blood.available": "Available",
  "blood.reserved": "Reserved",

  // ---------- Family page (read-only; state facts, never reassure or alarm) ----------
  "family.pageTitle": "Emergency status",
  "family.yourRelative": "Your relative",
  "family.status": "Status",
  "family.hospital": "Hospital",
  "family.arrivingIn": "Arriving in",
  "family.arrivingInMinutes": "Arriving in {minutes} min",
  "family.lastUpdate": "Last update",
  "family.bloodArranged": "Blood arranged",
  "family.bloodBeingArranged": "Blood is being arranged",
  "family.bloodNotRequested": "No blood has been requested for this case",
  "family.noHospitalYet": "A hospital has not been confirmed yet",
  "family.readOnly": "Read-only view",
  "family.note":
    "This page shows only what the response team has confirmed. Times can change as the ambulance moves.",
  "family.linkExpired": "This link has expired. Please ask the hospital staff for a new one.",

  // ---------- Shell ----------
  "shell.subtitle": "Nagpur emergency coordination",
  "shell.footer": "Build-X hackathon prototype · Healthcare & Emergency Services track · Fictional demo data",
  "shell.noRoleSelected": "No role selected",
  "shell.currentRole": "Current role: {role}",
  "shell.offline": "Offline",
  "shell.noActiveEmergencies": "No active emergencies",
  "shell.activeCritical": "{active} active · {critical} critical",

  // ---------- Landing page ----------
  "home.track": "Healthcare & Emergency Services · Nagpur",
  "home.lede":
    "JeevanSetu 360 puts ICU beds, on-call specialists, blood stock, travel time and hospital acceptance on one shared board, so an ambulance never arrives at a hospital that cannot treat the patient.",
  "home.ctaDemo": "Start the Rohan demo",
  "home.ctaControlRoom": "Open control room",
  "home.storyTitle": "Today, without coordination",
  "home.story1": "Truck hits motorcyclist on Wardha Road",
  "home.story2": "Ambulance reaches nearest private hospital: no ICU, no neurosurgeon",
  "home.story3": "Government hospital: low on O-negative",
  "home.story4": "Admitted at a hospital that had a bed all along",
  "home.storyCost":
    "1 h 50 min lost. Bed status, specialists and blood stock lived in phone calls and registers.",
  "home.rolesTitle": "Enter as a demo role",
  "home.noLogin": "Demo access · no login",
  "home.signInPrompt":
    "These four cards open the dashboards straight away. To see role enforcement — a coordinator who cannot touch another hospital's beds — choose a role first.",
  "home.roleDesc.PARAMEDIC": "Create an emergency case and get an explainable hospital recommendation.",
  "home.roleDesc.HOSPITAL_COORDINATOR":
    "Keep ICU, specialist and equipment status current. Accept or reject incoming cases.",
  "home.roleDesc.CONTROL_ROOM_OPERATOR":
    "Watch every active incident, hospital capacity, stale data and blood alerts on one map.",
  "home.roleDesc.BLOOD_BANK_OPERATOR": "Update unit stock by group and see emergency reservations.",

  // ---------- Choosing a demo role ----------
  "demoLogin.link": "Choose a role",
  "demoLogin.linkTitle": "Choose a demo role, or leave the one you are in",

  // ---------- Relative ages ----------
  "duration.justNow": "just now",
  "duration.minutesAgo": "{count} min ago",
  "duration.hoursAgo": "{count} h ago",

  // ---------- Data freshness ----------
  "freshness.unconfirmed": "⚠ unconfirmed",
  /** {time} is an absolute clock time; used until the browser clock is known. */
  "freshness.at": "last confirmed at {time}",
  /** {age} is a relative age such as "8 min ago". */
  "freshness.ago": "last confirmed {age}",
  "freshness.by": "by {name}",

  // ---------- Crew case list ----------
  "caseList.activeNow": "Active now",
  "caseList.openCount": "{count} open",
  "caseList.earlierToday": "Earlier today",
  "caseList.finishedCount": "{count} finished",
  "caseList.nothingOpen": "Nothing open right now.",
  "caseList.noCasesTitle": "No cases yet",
  "caseList.noCasesBody":
    "Nothing is open for this crew. Start the first one and the control room and hospitals see it straight away.",
  "caseList.createFirst": "Create the first case",
  "caseList.loadingCases": "Loading cases",
  "caseList.loadFailed": "Could not load the case list.",
  "caseList.updatesPaused": "Live updates paused — showing the last list that loaded.",
  "caseList.patientId": "Patient id:",
  "caseList.hospital": "Hospital:",
  "caseList.noHospitalYet": "not chosen yet",
  "caseList.openedAt": "opened {time}",
  "caseList.openUnderMinute": "open under a minute",
  "caseList.openMinutes": "open {minutes} min",
  "caseList.openHours": "open {duration}",

  // ---------- Errors ----------
  "error.generic": "Something went wrong",
  "error.network": "Could not reach the server",
  "error.tryAgain": "Try again",
  "error.notFound": "Not found",
} satisfies Record<EnumKey, string> & Record<string, string>;

/** Every key the app can translate. `en` is the source of truth, so a typo is a compile error. */
export type TranslationKey = keyof typeof en;
