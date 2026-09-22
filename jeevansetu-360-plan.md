# JeevanSetu 360

## Phase-Wise Implementation Plan and Claude Prompts

**Hackathon track:** Healthcare \& Emergency Services  
**Product:** Real-time emergency coordination platform for Nagpur  
**Primary demo:** Road-accident patient matching, hospital acceptance, resource reservation, blood coordination, ambulance tracking, and digital handover.

\---

## 1\. Product Definition

### One-line pitch

> JeevanSetu 360 helps ambulances find the right hospital—not merely the nearest one—by coordinating ICU beds, specialists, blood, travel time, hospital acceptance, family updates, and emergency handover in one system.

### Core problem

Emergency information is fragmented across phone calls, registers, WhatsApp groups, ambulance teams, hospitals, and blood banks. This can cause an ambulance to reach a hospital that cannot provide the required ICU bed, specialist, blood, or equipment.

### Main users

* **Paramedic:** Creates and updates an emergency case.
* **Hospital coordinator:** Updates resources and accepts or rejects incoming cases.
* **Blood-bank operator:** Updates blood inventory and responds to verified requests.
* **Control-room operator:** Monitors all active incidents and coordinates fallback actions.
* **Family member:** Receives limited, secure updates through a family link.
* **Admin:** Manages hospitals, users, capabilities, and demo data.

### Safety boundary

The system is a coordination and decision-support tool. It must not diagnose patients, prescribe treatment, or autonomously make clinical decisions. Recommendations must be explainable and require human confirmation.

\---

## 2\. Hackathon MVP Scope

### Must build

1. Role-based login or demo role selection.
2. Paramedic emergency-case creation.
3. AI extraction of emergency requirements from free text.
4. Hospital suitability ranking using capabilities, resources, distance, and freshness.
5. Explainable hospital recommendation.
6. Hospital accept/reject workflow.
7. Temporary ICU/blood/resource reservation.
8. Ambulance status and destination view.
9. Control-room dashboard.
10. Blood requirement and availability view.
11. Family secure-status view.
12. Digital handover timeline.

### Should build

* Marathi, Hindi, and English input.
* Voice-to-text demo.
* Backup hospital recommendation.
* Stale-data warnings.
* Real-time status updates.
* Offline/mock network mode.

### Do not build for the hackathon

* Real patient records.
* Real hospital integration.
* Medical diagnosis.
* Automatic treatment recommendations.
* Real payment systems.
* Production blood reservation.
* Full native mobile applications.
* Complex microservices.

\---

## 3\. Recommended Stack

|Layer|Technology|
|-|-|
|Frontend|Next.js, TypeScript, React|
|Styling|Tailwind CSS, shadcn/ui|
|Backend|Next.js route handlers or server actions|
|Database|Supabase PostgreSQL|
|ORM|Prisma|
|Authentication|Supabase Auth or demo role switching|
|Realtime|Supabase Realtime or polling fallback|
|Maps|Mapbox or a mock Nagpur map for demo|
|AI|Claude/OpenAI/Gemini API through a server-side adapter|
|Storage|Supabase Storage|
|Charts|Recharts|
|Deployment|Vercel|
|Validation|Zod|
|Testing|Vitest and Playwright, if time allows|

Use a modular monolith. Keep business logic in services instead of building separate microservices.

Suggested service modules:

```text
EmergencyService
RequirementExtractionService
HospitalMatchingService
ResourceReservationService
BloodBankService
NotificationService
HandoverService
```

\---

## 4\. Repository Structure

```text
jeevansetu-360/
├── app/
│   ├── (auth)/
│   ├── paramedic/
│   ├── hospital/
│   ├── control-room/
│   ├── blood-bank/
│   ├── family/\[token]/
│   └── api/
├── components/
│   ├── ui/
│   ├── emergency/
│   ├── hospital/
│   ├── dashboard/
│   └── maps/
├── lib/
│   ├── db.ts
│   ├── auth.ts
│   ├── validation.ts
│   ├── matching/
│   ├── services/
│   └── ai/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── types/
├── tests/
├── public/
└── README.md
```

\---

## 5\. Data Model

Implement these core entities:

```text
User
Organization
Hospital
HospitalCapability
HospitalResource
SpecialistAvailability
BloodBank
BloodInventory
Ambulance
EmergencyCase
HospitalRecommendation
HospitalRequest
ResourceReservation
FamilyAccessToken
EmergencyEvent
HandoverRecord
Notification
```

