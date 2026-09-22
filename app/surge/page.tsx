import { SurgeBoard } from "./SurgeBoard";

export const metadata = {
  title: "Surge board",
  description:
    "Mass-casualty allocation: every casualty placed in one pass against a live capacity ledger, in triage order, instead of eighty ambulances converging on the same trauma door.",
};

/**
 * Twist 1 — the surge board.
 *
 * The page is a server component so the heading and the standing caveat are in the HTML before
 * any JavaScript runs. Everything that polls, plans or commits lives in the client board below.
 */
export default function SurgePage() {
  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Twist 1 · Emergency surge</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Mass-casualty surge board</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 sm:text-base">
          Our matcher ranks hospitals for <strong>one</strong> patient. Ask it eighty times and it answers the same
          thing eighty times, and every ambulance in the district converges on one door. This board does something
          different: one allocation pass over all casualties at once, in triage order, against a capacity ledger that
          decrements as each patient is placed.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Coordination and decision support only. Triage tags are recorded or confirmed by the crew at the scene —
          the system never assigns Expectant — nothing here diagnoses, prescribes or promises, and a person presses
          the button that commits the plan.
        </p>
      </header>
      <SurgeBoard />
    </div>
  );
}
