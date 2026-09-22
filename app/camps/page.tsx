import { Suspense } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { CampsBoard } from "./CampsBoard";

export const metadata = {
  title: "Overflow and camps",
  description:
    "Nagpur's capacity tier by tier, whether the city is overflowing, and the control to stand a temporary emergency camp up into the matching pool.",
};

/**
 * Twist 3 — overflow.
 *
 * The heading and the standing caveat are server-rendered so they are in the HTML before any
 * JavaScript runs. Everything that polls, and everything that reads `?unplaced=` from the surge
 * board, lives in the client board below inside a Suspense boundary, which is what
 * `useSearchParams` requires.
 */
export default function CampsPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Overflow and camps</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600 sm:text-base">
          Our matcher ranks the city for one patient at a time, so it always has an answer — and that is exactly
          what hides an overflow, because the best hospital for each patient alone is the same hospital for all of
          them. This board measures the whole city instead, tier by tier, and lets the control room stand a
          temporary camp up when the ladder runs out. A camp joins matching the moment it is created. Coordination
          and decision support only: a human sites, sizes and signs off every camp.
        </p>
      </header>
      <Suspense
        fallback={
          <Card>
            <CardBody className="py-12">
              <Spinner label="Measuring the city" />
            </CardBody>
          </Card>
        }
      >
        <CampsBoard />
      </Suspense>
    </div>
  );
}
