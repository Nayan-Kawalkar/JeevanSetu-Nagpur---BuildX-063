"use client";

import { useState } from "react";
import { HospitalRankCard } from "@/components/HospitalRankCard";
import { MapView, type MapHospital, type MapPoint } from "@/components/MapView";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { send, useLive } from "@/lib/hooks";
import {
  ACTIVE_STATUSES,
  type EmergencyCase,
  type Hospital,
  type HospitalRequest,
  type MatchResult,
  type RankedHospital,
} from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { NearestVsRecommended } from "./NearestVsRecommended";
import { Notice } from "./Notice";
import { capacityBand } from "./format";
import type { BloodBankList, CreateRequestResponse, MatchPayload } from "./types";
import { useAction } from "./useAction";

/** A double tap must never open two requests, so the key is derived, not random. */
function idempotencyKeyFor(caseId: string, hospitalId: string): string {
  return `case-${caseId}-hospital-${hospitalId}`;
}

/** How the map should draw one ranked hospital. The confirmed destination always leads. */
function mapRoleFor(
  hospitalId: string,
  ranked: RankedHospital,
  match: MatchResult,
  confirmedHospitalId?: string,
): MapHospital["role"] {
  if (confirmedHospitalId === hospitalId) return "PRIMARY";
  if (ranked.suitability === "UNSUITABLE") return "UNSUITABLE";
  if (confirmedHospitalId === undefined && match.primaryHospitalId === hospitalId) return "PRIMARY";
  if (match.backupHospitalId === hospitalId) return "BACKUP";
  return "NONE";
}

/**
 * The recommendation, and every reason behind it.
 *
 * Two endpoints back this panel on purpose. The button POSTs — a deliberate decision, recorded
 * once in the case history — while the screen then polls the GET, which recomputes the same
 * ranking on the beds that exist right now and writes nothing. That is what lets a crew watch a
 * bed count change on the roadside without filling the timeline with matching events nobody
 * asked for.
 *
 * Hospitals that cannot treat this patient are listed, not hidden: the point of the product is
 * that the nearest hospital is often the wrong one, and a crew can only trust that claim if
 * they can see the hospital being ruled out.
 */
