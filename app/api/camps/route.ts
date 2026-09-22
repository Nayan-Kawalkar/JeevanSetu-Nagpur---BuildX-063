/**
 * Twist 3 — the overflow endpoint: how full the city is, and the one action that changes it.
 *
 * GET answers the question the per-patient matcher structurally cannot: not "where should THIS
 * patient go" but "does the city still have room, tier by tier, and if not where should the next
 * facility stand". POST is the action that makes the difference between a system that describes
 * an overflow and one that answers it.
 *
 * Coordination and decision support only. The camp site is a suggestion with its reasoning
 * attached; a human names it, sizes it and signs it off.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { auditGuardedMutation, requireRole } from "@/lib/auth";
import { cityCapacity, isOverflowing, listCamps, standUpCamp, suggestCampSite } from "@/lib/services/camps";
import { RESOURCE_TYPES } from "@/lib/types";

/** The store changes minute by minute; a build-time snapshot of capacity would be a lie. */
export const dynamic = "force-dynamic";

/** Only the control room stands facilities up. A camp entering the pool moves real ambulances. */
const CAMP_ROLES = ["CONTROL_ROOM_OPERATOR", "ADMIN"] as const;

/** Nagpur's bounding box, loose. A camp sited in the sea is a typo, not a plan. */
const LAT = z.number().min(20.5).max(21.5);
const LNG = z.number().min(78.5).max(79.6);

const StandUpCampSchema = z.object({
  name: z.string().trim().min(3).max(80),
  lat: LAT,
  lng: LNG,
  beds: z.number().int().min(1).max(500),
  capabilities: z.array(z.enum(RESOURCE_TYPES)).max(RESOURCE_TYPES.length).default([]),
  standUpBy: z.string().trim().min(2).max(60),
});

/** Reads `?unplaced=JS-2026-0001,JS-2026-0002`, ignoring blanks from a trailing comma. */
function readUnplaced(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * GET /api/camps — the camps in the pool, capacity per tier, whether the city is overflowing, and
 * (given `?unplaced=`) where a camp should go for the patients nobody could place.
 *
 * All four in one response on purpose: a screen that read capacity and the overflow verdict from
 * two requests could show "not overflowing" beside a board with no beds left in it.
 */
export function GET(request: NextRequest): Promise<Response> {
  return handle(() => {
    const unplaced = readUnplaced(request.nextUrl.searchParams.get("unplaced"));
    const suggestion = suggestCampSite(unplaced);
    return json({
      camps: listCamps(),
      cityCapacity: cityCapacity(),
      overflow: isOverflowing(),
      ...(suggestion ? { suggestion } : {}),
    });
  });
}

/**
 * POST /api/camps — stands a camp up.
 *
 * 201 with the created facility, which is a plain Hospital: from this moment the existing matcher,
 * map and capacity board treat it like anywhere else in the city with no further work.
 */
export function POST(request: NextRequest): Promise<Response> {
  return handle(async () => {
    const session = await requireRole(...CAMP_ROLES);
    const input = await parseBody(request, StandUpCampSchema);
    const camp = standUpCamp(input);
    auditGuardedMutation(session, {
      type: "RESOURCE_UPDATED",
      hospitalId: camp.id,
      action: `stood up emergency camp ${camp.name} with ${input.beds} beds`,
    });
    return json({ camp }, 201);
  });
}
