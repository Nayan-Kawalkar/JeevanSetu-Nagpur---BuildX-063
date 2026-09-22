"use client";

import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage, useLive } from "@/lib/hooks";
import type { EmergencyCase } from "@/lib/types";
import { ActiveCamps } from "./ActiveCamps";
import { CapacityLadder } from "./CapacityLadder";
import { StandUpCampForm } from "./StandUpCampForm";
import type { CampsResponse } from "./types";

/**
 * Twist 3, the overflow board.
 *
 * One polled endpoint carries capacity, the overflow verdict, the standing camps and (when the
 * surge board sent unplaced patients over in `?unplaced=`) where the next camp should go — all
 * four together on purpose, so the banner and the numbers below it can never describe two
 * different moments. Active cases are polled separately only to say how many patients each camp
 * is actually holding.
 */
export function CampsBoard() {
  const params = useSearchParams();
  const unplaced = params.get("unplaced")?.trim() ?? "";
  const url = unplaced === "" ? "/api/camps" : `/api/camps?unplaced=${encodeURIComponent(unplaced)}`;

  const { data, error, mutate } = useLive<CampsResponse>(url);
  const cases = useLive<{ cases: EmergencyCase[] }>("/api/cases?active=true");

  if (!data) {
    if (error) {
      return (
        <Card>
          <CardBody className="space-y-3 py-10 text-center">
            <p className="text-base font-semibold text-slate-900">The capacity board could not be loaded.</p>
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
          <Spinner label="Measuring the city" />
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The last refresh failed, so these figures are the previous ones. {errorMessage(error)}
        </p>
      )}
      <CapacityLadder capacity={data.cityCapacity} overflow={data.overflow} campCount={data.camps.length} />
      <div className="grid gap-4 lg:grid-cols-2">
        <StandUpCampForm suggestion={data.suggestion} />
        <ActiveCamps camps={data.camps} cases={cases.data?.cases ?? []} />
      </div>
    </div>
  );
}
