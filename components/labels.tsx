"use client";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { useNow } from "@/lib/hooks";
import { formatAge, useT } from "@/lib/i18n";
import { formatTime } from "@/lib/utils";
import type { CaseSeverity, CaseStatus, RequestStatus, ReservationStatus } from "@/lib/types";

/**
 * Shared badges. Every public prop here is unchanged — these render inside screens owned by
 * other agents — and the text comes from the dictionary in lib/i18n.
 */

// ---------- Severity ----------

const SEVERITY_TONE: Record<CaseSeverity, BadgeTone> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "info",
  LOW: "neutral",
};

export function SeverityBadge({ severity }: { severity: CaseSeverity }) {
  const t = useT();
  return (
    <Badge tone={SEVERITY_TONE[severity]}>
      {severity === "CRITICAL" && <span className="h-1.5 w-1.5 rounded-full bg-red-600" aria-hidden />}
      {t(`severity.${severity}`)}
    </Badge>
  );
}

// ---------- Case status ----------

/**
 * The English status wording, kept as a plain constant because callers use it outside a React
 * render (sorting, aria strings, tests). Screens should prefer `t("status.<VALUE>")`; the two are
 * kept identical on purpose — lib/i18n/en.ts mirrors this map.
 */
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
  const t = useT();
  return <Badge tone={STATUS_TONE[status]}>{t(`status.${status}`)}</Badge>;
}

// ---------- Request / reservation status ----------

const REQUEST_TONE: Record<RequestStatus, BadgeTone> = {
  PENDING: "warning",
  ACCEPTED: "success",
  REJECTED: "danger",
  EXPIRED: "neutral",
};

export function RequestBadge({ status }: { status: RequestStatus }) {
  const t = useT();
  return <Badge tone={REQUEST_TONE[status]}>{t(`requestStatus.${status}`)}</Badge>;
}

const RESERVATION_TONE: Record<ReservationStatus, BadgeTone> = {
  ACTIVE: "success",
  RELEASED: "neutral",
  EXPIRED: "warning",
  CONSUMED: "dark",
};

export function ReservationBadge({ status }: { status: ReservationStatus }) {
  const t = useT();
  return <Badge tone={RESERVATION_TONE[status]}>{t(`reservationStatus.${status}`)}</Badge>;
}

// ---------- Suitability ----------

export function SuitabilityBadge({ suitability }: { suitability: "SUITABLE" | "PARTIAL" | "UNSUITABLE" }) {
  const t = useT();
  const tone: BadgeTone = suitability === "SUITABLE" ? "success" : suitability === "PARTIAL" ? "warning" : "danger";
  return <Badge tone={tone}>{t(`suitability.${suitability}`)}</Badge>;
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
 *
 * The age is translated too, via formatAge: a Marathi sentence ending in "8 min ago" reads as
 * a half-finished screen, and this label exists to be believed.
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
  const t = useT();
  const isStale = stale ?? (now !== null && now - new Date(lastUpdatedAt).getTime() > STALE_AFTER_MS);
  return (
    <span className={isStale ? "text-xs font-medium text-amber-700" : "text-xs text-muted"}>
      {isStale ? `${t("freshness.unconfirmed")} · ` : ""}
      {now === null
        ? t("freshness.at", { time: formatTime(lastUpdatedAt) })
        : t("freshness.ago", { age: formatAge(t, lastUpdatedAt, now) })}
      {updatedBy ? ` ${t("freshness.by", { name: updatedBy })}` : ""}
    </span>
  );
}
