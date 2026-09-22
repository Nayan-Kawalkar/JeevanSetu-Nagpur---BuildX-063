# The four twists — design

Judging covers these, so each one needs a visible, defensible answer, not a checkbox. What follows is
the design each implementation should follow. The common thread: **the system we built optimises for one
patient at a time, and every twist breaks that assumption in a different way.** Saying that out loud is
the strongest thing we can do in front of judges.

---

## Twist 1 — Emergency surge (mass casualty)

### The honest problem with what we have

Our matcher ranks hospitals for **one** patient. Run it for eighty patients from one highway pile-up and
every single one is told the same thing: "Wardha Road Trauma is best." That hospital has two ICU beds.
Greedy per-patient matching is actively harmful in a surge, and we should say so on stage before a judge
says it for us.

### The answer: global allocation against a live capacity ledger

New service `lib/services/surge.ts`:

```
allocateSurge(patients, facilities) -> SurgePlan
```

- Sort by triage tag first, then by how long each has been waiting. Never by arrival order.
- Walk the sorted list against a **mutable capacity ledger** that decrements as each patient is placed,
  so the eleventh patient sees the beds the first ten already took.
- Two passes. RED patients get best-fit against trauma-capable facilities. Only then do YELLOW and GREEN
  get placed, and GREEN is deliberately steered to lower-tier facilities and camps to **preserve trauma
  capacity**, which is the actual clinical doctrine and the opposite of what a naive "nearest" system does.
- Anything unplaceable comes back as `unassigned`, which is the trigger for Twist 3.

### Triage

Add a `TriageTag` of RED (immediate), YELLOW (delayed), GREEN (minor), BLACK (expectant), following START
triage so the vocabulary is the one responders already use. Default it from severity, always let a human
override, and never let the system assign BLACK on its own — that is a clinical judgement and our safety
boundary forbids it.

### Ambulance allocation

Four ambulances and eighty patients means round trips, not assignments. Plan shuttle runs per vehicle:
nearest RED first, estimated round-trip time, queue position. Show each vehicle's run list.

### Screen

`/surge` — declare an incident, see the triage board as four counts, press **Allocate all**, and watch the
distribution table fill: patients per hospital, a load bar against real capacity, and the overflow list.

### What to say

> "Eighty casualties. A nearest-hospital app sends all eighty to the same trauma centre, which has two ICU
> beds. Ours allocates against live capacity, in triage order, and holds trauma beds back for the patients
> who need them."

---

## Twist 2 — Network blackout

Four independent layers, so a failure of one does not take the others down.

**1. Offline shell and local cache.** A service worker caches the app shell. The last known facility list,
bed counts and blood stock go to IndexedDB, stamped with the time they were captured. Offline, the app opens
and still ranks hospitals, but every number is badged with its age, and the ranking says plainly that it is
working from cached data. A stale answer offered honestly beats no answer.

**2. Local-first writes.** The retry queue already being built generalises to every mutation. Each queued
write carries a stable idempotency key, which the API already honours, so replaying a queue after four hours
of blackout cannot create duplicate cases or double-book a bed.

**3. SMS bridge — the demonstrable one.** When there is no data at all there is usually still GSM. A compact
codec packs a whole case into one 160-character SMS:

```
JS1|21.0455,79.0140|CRIT|RED|ICU,NEU,CT,OR|ONEG:2|M27|truck v bike head inj femur bleed
```

The paramedic screen generates that string and offers it as an `sms:` link. The control room has a paste box
that decodes it into a real case. Round-tripping a real message on stage is worth more than any diagram.

**4. Peer-to-peer.** `BroadcastChannel` syncs two tabs on one machine with the server unreachable, standing in
for a Bluetooth or Wi-Fi Direct mesh between crew devices. Label it honestly as a simulation of the transport,
because the sync and conflict logic is real even though the radio is not.

**5. Degraded-mode banner** that states which features still work rather than a generic "you are offline".

