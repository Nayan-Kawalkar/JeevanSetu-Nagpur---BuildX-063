# JeevanSetu 360 — how it works, for the judges' table

Everything below the line marked VERIFIED is covered by `npm run smoke`, which drives the whole story over
HTTP and asserts 23 things across 14 steps. If a judge doubts a claim, run it in front of them.

---

## The one sentence

> An ambulance should reach the hospital that can treat the patient, not the one that is closest.
> JeevanSetu 360 puts ICU beds, on-call specialists, blood stock and hospital acceptance on one shared
> board so that choice can be made in seconds instead of by phone.

## The problem, concretely

In the Nagpur scenario an accident victim reaches hospital one hour fifty after the crash. The ambulance
goes to the nearest private hospital, which has no ICU bed and no neurosurgeon. Then across the city to a
government hospital, which is low on O-negative. He is finally admitted at a hospital that had a free bed
the whole time.

**Nothing in that story is a medical failure.** Bed status, specialist rosters and blood stock live in phone
calls and paper registers, so the ambulance and the hospitals never see the same information. That is an
information problem, and information problems are fixable in software.

---

## How the system actually works

Six steps. Say them in this order.

**1. The crew writes what they see.** Free text, no codes, no taxonomy. "Truck vs motorcycle, head injury,
unconscious two minutes, deformed right thigh, heavy bleeding."

**2. That text becomes structured requirements.** Eight keyword families, each with English plus Hindi and
Marathi transliterations, map phrases to coordination needs. "Head injury" and "unconscious" give
neurosurgeon, CT and ICU. "Femur" gives orthopaedics and a theatre. "Bleeding" gives blood and a trauma
team. The incident type adds a baseline and a CRITICAL severity adds a floor of ICU and trauma team.

**3. A human corrects it.** The chips are editable before anything acts on them. The machine proposes, the
paramedic decides. This is not a nicety, it is the safety boundary.

**4. Every facility is ranked.** Detail below, because this is what judges will probe.

**5. The receiving hospital accepts, which holds the resources.** Acceptance is a promise of a bed, so the
bed is actually reserved in the same step, or the acceptance fails.

**6. The ambulance runs a state machine to handover,** and every transition is an append-only event, so the
whole emergency is auditable end to end.

---

## The ranking, which is the part they will push on

Five weighted components out of 100:

| Component | Weight | What it measures |
|---|---|---|
| Capability | 35 | Does this hospital have the department at all |
| Availability | 25 | Is the bed or scanner free right now |
| Specialists | 15 | Is the surgeon on call |
| Travel | 15 | Time to get there |
| Freshness | 10 | How recently a human confirmed these numbers |

**But the score is not the important part.** The important part is the suitability gate that sits above it.

If a hospital is missing a **critical** requirement — an ICU bed, the needed specialist, a ventilator, a
theatre — it is marked UNSUITABLE, and an unsuitable hospital can **never** outrank a suitable one, whatever
its score. In the demo the nearest hospital is six minutes away and scores 62. The recommendation is twenty
minutes away and scores 93. But even if the nearest scored 99 it would still sit below, because it cannot
treat this patient. A score can be argued with. A gate cannot.

**Freshness being scored at all is unusual and worth pointing out.** A bed count confirmed fifty-eight
minutes ago is worth less than one confirmed six minutes ago, and the card says so on its face. The system
never claims a number is live when it is not. That is the difference between a dashboard and a tool someone
would actually trust at 2 a.m.

---

## The three rules that make it defensible

State these plainly; they are what separate this from a demo that merely looks right.

**1. An unsuitable hospital never outranks a suitable one.** Enforced in sorting, and neither the primary
nor the backup recommendation can ever be one. The API refuses to even send a request to a hospital that
cannot treat the patient.

**2. Acceptance is all-or-nothing.** The reservation is planned in full, checked in full, and only then
applied. If the ICU bed went to a walk-in thirty seconds ago, the accept fails and names exactly what is
short, and **nothing at all** is held. The smoke test proves this by snapshotting every resource line before
and after a failed accept and asserting nothing moved.

**3. Requests are idempotent.** A double-tapped Accept, or a queued write replayed after a blackout, cannot
create a second case or double-book a bed.

---

## Deliberate engineering choices, and why

**No database, no map tiles.** State is in memory and the map is drawn from coordinates in plain SVG. A
hackathon venue may have no usable network, and a demo that dies because a tile server did not respond is a
dead demo. The trade-off is that state resets on restart, which the one-press **Reset demo** button turns
into a feature. Say this before a judge finds it: it is a considered choice, not a shortcut.