### Important enums

```text
UserRole:
PARAMEDIC, HOSPITAL\_COORDINATOR, BLOOD\_BANK\_OPERATOR,
CONTROL\_ROOM\_OPERATOR, FAMILY\_MEMBER, ADMIN

CaseSeverity:
CRITICAL, HIGH, MEDIUM, LOW

CaseStatus:
CREATED, REQUIREMENTS\_EXTRACTED, MATCHING,
HOSPITAL\_REQUESTED, ACCEPTED, AMBULANCE\_EN\_ROUTE,
ARRIVED, HANDOVER\_COMPLETED, CLOSED, CANCELLED

RequestStatus:
PENDING, ACCEPTED, REJECTED, EXPIRED

ReservationStatus:
ACTIVE, RELEASED, EXPIRED, CONSUMED
```

### Data freshness

Every hospital resource, specialist record, and blood inventory record must include:

```text
lastUpdatedAt
updatedBy
sourceType
confidenceLevel
```

Use `HIGH`, `MEDIUM`, and `LOW` confidence. A record that is too old must be labelled stale and should reduce the hospital score.

\---

# 6\. Phase-Wise Plan

## Phase 0 — Scope, UX, and Demo Contract

### Goal

Freeze the smallest end-to-end demo before writing code.

### Deliverables

* Product name and one-line pitch.
* User roles.
* User journeys.
* Page list.
* Demo scenario for Rohan.
* Definition of done.
* Safety disclaimer.

### Pages

```text
/landing
/demo-login
/paramedic
/paramedic/cases/new
/paramedic/cases/\[id]
/hospital
/hospital/requests/\[id]
/control-room
/blood-bank
/family/\[token]
```

### Claude prompt

```text
You are a senior product designer and hackathon mentor. We are building JeevanSetu 360, a healthcare emergency coordination platform for Nagpur.

The product coordinates paramedics, hospitals, blood banks, control-room operators, and families. It helps find the most suitable hospital using ICU availability, specialist availability, blood stock, capability, travel time, and data freshness. It does not diagnose patients or prescribe treatment.

Create:
1. A focused hackathon MVP scope.
2. User journeys for paramedic, hospital coordinator, control room, blood bank, and family.
3. A page-by-page UX plan.
4. A demo story using a fictional road-accident patient named Rohan.
5. Acceptance criteria for the end-to-end demo.
6. Safety, privacy, and fake-data disclaimers.

Do not add unnecessary features. Optimize for a working demo that can be completed quickly. Return the result as Markdown.
```

### Acceptance criteria

The complete demo can be explained in under five minutes and has one clear success path.

\---

## Phase 1 — Project Foundation

### Goal

Create a clean, runnable application with the chosen stack.

### Tasks

* Initialize Next.js with TypeScript.
* Add Tailwind and shadcn/ui.
* Add Prisma and database connection.
* Add environment variable validation.
* Add layout, navigation, loading, error, and not-found states.
* Add a basic design system.
* Add a health-check route.

### Claude prompt

```text
Act as a senior full-stack TypeScript engineer. Create the foundation for a Next.js App Router project called JeevanSetu 360.

Use:
- TypeScript strict mode
- Tailwind CSS
- shadcn/ui-style accessible components
- Prisma ORM
- PostgreSQL-compatible database
- Zod validation
- Server-side environment variables

Requirements:
1. Create a maintainable folder structure for app routes, components, lib, services, types, prisma, and tests.
2. Add a responsive application shell with a top bar, sidebar, role badge, and emergency status indicator.
3. Add loading, error, empty, and not-found states.
4. Add /api/health.
5. Add .env.example without exposing secrets.
6. Add basic lint and typecheck scripts.
7. Do not implement business logic yet.

Explain all files created and provide exact commands to run the project.
```

### Acceptance criteria

* Project runs locally.
* TypeScript and lint pass.
* `/api/health` responds successfully.
* No secrets are committed.

\---

## Phase 2 — Database Schema and Seed Data

### Goal

Create the data model and realistic fictional Nagpur demo data.

### Tasks

* Implement Prisma schema.
* Add enums and relations.
* Add indexes for case status, location, resource type, and timestamps.
* Add seed data for hospitals, specialists, resources, blood banks, ambulances, and users.
* Use fictional or clearly marked demo organizations.

