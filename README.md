# JeevanSetu 360

Real-time emergency coordination for Nagpur. Helps an ambulance reach **the right hospital, not merely the
nearest one**, by putting ICU beds, on-call specialists, blood stock, travel time and hospital acceptance on
one shared board.

Build-X hackathon · Track 1: Healthcare & Emergency Services.

> **Safety boundary.** A coordination and decision-support prototype running on fictional data. It does not
> diagnose, prescribe treatment, or claim clinical validation. Every recommendation is explainable and a human
> confirms it.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. No environment variables are needed. `.env.example` lists the two optional ones.

`DEMO.md` is the five-minute presentation script. Press **Reset demo** in the header to restore the scripted
scenario at any point.

## What it does

The scripted case: a motorcyclist on Wardha Road with a head injury, a femur fracture and heavy bleeding.

1. **Paramedic** types what they see. Keyword extraction turns the note into coordination requirements
   (ICU, neurosurgeon, CT, orthopaedics, trauma team, blood), which the crew can correct before anything acts on them.
2. **Matching** ranks every hospital on capability 35, beds free 25, specialists 15, travel time 15, data
   freshness 10. A hospital missing a critical requirement is marked unable to treat this patient and can
   never outrank one that can, however close it is. Every card shows the reasons and how old each number is.
3. **Acceptance** is all-or-nothing. The receiving hospital sees the patient and exactly what accepting will
   hold; on accept, the ICU bed and blood units are reserved in one step, or the accept fails and names what
   was short. A repeated request is idempotent.
4. **Control room** shows every active case, hospital capacity, unconfirmed data, blood shortages and the
   full event timeline from one endpoint.

## Verify it

```bash
npm run typecheck && npm run lint && npm run build && npm run smoke
```

`npm run smoke` drives the entire demo over HTTP against a running dev server and asserts 14 steps, including
the three rules the product turns on: the nearest hospital is refused, a failed accept reserves nothing, and a
repeated request returns the same id.

## Architecture

Next.js 16 App Router, TypeScript strict, Tailwind v4, Zod, SWR polling at 3 s. A modular monolith: business
rules live in `lib/services/`, transport in `app/api/` (15 routes), screens in `app/`, shared UI in
`components/`.

| Layer | Where | Note |
|---|---|---|
| Domain model | `lib/types.ts` | Entities and enums, named to match a future Prisma schema |
| Storage | `lib/store.ts`, `lib/seed.ts` | In-memory on `globalThis`, seeded with fictional Nagpur data |
| Requirement extraction | `lib/services/extraction.ts`, `ai.ts` | Deterministic keyword rules; an optional Claude adapter can only add to that floor, never remove from it |
| Hospital matching | `lib/services/matching.ts` | Pure and synchronous; the demo's core logic |
| Reservations | `lib/services/reservation.ts` | Plans the whole hold, checks it, then applies it |
| Case lifecycle | `lib/services/cases.ts` | State machine and idempotent requests |
| Control-room read model | `lib/services/overview.ts` | One endpoint, one screen |
| Map | `components/NagpurMap.tsx` | Hand-drawn SVG with collision-avoiding labels, so no network is needed |

**No database and no tile server, on purpose.** A hackathon venue may have no usable network, and the demo
must not depend on one. The trade-off is that state resets on a server restart, which the reset button turns
into a feature.

## Deliberate omissions

Real authentication, a persistent database, multilingual UI, offline drafts, voice input and a family access
page are all designed for but not built. They are next steps, not hidden gaps.
