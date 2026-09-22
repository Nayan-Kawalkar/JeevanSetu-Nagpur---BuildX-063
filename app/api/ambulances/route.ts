/**
 * Ambulance roster — which crews exist, where they last reported themselves and what each is
 * doing.
 *
 * The paramedic form picks a crew from this list and the control-room map draws them from it.
 * There is no vehicle tracker in this prototype: a position changes only when the workflow
 * moves it, so this is a last-known roster, not a live feed, and no screen should label it as
 * one.
 */
import { handle, json } from "@/lib/api";
import { listAmbulances } from "@/lib/store";

/**
 * GET /api/ambulances — every ambulance, ordered by call sign.
 *
 * The order is fixed so a polling dashboard and a dropdown never reshuffle between two reads
 * that saw identical data. Records are copied, so nothing a consumer does can edit the store.
 */
export function GET(): Promise<Response> {
  return handle(() => {
    const ambulances = listAmbulances()
      .map((ambulance) => ({ ...ambulance }))
      .sort((a, b) => a.callSign.localeCompare(b.callSign));
    return json({ ambulances });
  });
}
