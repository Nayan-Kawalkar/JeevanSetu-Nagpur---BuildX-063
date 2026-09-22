"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { MapHospital, MapPoint } from "@/components/NagpurMap";

/**
 * Google Maps rendering of the same data the SVG map shows.
 *
 * This is the optional upgrade, never the requirement. It needs a Maps JavaScript API key and a
 * working network, and a hackathon venue reliably supplies neither, so every failure path here
 * reports upward and the caller falls back to the dependency-free SVG map. Nothing about the
 * demo may depend on a tile server answering.
 */

export type MapsLoadState = "loading" | "ready" | "failed";

const SCRIPT_ID = "google-maps-js";
const LOAD_TIMEOUT_MS = 8000;

let loadPromise: Promise<void> | null = null;

/** Loads the Maps JS API once per page, and rejects rather than hanging when the network is down. */
function loadMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("server"));
  if (window.google?.maps) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("script error")));
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async`;
    const timer = setTimeout(() => reject(new Error("timeout")), LOAD_TIMEOUT_MS);
    script.addEventListener("load", () => {
      clearTimeout(timer);
      // The script can load and still fail to authorise; google.maps is absent in that case.
      if (window.google?.maps) resolve();
      else reject(new Error("maps unavailable"));
    });
    script.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("script error"));
    });
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loadPromise = null; // allow a later retry
    throw error;
  });

  return loadPromise;
}

const BAND_FILL: Record<MapHospital["band"], string> = {
  GOOD: "#059669",
  TIGHT: "#d97706",
  FULL: "#dc2626",
};

/** An inline SVG pin, so marker styling matches the SVG map exactly and needs no image hosting. */
function pin(fill: string, glyph: string, size: number, stroke = "#ffffff"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
    <rect x="2" y="2" width="20" height="20" rx="5" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
    <text x="12" y="16.5" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="700" fill="#fff">${glyph}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function dot(fill: string, ring: string, glyph: string, size: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9" fill="${fill}" stroke="${ring}" stroke-width="2.5"/>
    <text x="12" y="16" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="700" fill="${ring}">${glyph}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function GoogleNagpurMap({
  apiKey,
  hospitals = [],
  bloodBanks = [],
  ambulances = [],
  incidents = [],
  route,
  className,
  height = 420,
  onLoadStateChange,
}: {
  apiKey: string;
  hospitals?: MapHospital[];
  bloodBanks?: MapPoint[];
  ambulances?: MapPoint[];
  incidents?: MapPoint[];
  route?: { from: { lat: number; lng: number }; to: { lat: number; lng: number }; label?: string };
  className?: string;
  height?: number;
  onLoadStateChange?: (state: MapsLoadState) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const drawnRef = useRef<{ markers: google.maps.Marker[]; lines: google.maps.Polyline[] }>({
    markers: [],
    lines: [],
  });
  const [state, setState] = useState<MapsLoadState>("loading");

  // Load the API once, then create the map.
  useEffect(() => {
    let cancelled = false;
    loadMaps(apiKey)
      .then(() => {
        if (cancelled || !hostRef.current || !window.google?.maps) return;
        mapRef.current ??= new window.google.maps.Map(hostRef.current, {
          center: { lat: 21.11, lng: 79.045 },
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        setState("ready");
        onLoadStateChange?.("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setState("failed");
        onLoadStateChange?.("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey, onLoadStateChange]);

  // Redraw every overlay whenever the data changes. The sets are tens of items, so a full
  // clear-and-redraw is simpler than diffing and costs nothing at this size.
  useEffect(() => {
    const map = mapRef.current;
    if (state !== "ready" || !map || !window.google?.maps) return;
    const maps = window.google.maps;

    for (const m of drawnRef.current.markers) m.setMap(null);
    for (const l of drawnRef.current.lines) l.setMap(null);
    drawnRef.current = { markers: [], lines: [] };

    const bounds = new maps.LatLngBounds();
    const info = new maps.InfoWindow();
    const add = (marker: google.maps.Marker, title: string) => {
      marker.addListener("click", () => {
        info.setContent(`<div style="font:600 13px sans-serif;color:#0f172a">${title}</div>`);
        info.open({ map, anchor: marker });
      });
      drawnRef.current.markers.push(marker);
      const pos = marker.getPosition();
      if (pos) bounds.extend(pos);
    };

    for (const h of hospitals) {
      const primary = h.role === "PRIMARY";
      const unsuitable = h.role === "UNSUITABLE";
      const size = primary ? 42 : 30;
      add(
        new maps.Marker({
          map,
          position: { lat: h.lat, lng: h.lng },
          title: h.name,
          zIndex: primary ? 40 : unsuitable ? 10 : 20,
          opacity: unsuitable ? 0.55 : 1,
          icon: {
            url: pin(BAND_FILL[h.band], "H", size, primary ? "#064e3b" : unsuitable ? "#7f1d1d" : "#ffffff"),
            scaledSize: new maps.Size(size, size),
            anchor: new maps.Point(size / 2, size / 2),
          },
        }),
        `${h.name}${h.stale ? " — unconfirmed numbers" : ""}${unsuitable ? " — cannot treat this patient" : ""}`,
      );
    }

    for (const b of bloodBanks) {
      add(
        new maps.Marker({
          map,
          position: { lat: b.lat, lng: b.lng },
          title: b.label,
          zIndex: 15,
          icon: {
            url: dot("#fecaca", "#b91c1c", "B", 26),
            scaledSize: new maps.Size(26, 26),
            anchor: new maps.Point(13, 13),
          },
        }),
        b.label,
      );
    }

    for (const a of ambulances) {
      add(
        new maps.Marker({
          map,
          position: { lat: a.lat, lng: a.lng },
          title: a.label,
          zIndex: 18,
          icon: {
            url: dot("#1d4ed8", "#ffffff", "A", 24),
            scaledSize: new maps.Size(24, 24),
            anchor: new maps.Point(12, 12),
          },
        }),
        a.label,
      );
    }

    for (const inc of incidents) {
      add(
        new maps.Marker({
          map,
          position: { lat: inc.lat, lng: inc.lng },
          title: inc.label,
          zIndex: 50,
          icon: {
            url: dot("#dc2626", "#ffffff", "!", 34),
            scaledSize: new maps.Size(34, 34),
            anchor: new maps.Point(17, 17),
          },
        }),
        inc.label,
      );
    }

    if (route) {
      const line = new maps.Polyline({
        map,
        path: [route.from, route.to],
        strokeColor: "#059669",
        strokeOpacity: 0,
        zIndex: 30,
        icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeWeight: 4, scale: 3 }, offset: "0", repeat: "16px" }],
      });
      drawnRef.current.lines.push(line);
      bounds.extend(route.from);
      bounds.extend(route.to);
    }

    if (!bounds.isEmpty()) map.fitBounds(bounds, 48);

    return () => {
      info.close();
    };
  }, [state, hospitals, bloodBanks, ambulances, incidents, route]);

  if (state === "failed") return null;

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-slate-100", className)}>
      <div ref={hostRef} style={{ height }} aria-label="Map of the Nagpur demo area" role="img" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-white px-3 py-2 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-emerald-600" aria-hidden />Beds free
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-amber-600" aria-hidden />Tight
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-red-600" aria-hidden />Full
        </span>
        <span className="ml-auto">Google Maps · click a marker for its name</span>
      </div>
    </div>
  );
}
