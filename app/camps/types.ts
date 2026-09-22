/**
 * The shape /api/camps answers with, named once so three components agree about it.
 *
 * These are the service's own exported types; importing them as types costs nothing at runtime
 * (the import is erased) and means a change in lib/services/camps.ts breaks this screen at
 * compile time rather than silently in front of a judge.
 */
import type { CampSiteSuggestion, OverflowState, TierCapacity } from "@/lib/services/camps";
import type { Hospital } from "@/lib/types";

export interface CampsResponse {
  camps: Hospital[];
  cityCapacity: TierCapacity[];
  overflow: OverflowState;
  /** Only present when the request carried `?unplaced=` and at least one id resolved. */
  suggestion?: CampSiteSuggestion;
}