### Required demo data

Create at least:

* 5 hospitals.
* 3 blood banks.
* 4 ambulances.
* 8 specialist records.
* ICU, CT scan, trauma-team, and blood inventory records.
* Rohan’s emergency scenario as an optional seeded case.

### Claude prompt

```text
Act as a senior PostgreSQL and Prisma architect. Design and implement the Prisma schema for JeevanSetu 360.

The system coordinates emergency cases, hospitals, hospital capabilities, ICU and equipment resources, specialists, blood banks, ambulances, hospital requests, resource reservations, family access tokens, notifications, emergency events, and digital handover records.

Requirements:
1. Use normalized relational tables.
2. Add appropriate enums and foreign keys.
3. Add createdAt and updatedAt fields where useful.
4. Add lastUpdatedAt, confidenceLevel, and updatedBy for resource availability.
5. Add indexes for active cases, hospital requests, resource lookup, blood groups, and timestamps.
6. Store latitude and longitude as decimal fields for the MVP.
7. Add a seed script with fictional Nagpur demo data.
8. Do not use real patient information or claim that seeded data is live.
9. Include safe handling for temporary patient IDs.
10. Return schema.prisma, seed.ts, migration commands, and a short explanation of relationships.

Use names and data that are clearly labelled as hackathon demonstration data.
```

### Acceptance criteria

* Database migration succeeds.
* Seed script succeeds.
* A seeded case can be queried with its hospital and resource relations.
* No real medical data is used.

\---

## Phase 3 — Role-Based Demo Access

### Goal

Allow judges to enter different dashboards quickly.

### Tasks

* Implement Supabase Auth if available.
* Otherwise implement clearly labelled demo role switching.
* Enforce role checks on server-side actions.
* Create demo accounts or a safe demo selector.
* Display current role and organization.

### Claude prompt

```text
Implement role-based access for JeevanSetu 360.

Roles:
PARAMEDIC, HOSPITAL\_COORDINATOR, BLOOD\_BANK\_OPERATOR, CONTROL\_ROOM\_OPERATOR, ADMIN, FAMILY\_MEMBER.

Requirements:
1. Prefer google  Auth with server-side session handling.
2. If turso credentials are unavailable, provide a temporary demo-mode role selector clearly labelled DEMO ONLY.
3. Never trust only client-side role values for protected actions.
4. Add reusable server-side requireRole helpers.
5. Restrict hospital coordinators to their hospital and blood-bank operators to their blood bank.
6. Add a demo login page with one-click role entry.
7. Add audit events for role-based actions.
8. Do not implement a real family account; use a secure-looking demo access token route.

Provide code, environment variables, and a manual test checklist.
```

### Acceptance criteria

* Each role reaches the correct dashboard.
* Unauthorized users cannot perform protected actions.
* Demo access is clearly separated from production authentication.

\---

## Phase 4 — Emergency Case Creation

### Goal

Give paramedics a fast, simple interface to create an emergency case.

### Form fields

* Temporary patient ID.
* Age.
* Incident type.
* Free-text condition summary.
* Blood group, optional.
* Current location.
* Vital information, optional.
* Severity selected by paramedic.
* Photo attachment, optional.

### UX requirements

* Large controls.
* Minimal typing.
* Works on a mobile-sized screen.
* Clear required fields.
* Draft saving.
* No unnecessary patient data.

### Claude prompt

```text
Build the paramedic emergency-case creation flow for JeevanSetu 360.

Create:
- /paramedic dashboard
- /paramedic/cases/new
- /paramedic/cases/\[id]

Fields:
- Temporary patient ID
- Age
- Incident type
- Free-text condition summary
- Blood group optional
- Current latitude and longitude or demo location selector
- Optional vitals
- Severity
- Optional image upload

Requirements:
1. Use React Hook Form or an equivalent controlled approach with Zod validation.
2. Make the mobile layout fast and accessible.
3. Clearly state that the tool supports coordination and is not a diagnostic system.
4. Save the case and write an EmergencyEvent named CASE\_CREATED.
5. Use a server action or API route; never write directly from the client to the database.
6. Show a confirmation screen with the generated emergency ID.
7. Add loading, validation, retry, and error states.
8. Use mock location selection if maps are not configured.

Return implementation files and a manual test checklist.
```

