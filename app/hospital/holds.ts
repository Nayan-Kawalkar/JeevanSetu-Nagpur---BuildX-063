import { BLOOD_GROUP_LABEL, RESOURCE_LABEL, type Reservation } from "@/lib/types";

/**
 * Reads one hold back as a sentence a coordinator can repeat down the phone: "2 units O−",
 * "ICU bed". A hold is a promise made to a patient who is already moving, so it is always
 * spelled out in full rather than shown as a code.
 */
export function reservationLabel(reservation: Reservation): string {
  if (reservation.resourceType === "BLOOD_UNITS") {
    const group = reservation.bloodGroup ? BLOOD_GROUP_LABEL[reservation.bloodGroup] : "matched group";
    return `${reservation.quantity} ${reservation.quantity === 1 ? "unit" : "units"} ${group}`;
  }
  const label = RESOURCE_LABEL[reservation.resourceType];
  return reservation.quantity > 1 ? `${label} ×${reservation.quantity}` : label;
}
