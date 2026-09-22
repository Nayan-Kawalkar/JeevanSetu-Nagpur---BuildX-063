# JeevanSetu 360

Real-time emergency coordination for Nagpur. Helps an ambulance reach **the right hospital, not merely the nearest one**
by putting ICU beds, on-call specialists, blood stock, travel time and hospital acceptance on one shared board.

Build-X hackathon · Track 1: Healthcare & Emergency Services.

> **Safety boundary.** This is a coordination and decision-support prototype with fictional demo data.
> It does not diagnose patients, prescribe treatment or claim clinical validation. Every recommendation is
> explainable and requires a human to confirm.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. No environment variables are required. See `.env.example` for optional ones.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript strict check |
| `npm run check` | lint + typecheck |

## Roles (demo access, no login)

| Role | Route |
|---|---|
| Paramedic | `/paramedic` |
| Hospital coordinator | `/hospital` |
| Control room | `/control-room` |
| Blood bank | `/blood-bank` |

## Architecture

Next.js 16 App Router, TypeScript strict, Tailwind v4, Zod, SWR polling. Modular monolith: business logic lives in
`lib/services/*`, UI in `app/*` and `components/*`, data in an in-memory store (`lib/store.ts`) seeded with
fictional Nagpur hospitals so the demo runs with zero infrastructure.

## Build phases

1. Foundation: shell, demo banner, role landing, health route ✅
2. Types, seed data, in-memory store, API routes
3. Services: requirement extraction, hospital matching, ETA
4. Paramedic flow
5. Hospital and blood-bank dashboards with acceptance + reservation
6. Control room map and timeline
7. Ambulance status, demo reset, polish
8. Deployment
