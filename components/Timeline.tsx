import type { EmergencyEvent, EventType } from "@/lib/types";
import { formatTime, timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";

/** Colour of the dot, by how significant the event is to the emergency. */
const EVENT_TONE: Partial<Record<EventType, string>> = {
  CASE_CREATED: "bg-slate-900",
  REQUIREMENTS_EXTRACTED: "bg-sky-500",
  REQUIREMENTS_EDITED: "bg-sky-500",
  MATCHING_COMPLETED: "bg-sky-500",
  HOSPITAL_REQUESTED: "bg-amber-500",
  HOSPITAL_ACCEPTED: "bg-emerald-600",
  HOSPITAL_REJECTED: "bg-red-600",
  REQUEST_EXPIRED: "bg-red-500",
  RESOURCES_RESERVED: "bg-emerald-600",
  RESERVATION_FAILED: "bg-red-600",
  RESERVATION_RELEASED: "bg-slate-400",
  AMBULANCE_EN_ROUTE: "bg-emerald-500",
  ARRIVED: "bg-emerald-600",
  HANDOVER_COMPLETED: "bg-slate-900",
  CASE_CLOSED: "bg-slate-400",
  CASE_CANCELLED: "bg-slate-400",
  RESOURCE_UPDATED: "bg-slate-300",
  BLOOD_STOCK_UPDATED: "bg-red-300",
  DEMO_RESET: "bg-amber-400",
};

const ROLE_LABEL: Record<string, string> = {
  PARAMEDIC: "Paramedic",
  HOSPITAL_COORDINATOR: "Hospital",
  BLOOD_BANK_OPERATOR: "Blood bank",
  CONTROL_ROOM_OPERATOR: "Control room",
  FAMILY_MEMBER: "Family",
  ADMIN: "Admin",
  SYSTEM: "System",
};

/**
 * Append-only audit trail. Judges can read the whole emergency from this one column,
 * which is also the honest answer to "how do we know the system actually did that".
 */
export function Timeline({ events, emptyLabel = "Nothing has happened yet." }: { events: EmergencyEvent[]; emptyLabel?: string }) {
  if (events.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">{emptyLabel}</p>;
  }
  // Newest first is what an operator wants on a wall display.
  const ordered = [...events].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <ol className="relative space-y-3 pl-5">
      <span className="absolute left-[5px] top-2 bottom-2 w-px bg-slate-200" aria-hidden />
      {ordered.map((e) => (
        <li key={e.id} className="relative">
          <span
            className={cn("absolute -left-5 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white", EVENT_TONE[e.type] ?? "bg-slate-300")}
            aria-hidden
          />
          <div className="flex flex-wrap items-baseline gap-x-2">
            <time dateTime={e.at} className="font-mono text-xs text-muted">
              {formatTime(e.at)}
            </time>
            <span className="text-xs font-medium text-slate-500">{ROLE_LABEL[e.actorRole] ?? e.actorRole}</span>
            <span className="text-xs text-slate-400">{timeAgo(e.at)}</span>
          </div>
          <p className="text-sm text-slate-800">{e.message}</p>
        </li>
      ))}
    </ol>
  );
}
