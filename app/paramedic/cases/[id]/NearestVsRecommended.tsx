"use client";

import { ResourceChips } from "@/components/ResourceChips";
import { BLOOD_GROUP_LABEL, RESOURCE_LABEL, type BloodGroup, type Hospital, type RankedHospital } from "@/lib/types";

/**
 * The one comparison the whole product exists to make: the hospital the crew would have driven
 * to, against the hospital that can actually treat this patient.
 *
 * The ranked list already carries this information, but it is spread over several hundred pixels
 * of scrolling — the nearest hospital is usually a poor match, so it sorts low and lands below
 * two or three cards the crew has to scroll past. On a roadside that is not a comparison, it is a
 * reading exercise. This panel puts the two side by side above the list, with the ✕/✓ and the
 * reason in words, so the contrast survives a glance at arm's length in bad light.
 *
 * It states facts already computed by the ranking and never adds a judgement of its own. It is
 * shown only when the nearest hospital genuinely cannot meet the requirement list; when the
 * nearest hospital *is* a good match there is no contrast to draw and the panel stays away.
 */
export function NearestVsRecommended({
  nearest,
  nearestHospital,
  recommended,
  recommendedHospital,
  bloodGroup,
}: {
  nearest: RankedHospital;
  nearestHospital: Hospital;
  recommended: RankedHospital;
  recommendedHospital: Hospital;
  bloodGroup?: BloodGroup;
}) {
  const blockers = nearest.missingCritical.length > 0 ? nearest.missingCritical : nearest.missing;
  const extraMinutes = recommended.etaMinutes - nearest.etaMinutes;
  const bloodLine =
    bloodGroup && recommended.bloodUnitsAvailable !== undefined && recommended.bloodUnitsAvailable > 0
      ? `${recommended.bloodUnitsAvailable} units of ${BLOOD_GROUP_LABEL[bloodGroup]} matched ${
          recommended.bloodDistanceKm ?? 0
        } km away`
      : null;

  return (
    <section
      aria-labelledby="nearest-vs-recommended"
      className="rounded-xl border border-slate-300 bg-slate-50 p-3 sm:p-4"
    >
      <h3 id="nearest-vs-recommended" className="text-sm font-semibold text-slate-900">
        The nearest hospital is not the right one for this patient
      </h3>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <article className="rounded-lg border-2 border-red-300 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-red-800">
            <span aria-hidden>✕</span> Nearest · cannot treat
          </p>
          <p className="mt-1 text-base font-semibold text-slate-900">{nearestHospital.name}</p>
          <p className="text-sm text-muted">
            <span className="font-semibold tabular-nums text-slate-900">{nearest.etaMinutes} min</span> ·{" "}
            {nearest.distanceKm} km by road
          </p>
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted">Missing</p>
          <div className="mt-1">
            <ResourceChips
              requirements={blockers}
              missing={nearest.missing}
              missingCritical={nearest.missingCritical}
              size="sm"
            />
          </div>
        </article>

        <article className="rounded-lg border-2 border-emerald-400 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
            <span aria-hidden>✓</span> Recommended · can treat
          </p>
          <p className="mt-1 text-base font-semibold text-slate-900">{recommendedHospital.name}</p>
          <p className="text-sm text-muted">
            <span className="font-semibold tabular-nums text-slate-900">{recommended.etaMinutes} min</span> ·{" "}
            {recommended.distanceKm} km by road
          </p>
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted">Everything on the list</p>
          <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
            {blockers.map((r) => (
              <li key={r}>
                <span aria-hidden className="text-emerald-700">
                  ✓
                </span>{" "}
                {RESOURCE_LABEL[r]}
              </li>
            ))}
            {bloodLine && (
              <li>
                <span aria-hidden className="text-emerald-700">
                  ✓
                </span>{" "}
                {bloodLine}
              </li>
            )}
          </ul>
        </article>
      </div>

      <p className="mt-3 text-sm font-medium text-slate-800">
        {extraMinutes > 0
          ? `${extraMinutes} min further, and it can take this patient.`
          : "No further away, and it can take this patient."}{" "}
        <span className="font-normal text-muted">
          Both are ranked in full below. The crew decides — this is coordination support, not a clinical
          judgement.
        </span>
      </p>
    </section>
  );
}