### Acceptance criteria

* A paramedic can create a case in less than one minute.
* The case receives a unique temporary ID.
* A timeline event is created.

\---

## Phase 5 — AI Requirement Extraction

### Goal

Convert free-text paramedic notes into structured coordination requirements.

### Example output

```json
{
  "priority": "CRITICAL",
  "requiredResources": \["ICU", "NEUROSURGEON", "TRAUMA\_TEAM", "BLOOD\_BANK", "CT\_SCAN"],
  "bloodGroup": "O\_NEGATIVE",
  "summary": "Road accident patient with suspected head injury and heavy bleeding",
  "missingInformation": \["vital signs", "blood group confirmation"]
}
```

### Safety rules

* AI output is untrusted input.
* Validate it with Zod.
* Never allow AI to prescribe treatment.
* Show extracted requirements for human review.
* Provide a manual edit option.
* Include a deterministic fallback for API failure.

### Claude prompt

```text
Implement an AI requirement-extraction service for JeevanSetu 360.

Input: free-text notes entered by a paramedic in English, Hindi, or Marathi.
Output must be strict JSON validated with Zod:
- priority: CRITICAL | HIGH | MEDIUM | LOW
- requiredResources: controlled enum array
- bloodGroup: optional controlled enum
- incidentSummary: short neutral summary
- missingInformation: array of strings
- confidence: HIGH | MEDIUM | LOW

Allowed resources:
ICU, EMERGENCY\_BED, NEUROSURGEON, ORTHOPEDIC\_SURGEON, TRAUMA\_TEAM, CT\_SCAN, VENTILATOR, BLOOD\_BANK, OPERATING\_ROOM.

Important safety constraints:
1. Do not diagnose or recommend treatment.
2. Do not invent vital signs.
3. Treat AI output as untrusted and validate it.
4. Add a human-review screen where a paramedic can edit requirements.
5. Add a deterministic keyword-based fallback when the AI API is unavailable.
6. Keep the AI provider behind an adapter interface.
7. Store only the extracted coordination fields, not unnecessary sensitive text.
8. Log model errors without storing secrets.

Implement the provider interface, prompt, Zod schema, API/service function, fallback parser, and tests for accident, cardiac, and unknown-input examples.
```

### Acceptance criteria

* English accident text produces the expected resource list.
* Invalid AI output is rejected safely.
* The paramedic can edit requirements before matching begins.
* The app still works when the AI API is unavailable.

\---

## Phase 6 — Hospital Matching Engine

### Goal

Recommend the most suitable hospital using transparent rules.

### Suggested scoring

```text
Capability match: 35%
Confirmed resource availability: 25%
Specialist availability: 15%
Estimated travel time: 15%
Data freshness and confidence: 10%
```

Do not use a score if a critical capability is missing. Mark the hospital as unsuitable or partially suitable.

### Required output

For each hospital, show:

* Score.
* Suitability status.
* Estimated travel time.
* Matched requirements.
* Missing requirements.
* Data freshness.
* Explanation.
* Backup rank.

### Claude prompt

```text
Implement an explainable hospital-matching service for JeevanSetu 360.

Inputs:
- Emergency case location
- Required resources
- Severity
- Blood group and units, if known
- Active hospital capabilities
- Hospital resource availability
- Specialist availability
- Last-updated timestamps

Use this initial scoring model:
- Capability match: 35%
- Confirmed resource availability: 25%
- Specialist availability: 15%
- Estimated travel time: 15%
- Data freshness and confidence: 10%

Rules:
1. A hospital missing a critical requirement must not be ranked as fully suitable.
2. Stale data must reduce confidence and be displayed.
3. Return primary and backup hospitals.
4. Return matched requirements, missing requirements, score breakdown, and a plain-language explanation.
5. Never claim that availability is live unless it comes from a current database update.
6. Use a deterministic distance/time approximation for the hackathon, with a replaceable maps adapter.
7. Add unit tests for closest-but-unsuitable, farther-but-suitable, stale-data, and no-match cases.

Implement the service in a testable way and provide sample output for Rohan's case.
```

### Acceptance criteria

* The closest hospital can be rejected if it lacks a critical resource.
* A suitable hospital receives an explainable recommendation.
* A backup hospital is always shown when one exists.

\---

## Phase 7 — Hospital Acceptance and Resource Reservation

### Goal

