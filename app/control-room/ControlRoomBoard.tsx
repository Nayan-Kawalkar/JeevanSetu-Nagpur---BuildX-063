"use client";

import { useMemo } from "react";
import { NagpurMap, type MapHospital, type MapPoint } from "@/components/NagpurMap";
import { StatTile } from "@/components/StatTile";
import { Timeline } from "@/components/Timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage, useLive, useNow } from "@/lib/hooks";
import type { Overview } from "@/lib/services/overview";
import { cn, formatTime } from "@/lib/utils";
import { AlertPanel } from "./AlertPanel";
import { BloodPanel } from "./BloodPanel";
import { CapacityTable } from "./CapacityTable";
import { IncidentBoard } from "./IncidentBoard";
import { plural } from "./format";

/**
 * The wall display. One endpoint, polled every three seconds.
 *
 * Everything on this screen comes from a single `/api/overview` snapshot, so the counts, the
 * map, the capacity table and the alerts can never be describing three different moments.
 * The read model already sorts each list; nothing here re-sorts, which is what keeps a board
 * an operator has learned to read from rearranging itself under them every poll.
 *
 * Coordination and decision support only: every figure here was typed in by a person, and the
 * age of that entry is shown next to it.
 */
export function ControlRoomBoard() {
  const { data, error, mutate } = useLive<Overview>("/api/overview");

  if (!data) {
    if (error) {
      return (
        <Card>
          <CardBody className="space-y-3 py-10 text-center">
            <p className="text-base font-semibold text-slate-900">The city board could not be loaded.</p>
            <p className="text-sm text-muted">{errorMessage(error)}</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void mutate();
              }}
            >
              Try again
            </Button>
          </CardBody>
        </Card>
      );
    }
    return (
      <Card>
        <CardBody className="py-12">
          <Spinner label="Loading the city board" />
        </CardBody>
      </Card>
    );
  }

  const { counts } = data;
  const pollFailed = Boolean(error);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <SyncLine generatedAt={data.generatedAt} pollFailed={pollFailed} />
        <p className="text-xs text-muted">
          One request every 3 s · {plural(counts.staleSources, "source")} awaiting reconfirmation
        </p>
      </div>

      {pollFailed && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          <span aria-hidden>▲ </span>
          The last refresh failed ({errorMessage(error)}). You are looking at the snapshot below, not live data.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Active incidents"
          value={counts.active}
          hint={`${counts.closedToday} closed today`}
        />
        <StatTile
          label="Critical"
          value={counts.critical}
          tone={counts.critical > 0 ? "danger" : "neutral"}
          hint={counts.critical > 0 ? "Highest severity, still open" : "None open right now"}
        />
        <StatTile
          label="Awaiting a hospital answer"
          value={counts.unansweredRequests}
          tone={counts.unansweredRequests > 0 ? "warning" : "neutral"}
          hint={`${plural(counts.byStatus.HOSPITAL_REQUESTED, "case")} with no reply yet`}
        />
        <StatTile
          label="En route"
          value={counts.byStatus.AMBULANCE_EN_ROUTE}
          hint={`${plural(counts.ambulancesAvailable, "ambulance")} free`}
        />
      </div>

      <AlertPanel alerts={data.alerts} />

      <div className="grid gap-4 xl:grid-cols-4">
        {/* min-w-0: without it a grid item is at least as wide as its widest child, and the
            tables below would push the whole page sideways on a phone instead of scrolling
            inside their own container. */}
        <div className="min-w-0 space-y-4 xl:col-span-3">
          <CityMap overview={data} />
          <IncidentBoard cases={data.cases} />
          <CapacityTable hospitals={data.hospitals} />
          <BloodPanel bloodBanks={data.bloodBanks} />
        </div>

        <div className="min-w-0 xl:col-span-1">
          <Card className="xl:sticky xl:top-20">
            <CardHeader
              title="Recent activity"
              subtitle="Newest first · the last 25 recorded steps"
              action={<Badge tone="neutral">{data.recentEvents.length}</Badge>}
            />
            <CardBody className="space-y-3">
              <SyncLine generatedAt={data.generatedAt} pollFailed={pollFailed} />
              <div className="max-h-[36rem] overflow-y-auto pr-1 xl:max-h-[48rem]">
                <Timeline events={data.recentEvents} emptyLabel="Nothing has been recorded yet today." />
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------- Map ----------

function CityMap({ overview }: { overview: Overview }) {
  const hospitals = useMemo<MapHospital[]>(
    () =>
      overview.hospitals.map((h) => ({
        id: h.hospitalId,
        name: h.name,
        lat: h.lat,
        lng: h.lng,
        band: h.capacityBand,
        icuAvailable: h.icuAvailable,
        stale: h.stale,
      })),
    [overview.hospitals],
  );

  const bloodBanks = useMemo<MapPoint[]>(
    () => overview.bloodBanks.map((b) => ({ id: b.id, label: b.name, lat: b.lat, lng: b.lng })),
    [overview.bloodBanks],
  );

  const ambulances = useMemo<MapPoint[]>(
    () =>
      overview.ambulances.map((a) => ({
        id: a.id,
        label: `${a.callSign} · ${a.status.toLowerCase().replace(/_/g, " ")}`,
        lat: a.lat,
        lng: a.lng,
      })),
    [overview.ambulances],
  );

  const incidents = useMemo<MapPoint[]>(
    () =>
      overview.cases.map((c) => ({
        id: c.id,
        label: c.id,
        lat: c.lat,
        lng: c.lng,
        critical: c.severity === "CRITICAL",
      })),
    [overview.cases],
  );

  return (
    <Card>
      <CardHeader
        title="City map"
        subtitle={`${plural(hospitals.length, "hospital")} · ${plural(bloodBanks.length, "blood bank")} · ${plural(ambulances.length, "ambulance")} · ${plural(incidents.length, "open incident")}`}
        action={
          <Badge tone={overview.counts.staleSources > 0 ? "warning" : "success"}>
            {overview.counts.staleSources > 0
              ? `${overview.counts.staleSources} unconfirmed`
              : "All sources confirmed"}
          </Badge>
        }
      />
      <CardBody className="p-3">
        <NagpurMap
          hospitals={hospitals}
          bloodBanks={bloodBanks}
          ambulances={ambulances}
          incidents={incidents}
          height={480}
        />
        <p className="mt-2 text-xs text-muted">
          Hospital colour is the capacity band, and a hospital marked ⚠ has not reconfirmed its numbers. Positions
          are straight-line, not driving routes.
        </p>
      </CardBody>
    </Card>
  );
}

// ---------- Is the screen still alive? ----------

/** Anything older than this and the board is probably frozen rather than merely quiet. */
const LAGGING_AFTER_SECONDS = 15;

/**
 * A wall display that has silently stopped polling looks exactly like a calm city, which is
 * the most dangerous thing this screen could do. The age of the snapshot is therefore always
 * on the page. The clock is read through `useNow`, never during render, so the first paint
 * shows the absolute time instead of an age guessed from an unknown clock.
 */
function SyncLine({ generatedAt, pollFailed }: { generatedAt: string; pollFailed: boolean }) {
  const now = useNow(1000);
  const builtAt = Date.parse(generatedAt);
  const seconds =
    now === null || Number.isNaN(builtAt) ? null : Math.max(0, Math.round((now - builtAt) / 1000));
  const lagging = pollFailed || (seconds !== null && seconds > LAGGING_AFTER_SECONDS);

  return (
    <p className={cn("flex items-center gap-2 text-sm font-medium", lagging ? "text-amber-800" : "text-slate-700")}>
      <span
        className={cn("inline-block h-2.5 w-2.5 rounded-full", lagging ? "bg-amber-500" : "bg-emerald-500")}
        aria-hidden
      />
      <span>
        {lagging ? "Screen may be stale · " : "Live · "}
        {seconds === null
          ? `last synced at ${formatTime(generatedAt)}`
          : `last synced ${plural(seconds, "second")} ago`}
      </span>
    </p>
  );
}