export function HospitalMatching({
  emergencyCase,
  confirmedHospital,
  pendingRequest,
}: {
  emergencyCase: EmergencyCase;
  confirmedHospital?: Hospital;
  pendingRequest?: HospitalRequest;
}) {
  const caseId = emergencyCase.id;
  const encodedId = encodeURIComponent(caseId);
  const active = ACTIVE_STATUSES.includes(emergencyCase.status);

  const { busy, error, run } = useAction();
  /** The POST's own answer, kept so the ranking is on screen before the first poll lands. */
  const [seed, setSeed] = useState<MatchPayload | null>(null);
  const [replayNote, setReplayNote] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<boolean | null>(null);

  const hasMatch = Boolean(emergencyCase.lastMatch) || seed !== null;
  const pollUrl = active && hasMatch ? `/api/cases/${encodedId}/match` : null;
  const live = useLive<MatchPayload>(pollUrl);
  const banks = useLive<BloodBankList>("/api/bloodbanks", { refreshInterval: 0, revalidateOnFocus: false });

  const payload = live.data ?? seed;
  const refreshing = pollUrl !== null && live.data !== undefined;
  const matching = busy === "match";

  const findHospitals = async () => {
    setReplayNote(null);
    const result = await run("match", () => send<MatchPayload>(`/api/cases/${encodedId}/match`, "POST"));
    if (result) setSeed(result);
  };

  const sendRequest = async (hospitalId: string) => {
    setReplayNote(null);
    const result = await run(`request-${hospitalId}`, () =>
      send<CreateRequestResponse>("/api/requests", "POST", {
        caseId,
        hospitalId,
        idempotencyKey: idempotencyKeyFor(caseId, hospitalId),
      }),
    );
    if (result && result.request.status !== "PENDING") {
      // The stable key means a repeat tap returns the request that already exists. If that one
      // has already been answered, nothing new was sent and the crew must be told so.
      setReplayNote(
        `This hospital has already answered for this case (${result.request.status.toLowerCase()}). Nothing new was sent — choose another hospital.`,
      );
    }
  };

  const requestsBlocked = Boolean(pendingRequest) || Boolean(emergencyCase.hospitalId) || !active;
  const showList = expanded ?? !emergencyCase.hospitalId;

  return (
    <Card>
      <CardHeader
        title="Which hospital can actually treat this patient"
        subtitle="The ranking weighs what each hospital can provide, what is free right now, travel time, and how recently each number was confirmed. It is decision support — the crew decides."
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => void findHospitals()}
            loading={matching}
            disabled={!active}
          >
            {hasMatch ? "Re-check hospitals" : "Find hospitals"}
          </Button>
          {!active ? (
            <span className="text-sm text-muted">This case is {emergencyCase.status.toLowerCase().replace(/_/g, " ")}; matching is closed.</span>
          ) : payload ? (
            <span className="text-sm text-muted">
              {refreshing ? "Bed counts refresh every 3 seconds." : `Ranked at ${formatTime(payload.match.at)}.`}
            </span>
          ) : null}
        </div>

        {error && <Notice tone="error">{error}</Notice>}
        {replayNote && <Notice tone="warning">{replayNote}</Notice>}
        {live.error !== undefined && pollUrl !== null && payload && (
          <Notice tone="warning">
            The live bed counts stopped updating. The ranking below is from {formatTime(payload.match.at)}.
          </Notice>
        )}
        {payload && pollUrl === null && (
          <Notice tone="info">
            This ranking is no longer being refreshed. The numbers are as of {formatTime(payload.match.at)}.
          </Notice>
        )}
        {pendingRequest && (
          <Notice tone="info">
            A request is already out for this case. Wait for that answer or let it expire before asking another
            hospital.
          </Notice>
        )}

        {!payload &&
          (matching || (pollUrl !== null && live.isLoading) ? (
            <div className="py-6">
              <Spinner label="Ranking hospitals" />
            </div>
          ) : (
            <EmptyState
              title="No hospitals ranked yet"
              description="Press Find hospitals to rank every hospital in the demo area against this patient's requirements, the beds free right now and the travel time."
            />
          ))}

        {payload && (
          <MatchBody
            payload={payload}
            emergencyCase={emergencyCase}
            confirmedHospital={confirmedHospital}
            bankNames={new Map((banks.data?.bloodBanks ?? []).map((bank) => [bank.id, bank.name]))}
            bankPoints={banks.data?.bloodBanks ?? []}
            showList={showList}
            onToggleList={() => setExpanded(!showList)}
            requestsBlocked={requestsBlocked}
            busy={busy}
            onRequest={(hospitalId) => void sendRequest(hospitalId)}
          />
        )}
      </CardBody>
    </Card>
  );
}