Prevent “arrive and discover unavailable” failures.

### Workflow

```text
Create case
→ Generate recommendations
→ Send request to hospital
→ Hospital accepts/rejects
→ Reserve resources
→ Confirm destination
→ Notify ambulance and family
```

### Reservation rules

* Reservation has an expiry time.
* Reservation uses a database transaction.
* Duplicate reservations must be prevented.
* Rejection releases no resources that were not reserved.
* Cancellation releases active reservations.
* Every transition creates an event.

### Claude prompt

```text
Implement hospital request, acceptance, rejection, and temporary resource reservation for JeevanSetu 360.

Workflow:
1. Paramedic selects a recommended hospital.
2. System creates a hospital request with an expiry time.
3. Hospital coordinator views case requirements.
4. Coordinator accepts or rejects with an optional reason.
5. On acceptance, reserve ICU, blood units, and other required resources atomically.
6. If a reservation cannot be completed, do not partially confirm acceptance; return a clear failure.
7. Reservations expire automatically and can be released or consumed.
8. Add an idempotency key to prevent duplicate reservation requests.
9. Write EmergencyEvent records for every state transition.
10. Notify paramedic, control room, and family view after acceptance.

Use database transactions and server-side authorization. Add tests for acceptance, rejection, insufficient resources, duplicate requests, expiry, cancellation, and rollback.

This is a hackathon simulation using fictional data. Add a visible demo-data label in the UI.
```

### Acceptance criteria

* Hospital acceptance reserves resources atomically.
* Insufficient resources produce a safe failure.
* Reservations expire or can be released.
* The event timeline is complete.

\---

## Phase 8 — Ambulance and Control-Room Dashboards

### Goal

Create the main visual demo experience.

### Ambulance dashboard

Display:

* Case priority.
* Patient temporary ID.
* Confirmed hospital.
* ETA.
* Backup hospital.
* Resource reservation status.
* Route status.
* One-tap status updates.

### Control-room dashboard

Display:

* Active incidents.
* Case status counts.
* Map or simulated map.
* Hospital availability.
* Blood alerts.
* Stale-data alerts.
* Timeline of recent events.

### Claude prompt

```text
Build the ambulance and control-room dashboards for JeevanSetu 360.

Ambulance view:
- Active emergency case
- Priority and emergency ID
- Confirmed hospital and backup hospital
- Estimated travel time
- Reserved ICU, blood, specialist, and equipment status
- Start journey, arrived, and handover-complete actions
- Mobile-first layout with large controls

Control-room view:
- Active incident count
- Cases by status and severity
- Hospital request status
- Stale resource data alerts
- Blood shortage alerts
- Ambulance and hospital map or realistic mock map
- Event timeline
- Filters by severity, status, and location

Requirements:
1. Use realistic loading, empty, error, and offline states.
2. Use clear color semantics but do not rely on color alone.
3. Add accessible labels and keyboard navigation.
4. Use real database data through server-side APIs.
5. Use realtime subscriptions if configured, otherwise implement polling with a clear last-synced timestamp.
6. Include a DEMO DATA banner.
7. Do not expose unnecessary patient details on the control-room overview.
```

### Acceptance criteria

* A hospital acceptance is visible in the control room.
* Ambulance status updates appear in the case timeline.
* The dashboard works on a laptop and mobile-sized screen.

\---

## Phase 9 — Blood-Bank Coordination

### Goal

Replace unstructured donor searching with verified emergency requests.

### Features

* Blood-group inventory.
* Component type.
* Available and reserved units.
* Last verified time.
* Blood-bank operator update flow.
* Hospital-linked blood request.
* Reservation and release.
* Family view with verified status.

### Claude prompt

```text
Implement the blood-bank coordination module for JeevanSetu 360.

Features:
1. Blood-bank operator dashboard.
2. Inventory by blood group and component.
3. Available, reserved, and expired units.
4. Last verified timestamp and confidence status.
5. Hospital-linked emergency blood request.
6. Operator accept, reject, reserve, release, and fulfil actions.
7. Family view showing only the verified request status.
8. Notifications to the hospital and control room.

Safety and privacy:
- Mark all data as fictional hackathon data.
- Never imply that the platform guarantees blood availability.
- Display last verified time.
- Do not expose donor personal information publicly.
- Use server-side authorization and transactions.

Add tests for insufficient stock, reservation expiry, release, and successful fulfilment.
```

