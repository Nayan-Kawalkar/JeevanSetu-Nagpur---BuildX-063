"use client";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { useNow } from "@/lib/hooks";
import { formatTime, timeAgo } from "@/lib/utils";
import type { CaseSeverity, CaseStatus, RequestStatus, ReservationStatus } from "@/lib/types";

// ---------- Severity ----------

const SEVERITY_TONE: Record<CaseSeverity, BadgeTone> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "info",
  LOW: "neutral",
};

export function SeverityBadge({ severity }: { severity: CaseSeverity }) {
  return (
    <Badge tone={SEVERITY_TONE[severity]}>
      {severity === "CRITICAL" && <span className="h-1.5 w-1.5 rounded-full bg-red-600" aria-hidden />}
      {severity}
    </Badge>
  );
}

// ---------- Case status ----------

export const STATUS_LABEL: Record<CaseStatus, string> = {
  CREATED: "Created",
  REQUIREMENTS_EXTRACTED: "Requirements ready",
  MATCHING: "Choosing hospital",
  HOSPITAL_REQUESTED: "Awaiting hospital",
  ACCEPTED: "Hospital accepted",
  AMBULANCE_EN_ROUTE: "En route",
  ARRIVED: "Arrived",
  HANDOVER_COMPLETED: "Handover done",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

const STATUS_TONE: Record<CaseStatus, BadgeTone> = {
  CREATED: "neutral",
  REQUIREMENTS_EXTRACTED: "info",
  MATCHING: "info",
  HOSPITAL_REQUESTED: "warning",
  ACCEPTED: "success",
  AMBULANCE_EN_ROUTE: "success",
  ARRIVED: "success",
  HANDOVER_COMPLETED: "dark",
  CLOSED: "neutral",
  CANCELLED: "neutral",
};

export function StatusBadge({ status }: { status: CaseStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

// ---------- Request / reservation status ----------

const REQUEST_TONE: Record<RequestStatus, BadgeTone> = {
  PENDING: "warning",
  ACCEPTED: "success",
  REJECTED: "danger",
  EXPIRED: "neutral",
};

export function RequestBadge({ status }: { status: RequestStatus }) {
  return <Badge tone={REQUEST_TONE[status]}>{status.toLowerCase()}</Badge>;
}

const RESERVATION_TONE: Record<ReservationStatus, BadgeTone> = {
  ACTIVE: "success",
  RELEASED: "neutral",
  EXPIRED: "warning",
  CONSUMED: "dark",
};

export function ReservationBadge({ status }: { status: ReservationStatus }) {
  return <Badge tone={RESERVATION_TONE[status]}>{status.toLowerCase()}</Badge>;
}

// ---------- Suitability ----------

export function SuitabilityBadge({ suitability }: { suitability: "SUITABLE" | "PARTIAL" | "UNSUITABLE" }) {
  if (suitability === "SUITABLE") return <Badge tone="success">Suitable</Badge>;
  if (suitability === "PARTIAL") return <Badge tone="warning">Partly suitable</Badge>;
  return <Badge tone="danger">Cannot treat this patient</Badge>;
}

// ---------- Data freshness ----------

/** A count confirmed longer ago than this is shown as unconfirmed rather than as fact. */
const STALE_AFTER_MS = 30 * 60_000;

/**
 * Freshness is a first-class signal here: a confident-looking bed count that was last
 * confirmed an hour ago is exactly the failure the product exists to expose.
 *
 * The staleness flag computed by the API (`stale`) always wins. Only when the caller has
 * none does this fall back to measuring against the browser clock, which useNow supplies
 * after mount — render itself must stay pure, so the absolute time is shown for the first
 * paint instead of a relative age guessed from a clock read during render.
 */
export function FreshnessLabel({
  lastUpdatedAt,
  stale,
  updatedBy,
}: {
  lastUpdatedAt: string;
  stale?: boolean;
  updatedBy?: string;
}) {
  const now = useNow(60_000);
  const isStale = stale ?? (now !== null && now - new Date(lastUpdatedAt).getTime() > STALE_AFTER_MS);
  return (
    <span className={isStale ? "text-xs font-medium text-amber-700" : "text-xs text-muted"}>
      {isStale ? "⚠ unconfirmed · " : ""}
      last confirmed {now === null ? `at ${formatTime(lastUpdatedAt)}` : timeAgo(lastUpdatedAt, now)}
      {updatedBy ? ` by ${updatedBy}` : ""}
    </span>
  );
}