**The AI is optional and cannot make things worse.** Extraction runs on deterministic keyword rules by
default. If an Anthropic key is present, a Claude adapter runs as well, its output is validated with Zod as
untrusted input, and it is **unioned onto the keyword floor** — so the model can only ever ADD a requirement,
never remove one. A hallucinating model cannot make the system forget the patient needs an ICU. Timeouts and
malformed JSON fall back silently to keywords.

**Patient data is minimised on purpose.** Only a temporary patient ID, never a name. The control-room wall
display deliberately omits clinical notes. The family page excludes notes, staff names and every other case.

---

## The four twists

*Status: designed and implemented, final browser verification in progress at the time of writing. Check
before claiming each one on stage.*

### Golden Hour

The honest observation is that our original ranking used travel time, which quietly assumes a hospital is
usable the moment you arrive. It often is not. So the target changed to **time to definitive care**:

```
travel time + readiness delay
```

A hospital five minutes further whose neurosurgeon is already in the building beats a closer one whose
surgeon is forty minutes away. Alongside it, a live sixty-minute countdown on every case and a bar showing
**where the hour actually went** — detection, dispatch, travel, on scene, handover. That bar is the argument:
most of the hour is lost to coordination, not to driving.

### Emergency surge

The strongest thing to say here is an admission. **Our matcher optimises for one patient.** Run it for eighty
casualties and all eighty are told the same hospital is best. That hospital has two ICU beds. Per-patient
greedy matching is actively harmful in a surge.

The fix is a global allocation pass against a **mutable capacity ledger**: patients sorted by triage colour
first, and the ledger decremented as each is placed, so patient eleven sees the beds the first ten took.
Minor cases are deliberately steered down-tier to preserve trauma capacity, which is real mass-casualty
doctrine. The screen shows the plan beside what a nearest-hospital app would have done.

### Hospital overflow

Facilities gain tiers: tertiary, secondary, primary, camp. When no tertiary hospital is suitable the matcher
walks down the ladder instead of failing, and the control room can **stand up an emergency camp**, which
enters hospital matching immediately. The utilisation bars show load spreading instead of stacking.

### Network blackout

Four layers, so one failing does not take the rest down: cached facility data with its age shown, drafts
saved on the device, a retry queue whose idempotency keys make replay safe, and an **SMS bridge** that packs
a whole case into one 160-character message:

```
JS1|21.0455,79.0140|CRIT|RED|ICU,NEU,CT,OR|ONEG:2|M27|truck v bike head inj femur bleed
```

There is usually still GSM when there is no data. The structured fields are first so a truncated message
still carries everything that matters.

---

## Questions they will ask, and what to say

**"How is this different from Google Maps or calling 108?"**
Maps optimises distance. We optimise treatability. The whole product is the observation that those are
different answers, and the demo shows a case where they differ by fourteen minutes and an ICU bed.

**"What if the hospital data is wrong or out of date?"**
Then we say so on the card. Freshness is a scored component, anything over thirty minutes is badged
unconfirmed, and the control room raises it as an alert telling staff to call before relying on it. We never
present an unconfirmed number as live. We cannot make a hospital update its beds; we can make it obvious
when it has not.

**"Who actually types the bed counts in?"**
Today, a coordinator on the hospital console, which is why every press is treated as a human confirmation
and refreshes the freshness score. In deployment this would come from the hospital's own HMIS, from
e-RaktKosh for blood, and from 108 for dispatch. The interfaces are already shaped for that.

**"Is the AI making medical decisions?"**
No. It reads free text into a checklist of coordination needs, a paramedic corrects it, and it never
diagnoses or suggests treatment. It is also optional: the deterministic path is primary and the model can
only add to it.

**"What happens if two ambulances want the last ICU bed?"**
The first acceptance to reach the server reserves it atomically; the second fails and says exactly what is
short, with nothing partially held. That is tested.

**"Is this production ready?"**
No, and we would not claim it is. It is a coordination prototype on fictional data. Real deployment needs
hospital, ambulance and blood-bank integration, real authentication, a persistent database, and privacy and
medical review. What we have proven is that the coordination logic works and the interfaces are the right
shape.

---

## If something breaks on stage

Press **Reset demo** in the header. It restores this exact scenario in one click from any screen. Nothing on
the demo path needs the internet.