### Acceptance criteria

* The demo can show O-negative blood being requested and reserved.
* Stale or unconfirmed inventory is visibly labelled.
* Donor personal data is not exposed.

\---

## Phase 10 — Multilingual, Family, and Offline Experience

### Goal

Make the platform useful for citizens and resilient in poor connectivity.

### Features

* Marathi, Hindi, and English labels.
* Localized emergency summaries.
* Secure family access token.
* Family status page.
* Offline draft for paramedic case creation.
* Last-synced timestamp.
* Retry queue for updates.

### Claude prompt

```text
Add multilingual and low-connectivity support to JeevanSetu 360.

Languages:
- English
- Marathi
- Hindi

Requirements:
1. Keep UI translations in structured locale files.
2. Add a language switcher.
3. Translate labels, status values, errors, and emergency summaries.
4. Do not translate medical or resource names in a way that changes meaning; provide bilingual labels when appropriate.
5. Create a secure-looking, expiring family access-token route with limited read-only fields.
6. Add a family page showing case status, confirmed hospital, ETA, blood request status, and last update.
7. Add an offline draft mode for emergency creation using browser storage.
8. Queue unsent updates and display sync status.
9. Never store secrets or unnecessary medical information in browser storage.
10. Include tests for locale switching, expired token, and offline/online retry.

This is a hackathon prototype; clearly label simulated notifications and demo data.
```

### Acceptance criteria

* A complaint/case can be viewed in Marathi or Hindi.
* Family access is read-only and limited.
* Offline draft data syncs or shows a clear failure state.

\---

## Phase 11 — Digital Handover and Audit Timeline

### Goal

Create a reliable end-to-end record from incident creation to hospital handover.

### Handover fields

* Emergency ID.
* Incident summary.
* Arrival time.
* Required resources.
* Resources reserved.
* Paramedic notes.
* Treatment already provided, only if entered by a professional.
* Receiving coordinator.
* Handover confirmation.

### Claude prompt

```text
Implement digital hospital handover and the emergency event timeline.

Requirements:
1. Display a chronological timeline from case creation to handover.
2. Add a structured handover form for the paramedic.
3. Add receiving-hospital confirmation.
4. Record timestamps and actor role for every action.
5. Make audit events append-only from the application layer.
6. Prevent family users from viewing internal staff notes.
7. Show missing handover fields without blocking emergency completion unnecessarily.
8. Add a printable or shareable summary using the temporary patient ID only.
9. Add tests for unauthorized access, duplicate handover, and completed handover.
```

### Acceptance criteria

* The demo ends with a confirmed digital handover.
* Judges can inspect the timeline and see all major actions.
* Family users cannot see internal notes.

\---

## Phase 12 — Security, Privacy, and Reliability Review

### Goal

Make the prototype responsible and defensible.

### Checklist

* Validate all input with Zod.
* Use server-side authorization.
* Do not expose service-role keys to the browser.
* Do not log sensitive data unnecessarily.
* Use temporary patient IDs.
* Add audit events.
* Add rate limits to public endpoints if deployed.
* Handle AI failure.
* Handle stale data.
* Handle duplicate submissions.
* Handle reservation conflicts.
* Add visible demo-data and medical-safety disclaimers.

### Claude prompt

```text
Perform a security, privacy, safety, and reliability review of the JeevanSetu 360 codebase.

Review:
- Authentication and authorization
- Server-side role checks
- Database access
- Environment variables
- Input validation
- AI output validation
- Patient-data minimization
- Logs and error messages
- Family access tokens
- Resource reservation race conditions
- Duplicate requests and idempotency
- Stale availability data
- Offline sync conflicts
- Rate limiting and abuse risks

Return:
1. Critical issues.
2. High-priority issues.
3. Quick fixes for the hackathon.
4. Production improvements that are out of scope.
5. Exact code patches where possible.

Do not recommend collecting real patient data. Keep the system as a coordination prototype, not a diagnostic tool.
```

### Acceptance criteria

* No obvious authorization bypass exists.
* AI failure does not break emergency flow.
* Fake/demo data is clearly identified.
* The team can explain safety limitations to judges.

\---

## Phase 13 — Testing and Demo Reliability

### Goal

Ensure the demo never fails because of an external API or unpredictable data.

### Tests

#### Unit tests

