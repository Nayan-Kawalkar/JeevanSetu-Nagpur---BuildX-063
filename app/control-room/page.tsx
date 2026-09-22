import { ControlRoomBoard } from "./ControlRoomBoard";

export const metadata = {
  title: "Control room",
  description:
    "Every active incident, hospital capacity, blood stock, alerts and the event timeline for Nagpur on one shared board.",
};

/**
 * The control-room wall display.
 *
 * The page itself is a server component so the heading and the standing caveats are in the
 * HTML before any JavaScript runs; everything that polls lives in the client board below.
 */
export default function ControlRoomPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Control room</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600 sm:text-base">
          One shared view of the city: open incidents, hospital capacity, blood stock and what needs a phone call.
          Every figure was typed in by a person at a hospital or blood bank, so each one is shown with the time
          since it was last confirmed. This board coordinates beds, blood and crews — it does not assess or treat
          the patient.
        </p>
      </header>
      <ControlRoomBoard />
    </div>
  );
}
