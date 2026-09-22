/**
 * Client-side constants for the surge board.
 *
 * `MAX_GENERATED_CASUALTIES` is deliberately re-declared here rather than imported from
 * `lib/services/surge`: that module is the allocator and it pulls in the in-memory store, so a
 * value import would drag the whole server engine into the browser bundle. The server is still
 * the authority — it caps the count itself and answers 400 — this copy only keeps the form from
 * asking for something it already knows will be refused.
 */
export const MAX_GENERATED_CASUALTIES = 200;

/**
 * Where a mass-casualty incident actually happens around Nagpur.
 *
 * A presenter should be choosing a place, not typing coordinates, so these are the highway
 * points a Nagpur control room would name out loud. Coordinates are approximate demo positions,
 * not survey data, and the free-coordinate fallback below the list exists for anywhere else.
 */
export interface IncidentSite {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

export const INCIDENT_SITES: IncidentSite[] = [
  { id: "khapri", label: "Wardha Road near Khapri", lat: 21.03, lng: 79.053 },
  { id: "kamptee", label: "Kamptee Road near Automotive Square", lat: 21.175, lng: 79.098 },
  { id: "wadi", label: "Amravati Road near Wadi", lat: 21.14, lng: 78.975 },
  { id: "hingna", label: "Outer Ring Road at Hingna", lat: 21.07, lng: 78.945 },
  { id: "pardi", label: "Bhandara Road near Pardi", lat: 21.15, lng: 79.13 },
];