---

## Twist 3 — Hospital overflow

### Facility tiers

Stop modelling only tertiary hospitals. Add a `tier`:

| Tier | What it is | Can take |
|---|---|---|
| TERTIARY | The six we already have | Anything they have capability for |
| SECONDARY | Nursing homes, community health centres | Stabilisation, minor surgery, observation |
| PRIMARY | PHC and UPHC | First aid, stabilise and forward |
| CAMP | Temporary emergency camp, created on demand | Whatever it is stood up with |

### Escalation ladder

When no tertiary hospital is suitable, the matcher walks down instead of giving up:

1. Tertiary that meets every critical need.
2. Tertiary that can stabilise, flagged as needing onward transfer.
3. Secondary for patients whose critical needs it genuinely meets.
4. Primary and camps for GREEN patients, deliberately, to protect the tier above.
5. Still unplaced → **recommend standing up a camp**, siting it at the centroid of the unplaced patients so
   aggregate travel is minimised, and say how many it would need to hold.

### Stand up a camp

A control-room action creating a camp with a name, a location, a bed count and capabilities. It enters the
matching pool immediately. This is the moment that proves the system adapts rather than just reports.

### Transfer out

A patient already at a saturated hospital can be marked for onward transfer, which re-enters them into
matching with their current hospital as the origin.

### Metric to show

Utilisation per facility, so a judge sees load **spreading** rather than stacking. That single bar chart is
the twist's whole argument.

---

## Twist 4 — Golden hour

### A clock on everything

Every case carries `incidentAt` and a sixty-minute deadline. A live countdown sits on the case page, the
hospital arrivals board and the control room, and it goes amber then red as it burns down. The control room
sorts by time remaining, not by arrival order.

### Change what we optimise

Today we rank on travel time. That is the wrong target. Rank on **time to definitive care**:

```
travel time + hospital readiness delay
```

where readiness delay is how long until the thing the patient actually needs is usable — the neurosurgeon is
paged but forty minutes away, the CT has a queue, the theatre is mid-case. A hospital five minutes further
that is ready now beats a closer one that is not, and the card should say exactly that. This is a genuinely
better model and it is precisely the twist's point.

### Where the hour actually goes

Break the elapsed time into detection, dispatch, travel to scene, on scene, travel to hospital, and handover,
and draw it as a segmented bar against the sixty minutes. Most of the hour is usually lost to coordination,
not to driving, and the bar proves our case better than any claim.

### Instant notification

On acceptance, push a pre-arrival alert to the receiving hospital: a checklist with the countdown — trauma bay
ready, blood to bedside, CT slot held, specialist paged — each tickable, so the hospital's readiness is visible
to the crew before they arrive. An arrivals board on the hospital console shows everyone inbound with their
countdowns.

### Guiding the responder

We have no routing engine and should not pretend otherwise. Give bearing, distance, a landmark waypoint list
and a plain next action: *"Hospital confirmed. Depart now. Eleven minutes leaves thirty-four of the golden
hour."* Coordination guidance only. No clinical instruction, ever.

---

## Build order

Effort against demo value, highest ratio first:

| Order | Twist | Why here |
|---|---|---|
| 1 | Golden hour | Cheapest. Mostly a clock, a time breakdown and one scoring change, but it touches every screen so judges see it constantly |
| 2 | Surge | Most technically impressive, and the clearest "our first design was wrong and here is why" story |
| 3 | Overflow | Builds directly on surge's unassigned list, so doing it second makes it cheap |
| 4 | Blackout | Partly already in flight as offline drafts; the SMS codec is the cheap, vivid part |

Surge and overflow share the facility ledger, so they should be built by people talking to each other, or by
one pass.

## Safety boundary, unchanged

Triage tags are entered or confirmed by a human. The system never assigns BLACK. Nothing here diagnoses,
prescribes or promises. Every recommendation still shows its reasons and still needs a person to confirm.