* Requirement extraction.
* Hospital scoring.
* Distance estimate.
* Data freshness.
* Reservation rules.
* Blood inventory rules.
* Permission checks.

#### Integration tests

* Create case → extract requirements → match hospitals.
* Hospital accepts → reserve resources.
* Hospital rejects → select fallback.
* Blood request → reserve units.
* Handover completion → close case.

#### Manual test

* Start with empty database.
* Run seed script.
* Log in as paramedic.
* Create Rohan’s case.
* Trigger AI extraction or fallback.
* Choose Hospital B.
* Accept as Hospital B coordinator.
* Verify reservations.
* Open control room.
* Open family view.
* Complete handover.

### Claude prompt

```text
Create a complete test plan and implement the highest-value automated tests for JeevanSetu 360.

Prioritize:
1. Hospital matching correctness.
2. Critical-resource rejection.
3. Resource reservation transactions.
4. Blood inventory reservations.
5. Role-based authorization.
6. Emergency state transitions.
7. AI fallback behavior.
8. Family access restrictions.

Use the project's existing testing tools. Mock external AI, maps, notifications, and realtime services. Do not make tests depend on external APIs or live hospital data.

Also create a deterministic demo reset command that restores the Rohan scenario before each presentation.
```

### Acceptance criteria

* The primary demo works repeatedly from a clean reset.
* External AI or map failures do not stop the presentation.
* Automated tests cover the matching and reservation logic.

\---

## Phase 14 — Deployment and Demo Mode

### Goal

Deploy a stable, safe, judge-friendly demo.

### Tasks

* Deploy frontend to Vercel.
* Configure database environment variables.
* Run migrations safely.
* Seed demo data.
* Configure AI key only on the server.
* Add a demo reset route protected by an admin secret.
* Add a status page or health check.
* Verify mobile responsiveness.
* Prepare a backup local version.

### Claude prompt

```text
Prepare JeevanSetu 360 for a hackathon deployment.

Requirements:
1. Provide a Vercel deployment checklist.
2. Provide Supabase/PostgreSQL environment variable configuration.
3. Ensure secrets are server-only.
4. Add database migration and seed commands.
5. Add a protected demo reset command for the Rohan scenario.
6. Add /api/health with database connectivity status, without exposing secrets.
7. Add a visible DEMO DATA banner.
8. Add an external-service fallback mode for AI, maps, notifications, and realtime.
9. Create a short README with local setup, deployment, demo accounts, architecture, safety limitations, and troubleshooting.
10. Do not expose real patient data or claim production readiness.
```

### Acceptance criteria

* Hosted demo opens reliably.
* Seed/reset workflow takes less than two minutes.
* A local fallback exists if internet or API access fails.

\---

# 7\. Recommended Build Order by Time

## If you have 24 hours

Build:

1. Foundation.
2. Database and seed data.
3. Emergency case form.
4. Rule-based requirement extraction with optional AI.
5. Hospital matching.
6. Hospital acceptance.
7. Control-room dashboard.
8. Five-minute demo and pitch.

Skip real authentication, offline mode, advanced maps, and full family features.

## If you have 36–48 hours

Add:

1. Resource reservations.
2. Blood-bank workflow.
3. Ambulance dashboard.
4. Family status page.
5. Realtime updates.
6. Digital handover.
7. Marathi/Hindi interface.
8. Automated tests for matching and reservations.

## If you have more than 48 hours

Add:

1. Voice input.
2. Offline sync.
3. Better map routing.
4. Data-quality and freshness analytics.
5. Notification adapters.
6. Admin configuration.
7. More detailed disaster or multi-casualty mode.

\---

# 8\. Five-Minute Presentation Script

## Slide 1 — Problem

> In an emergency, the nearest hospital is not always the right hospital. Ambulances can lose time reaching a hospital without an ICU bed, specialist, blood, or trauma support.

## Slide 2 — Solution

> JeevanSetu 360 connects the paramedic, ambulance, hospital, blood bank, control room, and family through one emergency coordination workflow.

## Slide 3 — Live demo

Create Rohan's accident case and show the AI-extracted requirements.

## Slide 4 — Recommendation

Show that the nearest hospital is unsuitable and explain why another hospital is recommended.

## Slide 5 — Acceptance and reservation

Show Hospital B accepting the case and reserving ICU, neurosurgeon, trauma team, and O-negative blood.

