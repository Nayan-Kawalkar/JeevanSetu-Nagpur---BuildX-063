"use client";

import { useCallback, useState } from "react";
import { NagpurMap, type MapHospital, type MapPoint } from "@/components/NagpurMap";
import { GoogleNagpurMap, type MapsLoadState } from "@/components/GoogleNagpurMap";

/**
 * The map every screen actually uses.
 *
 * Google Maps when a Maps JavaScript API key is configured and the tiles actually load;
 * the dependency-free SVG map otherwise. The fallback is not a degraded mode to apologise
 * for, it is the guarantee: a venue with no network, an unpaid billing account or a
 * misconfigured key must not be able to break the demo. Failure is silent and automatic.
 */

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();

export type { MapHospital, MapPoint };

export function MapView(props: {
  hospitals?: MapHospital[];
  bloodBanks?: MapPoint[];
  ambulances?: MapPoint[];
  incidents?: MapPoint[];
  route?: { from: { lat: number; lng: number }; to: { lat: number; lng: number }; label?: string };
  showLabels?: boolean;
  className?: string;
  height?: number;
}) {
  const [mapsState, setMapsState] = useState<MapsLoadState>("loading");
  const handleState = useCallback((state: MapsLoadState) => setMapsState(state), []);

  const useGoogle = Boolean(API_KEY) && mapsState !== "failed";

  if (useGoogle && API_KEY) {
    return (
      <>
        <GoogleNagpurMap {...props} apiKey={API_KEY} onLoadStateChange={handleState} />
        {/* Until Google reports ready, the SVG map is already on screen, so a slow or dead
            network shows real data immediately rather than an empty grey rectangle. */}
        {mapsState !== "ready" && <NagpurMap {...props} />}
      </>
    );
  }

  return <NagpurMap {...props} />;
}
