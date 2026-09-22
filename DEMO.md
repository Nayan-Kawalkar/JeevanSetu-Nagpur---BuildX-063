# JeevanSetu 360 — five-minute demo script

Reset first: press **Reset demo** in the header, or `curl -X POST http://localhost:3000/api/demo/reset`.
Have three browser tabs open and ready: `/paramedic`, `/hospital/H2`, `/control-room`.

---

## 0:00 — The problem (30 s, landing page)

> "At 11:20 on a July night a truck hits a motorcyclist on Wardha Road. The ambulance reaches him in
> 14 minutes. Then it goes to the nearest private hospital, which has no ICU bed and no neurosurgeon.
> Then across the city to a government hospital, which is low on O-negative. He is admitted one hour
> fifty minutes after the accident, at a hospital that had a free bed the whole time."

Point at the timeline on the right of the landing page.

> "Nothing here is a medical problem. Bed status, specialist rosters and blood stock live in phone
> calls and paper registers, so the ambulance and the hospitals never see the same information."

## 0:30 — Create the case (45 s, `/paramedic`)

Press **New emergency case**, then **Prefill Rohan scenario**. Read one line of the notes aloud.
Press **Create case**.

> "The paramedic types what they see. No codes, no dropdown taxonomy."

## 1:15 — Requirements, reviewed by a human (30 s)

The extracted chips appear: ICU, neurosurgeon, CT scan, orthopaedic surgeon, trauma team, blood.

> "The system turned free text into coordination requirements. It is not diagnosing anything. And the
> paramedic can correct it before it drives any decision."

Toggle one chip off and back on to show it is editable.

## 1:45 — The recommendation (75 s) — **this is the moment**

Press **Find hospitals**.

Point at the closest hospital, which is marked **Cannot treat this patient**:

> "This one is four minutes away. It is the one the ambulance would have gone to. No ICU bed, no
> neurosurgeon. The system refuses to rank it above a hospital that can actually treat him, however
> close it is."

Then the recommendation:

> "Eleven minutes away: ICU bed free, neurosurgeon on call, and two units of O-negative one kilometre
> from the door. Every reason is on the card, and so is the age of the data behind it."

Point at the score bars and the "confirmed 6 minutes ago" label. Point at the greyed hospital on the
map with a line through it, and the backup listed below.

## 3:00 — Acceptance reserves, or fails honestly (60 s)

Press **Send request**. Switch to the `/hospital/H2` tab.

> "The receiving hospital sees the patient before the ambulance moves, and exactly what accepting will
> hold."

Press **Accept and hold resources**. Show the ICU count drop by one and the blood units move to reserved.

> "Acceptance is all-or-nothing. If the ICU bed had gone to someone else in the last thirty seconds, the
> accept fails and says what is short, rather than promising a bed that is not there."

*(Optional, if time: set ICU to 0 on another hospital and try to accept, to show the refusal.)*

## 4:00 — Everyone sees the same thing (45 s, `/control-room`)

> "One board. Active incidents, which hospitals are full, which data has not been confirmed in an hour,
> which blood group is running out, and every action with a timestamp."

Point at a stale-data warning and a blood alert. Back on the paramedic tab, press **Start journey**,
**Arrived**, **Handover complete**.

## 4:45 — Close (15 s)

> "One hour fifty, down to about twenty minutes. Fictional data and a prototype: it does not diagnose,
> it does not treat, and real deployment needs hospital, ambulance and blood-bank integration plus
> privacy and medical review. What it removes is the phone calls."

---

## If something breaks

| Problem | Fix |
|---|---|
| Data looks wrong mid-demo | Press **Reset demo** in the header; it restores this exact scenario |
| A page hangs | Every dashboard polls; reload the tab, no state is lost server-side |
| No internet in the venue | Nothing needs it. The map is drawn locally and there is no external API on the demo path |
| Questions about the AI | Extraction runs on keyword rules by default; the Claude adapter is optional and falls back silently |

## Numbers worth knowing

| Thing | Value |
|---|---|
| Hospital score weights | Capability 35, beds free 25, specialists 15, travel 15, freshness 10 |
| Stale threshold | 30 minutes |
| Hospital response window | 3 minutes |
| Resource hold | 45 minutes |
| Blood search radius from the hospital | 6 km |
