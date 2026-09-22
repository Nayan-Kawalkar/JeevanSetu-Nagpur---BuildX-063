# Hands-on flow — when the judge is driving

`DEMO.md` is the five-minute pitch you narrate. This is different: the full feature tour, ordered so
each step leaves the app in the state the next one needs. Follow the order or things dead-end.

**Three hard dependencies, learn these:**

1. Blood requests only offer cases the hospital has **already accepted**. Request blood after acceptance, before you close the case.
2. The camps screen is worth showing only **after** a surge has produced unplaced patients.
3. Generating 80 casualties floods the case list, so surge comes **after** the single-patient story, and you reset before going back.

**Before you start:** press **Reset demo** in the header. Tabs open at `/paramedic`, `/hospital/H2`, `/control-room`.

---

## Part 1 — One patient (about 5 minutes)

The argument. Do not rush this; everything else is a variation on it.

| # | Where | Do | Say |
|---|---|---|---|
| 1 | `/` | Point at the timeline on the right | "One hour fifty. None of it a medical failure. He went to two hospitals that could not treat him." |
| 2 | `/paramedic` | **New emergency case** | |
| 3 | new case | **Prefill Rohan scenario**, then **Create case** | "The crew types what they see. No codes." |
| 4 | case page | Point at the requirement chips, toggle one off and back on | "Read from the note. The paramedic can correct it before it decides anything." |
| 5 | case page | Point at the countdown | "The first hour. It frames every decision below it." |
| 6 | case page | **Find hospitals** — then stop talking for two seconds | |
| 7 | case page | Point at the red block, then the green | "Nearest is six minutes and cannot treat him. The recommendation is twenty, with the bed, the surgeon and the blood." |
| 8 | case page | **Send request** | "Now nothing happens until a human at that hospital answers." |

## Part 2 — The other desk (about 3 minutes)

| # | Where | Do | Say |
|---|---|---|---|
| 9 | `/hospital/H2` | Note the ICU count **before** clicking | "Watch this number." |
| 10 | `/hospital/H2` | **Accept and hold resources** | "Accepting is a promise of a bed, so the bed is actually held. All or nothing." |
| 11 | `/hospital/H2` | Show the arrivals board countdown and checklist | "The hospital is preparing while the ambulance is still driving." |
| 12 | `/hospital/H2` | **Request blood** → pick the bank → send | Only works now that this hospital owns the case |
| 13 | `/blood-bank/BB1` | **Reserve** | "Units move from available to reserved. That replaces ringing round WhatsApp groups." |
| 14 | case page | **Create family link**, open it in a new tab | "Status, hospital, ETA, blood arranged. No clinical notes, no staff names." |
| 15 | case page | Start journey → Arrived → Handover complete | |
| 16 | case page | Point at **where the hour went** | "Most of the hour goes to coordination, not driving. That bar is our whole argument." |

## Part 3 — The city (about 4 minutes)

**Press Reset demo first.**

| # | Where | Do | Say |
|---|---|---|---|
| 17 | `/surge` | Read the opening line aloud | "Our matcher ranks for one patient. Ask it eighty times and it answers the same thing eighty times." |
| 18 | `/surge` | Declare incident → **Generate 80** | |
| 19 | `/surge` | Point at the four triage counts | |
| 20 | `/surge` | **Allocate all** | "One pass over all eighty, in triage order, against a ledger that decrements as each is placed." |
| 21 | `/surge` | Point at the naive-versus-planned contrast | "A nearest-hospital app sends eighty people to one hospital with two free beds." |
| 22 | `/surge` | Point at the utilisation bars, then the unplaced list | "Minor injuries went down-tier deliberately, to keep trauma beds free." |
| 23 | `/camps` | Stand up a camp, 60 beds | "When every hospital is full, the answer is not 'no results'. It is to open somewhere new." |
| 24 | `/surge` | Re-allocate | Unplaced drops sharply; the camp is now in matching |

## Part 4 — When things fail (about 2 minutes)

| # | Where | Do | Say |
|---|---|---|---|
| 25 | `/relay` | Compose a message, point at the character count | "No internet, but there is still GSM. A whole case in 160 characters." |
| 26 | `/relay` | Copy it, paste into the receive box, **Decode** | "Structured fields first, free text last, so even a clipped message carries what matters." |
| 27 | `/demo-login` | Enter as hospital coordinator for H3, then try to edit H2 | "Role checks are on the server, not in the browser." |
| 28 | `/control-room` | Finish here | "One board. Every incident, every bed, what is unconfirmed, what needs a phone call." |

---

## If the judge is clicking, not you

Hand them the keyboard at step 6 (**Find hospitals**) and step 20 (**Allocate all**). Those two are where
the product does something they did not expect, and it lands harder when their own hand did it.

Let them break it. The three things they will try:

- **Accept when there is no bed.** Set ICU to 0 on the hospital console first. The accept fails, names what is short, and holds nothing.
- **Send the same request twice.** Same request comes back, not a second one.
- **Send a patient to the hospital that cannot treat them.** The button is disabled and the API refuses it too.

All three are the system being right. Let them find it.

## Deep-dive if they ask about the golden hour

On `/hospital/H2`, report the ICU as 45 minutes from usable. Then create a new case and match it. The
recommendation flips from H2 to H3, and the cards explain themselves:

> H3: "14 min further, but ICU bed is ready here — 34 min to treatment against 65."

Say: "We used to rank on travel time, which assumes a hospital is usable the moment you arrive. Often it
is not."

## Recovery

Anything goes wrong, press **Reset demo**. It restores this exact scenario from any screen. Nothing on the
demo path needs the internet except the map tiles, and those fall back to a drawn map on their own.
