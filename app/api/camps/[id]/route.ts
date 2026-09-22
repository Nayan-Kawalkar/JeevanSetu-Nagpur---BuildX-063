/**
 * Twist 3 — folding a camp back down.
 *
 * DELETE is the only destructive operation in the facility model, so it is fenced twice: the
 * service refuses anything that is not `temporary`, and it refuses any camp with active cases
 * still routed to it, naming them. A facility cannot be made to disappear from under a patient,
 * and no request to this route can ever remove a standing hospital from the city's board.
 *
 * Coordination only. Standing a camp down is an operational decision a human makes and signs.
 */
import { ApiError, handle, json } from "@/lib/api";
import { auditGuardedMutation, requireRole } from "@/lib/auth";
import { standDownCamp } from "@/lib/services/camps";
import { getHospital } from "@/lib/store";

export const dynamic = "force-dynamic";

const CAMP_ROLES = ["CONTROL_ROOM_OPERATOR", "ADMIN"] as const;

/** GET /api/camps/:id — one camp, so a detail view does not have to filter the collection. */
export function GET(_request: Request, context: RouteContext<"/api/camps/[id]">): Promise<Response> {
  return handle(async () => {
    const { id } = await context.params;
    const facility = getHospital(id);
    // A standing hospital is not a camp: /api/hospitals/:id is its endpoint, not this one.
    if (facility.temporary !== true) throw new ApiError(404, `Camp ${id} not found`);
    return json({ camp: facility });
  });
}

/** DELETE /api/camps/:id — stands the camp down and removes it from the matching pool. */
export function DELETE(_request: Request, context: RouteContext<"/api/camps/[id]">): Promise<Response> {
  return handle(async () => {
    const session = await requireRole(...CAMP_ROLES);
    const { id } = await context.params;
    // Read the name before it is gone, so the audit line says what was folded, not just an id.
    const name = getHospital(id).name;
    standDownCamp(id, session.role);
    auditGuardedMutation(session, {
      type: "RESOURCE_UPDATED",
      hospitalId: id,
      action: `stood down emergency camp ${name}`,
    });
    return json({ ok: true, id, name });
  });
}