## Slide 6 — Coordination

Show ambulance, control room, family view, blood status, and event timeline.

## Slide 7 — Impact

> JeevanSetu 360 reduces coordination delay, prevents avoidable rerouting, exposes stale information, and ensures the receiving hospital is prepared before arrival.

## Slide 8 — Safety and future

> This is a coordination and decision-support prototype. It does not diagnose patients. Future deployment would require hospital, ambulance, blood-bank, security, privacy, and medical validation.

\---

# 9\. Definition of Done

The hackathon MVP is complete when:

* A paramedic can create an emergency case.
* Requirements can be extracted and manually corrected.
* At least three hospitals are ranked.
* The closest-but-unsuitable hospital is rejected with an explanation.
* A suitable hospital can accept the case.
* ICU and blood resources can be temporarily reserved.
* An ambulance receives the confirmed destination.
* The control room sees status changes.
* A family member sees limited updates.
* A digital handover can be completed.
* The event timeline shows the entire process.
* The demo works with fictional seeded data.
* The team can explain limitations and safety boundaries.

\---

# 10\. Master Prompt for Claude Code

```text
You are the lead engineer for a hackathon project called JeevanSetu 360.

Build a production-structured but hackathon-sized Next.js application for healthcare emergency coordination in Nagpur. The system connects paramedics, ambulances, hospitals, blood banks, control-room operators, and families.

Core workflow:
1. A paramedic creates an emergency case using a temporary patient ID.
2. Free-text notes are converted into structured coordination requirements by an AI adapter and validated with Zod.
3. The paramedic reviews and edits the requirements.
4. The system ranks hospitals using capability match, resource availability, specialist availability, travel time, and data freshness.
5. The system provides an explainable primary and backup recommendation.
6. A hospital coordinator accepts or rejects the request.
7. On acceptance, required resources are reserved atomically with expiry times.
8. The ambulance receives the confirmed destination and status controls.
9. A verified blood request can be created and reserved.
10. The control room sees active cases and event timelines.
11. A family member sees limited read-only updates through an expiring token.
12. The hospital confirms the digital handover.

Technology:
- Next.js App Router
- TypeScript strict mode
- Tailwind CSS and accessible UI components
- Prisma ORM
- Supabase PostgreSQL
- Supabase Auth when configured
- Supabase Realtime when configured, with polling fallback
- Zod validation
- Map provider adapter with mock fallback
- AI provider adapter with deterministic fallback

Architecture rules:
1. Use a modular monolith.
2. Keep business logic in testable service modules.
3. Use server-side authorization for all protected actions.
4. Do not expose secrets in the browser.
5. Use database transactions for reservations and state transitions.
6. Add idempotency to important mutation endpoints.
7. Validate all AI output.
8. Store minimum necessary patient information.
9. Use fictional seeded data only.
10. Add DEMO DATA and medical-safety disclaimers.
11. Do not diagnose, prescribe treatment, or claim clinical validation.
12. Use loading, error, empty, stale-data, offline, and retry states.

Development process:
- Work phase by phase.
- Before changing code, inspect the existing repository.
- Do not rewrite working modules unnecessarily.
- After each phase, run typecheck, lint, tests, and build where available.
- Report changed files, commands run, known limitations, and manual verification steps.
- If a requirement is ambiguous, choose the smallest safe implementation and state the assumption.
- Never use real patient data or hard-code secrets.

Start with Phase 0 and Phase 1 only. Do not implement later phases until the foundation is running and verified.
```

\---

# 11\. Suggested Claude Workflow

Use Claude in this order:

1. Paste the master prompt.
2. Paste only one phase prompt.
3. Run the project and inspect the result.
4. Ask Claude to fix errors rather than adding new features.
5. Commit the working phase.
6. Move to the next phase.
7. Keep the demo scenario working after every phase.

Useful follow-up prompt:

```text
Review the current implementation against the acceptance criteria for this phase. Do not add new features. Identify bugs, security issues, broken states, and missing tests. Then fix only the issues required for this phase. Run typecheck, lint, tests, and build, and report the results.
```

Useful debugging prompt:

```text
I am going to provide an error from the current JeevanSetu 360 project. First explain the root cause briefly. Then inspect the relevant files, make the smallest safe fix, and add or update a regression test. Do not change unrelated code. Finally run the relevant checks and report exactly what changed.
```

