/** Deterministic distance/ETA approximation; a replaceable maps adapter for the hackathon. */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Real roads are longer than the straight line; 1.4 is a fair urban average. */
export const ROAD_FACTOR = 1.4;
/** Ambulance average speed through Nagpur traffic at night, km/h. */
export const AVG_SPEED_KMH = 32;

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Road distance estimate in km, one decimal. */
export function roadKm(a: LatLng, b: LatLng): number {
  return Math.round(haversineKm(a, b) * ROAD_FACTOR * 10) / 10;
}

/** ETA in whole minutes, never below 2 (loading + departure). */
export function etaMinutes(a: LatLng, b: LatLng): number {
  const km = haversineKm(a, b) * ROAD_FACTOR;
  return Math.max(2, Math.round((km / AVG_SPEED_KMH) * 60));
}

export function nearest<T extends LatLng>(from: LatLng, items: T[]): T | undefined {
  let best: T | undefined;
  let bestKm = Infinity;
  for (const item of items) {
    const km = haversineKm(from, item);
    if (km < bestKm) {
      bestKm = km;
      best = item;
    }
  }
  return best;
}