function MatchBody({
  payload,
  emergencyCase,
  confirmedHospital,
  bankNames,
  bankPoints,
  showList,
  onToggleList,
  requestsBlocked,
  busy,
  onRequest,
}: {
  payload: MatchPayload;
  emergencyCase: EmergencyCase;
  confirmedHospital?: Hospital;
  bankNames: Map<string, string>;
  bankPoints: BloodBankList["bloodBanks"];
  showList: boolean;
  onToggleList: () => void;
  requestsBlocked: boolean;
  busy: string | null;
  onRequest: (hospitalId: string) => void;
}) {
  const { match, hospitals } = payload;
  const suitable = match.ranked.filter((r) => r.suitability !== "UNSUITABLE");
  // Nearest first inside the ruled-out group, not best-scoring first. The crew's question here is
  // never "which of these is least bad" — it is "why am I not driving to the one down the road",
  // and that hospital has to be the first one they meet.
  const unsuitable = match.ranked
    .filter((r) => r.suitability === "UNSUITABLE")
    .sort((a, b) => a.etaMinutes - b.etaMinutes || a.distanceKm - b.distanceKm);

  /** The hospital the crew would have driven to without this screen. */
  const nearest = match.ranked.reduce<RankedHospital | undefined>(
    (best, r) => (best === undefined || r.etaMinutes < best.etaMinutes ? r : best),
    undefined,
  );
  const recommended = match.ranked.find((r) => r.hospitalId === match.primaryHospitalId);
  const nearestHospital = nearest ? hospitals[nearest.hospitalId] : undefined;
  const recommendedHospital = recommended ? hospitals[recommended.hospitalId] : undefined;
  /** Only worth drawing when the nearest hospital really is the wrong one. */
  const contrast =
    nearest && nearestHospital && recommended && recommendedHospital &&
    nearest.suitability === "UNSUITABLE" &&
    nearest.hospitalId !== recommended.hospitalId
      ? { nearest, nearestHospital, recommended, recommendedHospital }
      : undefined;

  const mapHospitals = match.ranked.flatMap<MapHospital>((ranked) => {
    const hospital = hospitals[ranked.hospitalId];
    if (!hospital) return [];
    return [
      {
        id: hospital.id,
        name: hospital.name,
        lat: hospital.lat,
        lng: hospital.lng,
        band: capacityBand(hospital.resources.ICU.available),
        icuAvailable: hospital.resources.ICU.available,
        stale: ranked.stale,
        role: mapRoleFor(hospital.id, ranked, match, confirmedHospital?.id),
      },
    ];
  });

  const usedBankIds = new Set(match.ranked.flatMap((r) => (r.bloodBankId ? [r.bloodBankId] : [])));
  const mapBanks: MapPoint[] = bankPoints
    .filter((bank) => usedBankIds.has(bank.id))
    .map((bank) => ({ id: bank.id, label: bank.name, lat: bank.lat, lng: bank.lng }));

  const incident: MapPoint = {
    id: emergencyCase.id,
    label: emergencyCase.locationLabel,
    lat: emergencyCase.lat,
    lng: emergencyCase.lng,
    critical: emergencyCase.severity === "CRITICAL",
  };

  const confirmedEta = confirmedHospital
    ? match.ranked.find((r) => r.hospitalId === confirmedHospital.id)?.etaMinutes
    : undefined;

  const renderCard = (ranked: RankedHospital) => {
    const hospital = hospitals[ranked.hospitalId];
    if (!hospital) return null;
    const role =
      match.primaryHospitalId === hospital.id
        ? ("PRIMARY" as const)
        : match.backupHospitalId === hospital.id
          ? ("BACKUP" as const)
          : undefined;
    return (
      <li key={hospital.id}>
        {contrast?.nearest.hospitalId === hospital.id && (
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-red-800">
            <span aria-hidden>➜</span> Nearest hospital — this is the one the crew would have driven to
          </p>
        )}
        <HospitalRankCard
          ranked={ranked}
          hospital={hospital}
          bloodBankName={ranked.bloodBankId ? bankNames.get(ranked.bloodBankId) : undefined}
          bloodGroup={emergencyCase.bloodGroup}
          role={role}
          requesting={busy === `request-${hospital.id}`}
          disabled={requestsBlocked || busy !== null}
          onRequest={() => onRequest(hospital.id)}
        />
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <MapView
        hospitals={mapHospitals}
        bloodBanks={mapBanks}
        incidents={[incident]}
        route={
          confirmedHospital
            ? {
                from: { lat: emergencyCase.lat, lng: emergencyCase.lng },
                to: { lat: confirmedHospital.lat, lng: confirmedHospital.lng },
                label: confirmedEta === undefined ? confirmedHospital.name : `${confirmedEta} min`,
              }
            : undefined
        }
        height={340}
      />

      {contrast && (
        <NearestVsRecommended
          nearest={contrast.nearest}
          nearestHospital={contrast.nearestHospital}
          recommended={contrast.recommended}
          recommendedHospital={contrast.recommendedHospital}
          bloodGroup={emergencyCase.bloodGroup}
        />
      )}

      {emergencyCase.hospitalId && (
        <Button variant="secondary" onClick={onToggleList} aria-expanded={showList}>
          {showList ? "Hide the ranking" : `Show all ${match.ranked.length} ranked hospitals`}
        </Button>
      )}

      {showList && (
        <>
          {suitable.length === 0 ? (
            <Notice tone="warning">
              No hospital on this list can currently provide everything this patient needs. Check the
              requirements above, or call the control room.
            </Notice>
          ) : (
            <ul className="space-y-3">{suitable.map(renderCard)}</ul>
          )}

          {unsuitable.length > 0 && (
            <section aria-labelledby="unsuitable-heading" className="space-y-3">
              <div className="flex items-center gap-3 pt-2">
                <span className="h-px flex-1 bg-red-200" aria-hidden />
                <h3 id="unsuitable-heading" className="text-sm font-semibold text-red-800">
                  ✕ These cannot treat this patient
                </h3>
                <span className="h-px flex-1 bg-red-200" aria-hidden />
              </div>
              <p className="text-sm text-muted">
                Shown, not hidden — one of these is usually the nearest hospital. Their request buttons are
                switched off.
              </p>
              <ul className="space-y-3">{unsuitable.map(renderCard)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
