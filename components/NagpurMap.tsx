"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A dependency-free SVG map of the Nagpur demo area.
 *
 * Deliberately not a tile map: a hackathon venue often has no usable network, and a
 * demo that fails because OpenStreetMap tiles did not load is a demo that fails. This
 * projects real coordinates onto a fixed bounding box, so positions and distances are
 * honest even though there is no basemap imagery.
 */

const BBOX = { latMin: 21.02, latMax: 21.2, lngMin: 78.92, lngMax: 79.17 };
const VIEW = { w: 900, h: 700 };
/** Degrees of longitude per km at ~21°N, used only for the scale bar and range rings. */
const KM_PER_DEG_LNG = 104;

function project(lat: number, lng: number) {
  const x = ((lng - BBOX.lngMin) / (BBOX.lngMax - BBOX.lngMin)) * VIEW.w;
  const y = (1 - (lat - BBOX.latMin) / (BBOX.latMax - BBOX.latMin)) * VIEW.h;
  return { x, y };
}

const PX_PER_KM = (VIEW.w / (BBOX.lngMax - BBOX.lngMin)) / KM_PER_DEG_LNG;

export type CapacityBand = "GOOD" | "TIGHT" | "FULL";

export interface MapHospital {
  id: string;
  name: string;
  lat: number;
  lng: number;
  band: CapacityBand;
  icuAvailable?: number;
  stale?: boolean;
  role?: "PRIMARY" | "BACKUP" | "UNSUITABLE" | "NONE";
}

export interface MapPoint {
  id: string;
  label: string;
  lat: number;
  lng: number;
  /** Severity drives the incident marker colour. */
  critical?: boolean;
}

const BAND_FILL: Record<CapacityBand, string> = {
  GOOD: "#059669",
  TIGHT: "#d97706",
  FULL: "#dc2626",
};

export function NagpurMap({
  hospitals = [],
  bloodBanks = [],
  ambulances = [],
  incidents = [],
  route,
  showLabels = true,
  className,
  height = 420,
}: {
  hospitals?: MapHospital[];
  bloodBanks?: MapPoint[];
  ambulances?: MapPoint[];
  incidents?: MapPoint[];
  /** Straight line from an incident to the confirmed hospital. */
  route?: { from: { lat: number; lng: number }; to: { lat: number; lng: number }; label?: string };
  showLabels?: boolean;
  className?: string;
  height?: number;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const grid = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let i = 1; i < 6; i++) {
      lines.push({ x1: (VIEW.w / 6) * i, y1: 0, x2: (VIEW.w / 6) * i, y2: VIEW.h });
      lines.push({ x1: 0, y1: (VIEW.h / 6) * i, x2: VIEW.w, y2: (VIEW.h / 6) * i });
    }
    return lines;
  }, []);

  const primaryIncident = incidents[0];

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-slate-50", className)}>
      <svg
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        style={{ height, width: "100%" }}
        role="img"
        aria-label={`Map of the Nagpur demo area showing ${hospitals.length} hospitals, ${bloodBanks.length} blood banks and ${incidents.length} incidents`}
      >
        <rect width={VIEW.w} height={VIEW.h} fill="#f1f5f9" />
        {grid.map((l, i) => (
          <line key={i} {...l} stroke="#e2e8f0" strokeWidth={1} />
        ))}

        {/* Distance rings around the incident make "nearest is not best" visible at a glance. */}
        {primaryIncident &&
          [5, 10, 15].map((km) => {
            const c = project(primaryIncident.lat, primaryIncident.lng);
            return (
              <g key={km}>
                <circle cx={c.x} cy={c.y} r={km * PX_PER_KM} fill="none" stroke="#cbd5e1" strokeWidth={1} strokeDasharray="4 6" />
                <text x={c.x + km * PX_PER_KM - 4} y={c.y - 6} textAnchor="end" fontSize={13} fill="#94a3b8">
                  {km} km
                </text>
              </g>
            );
          })}

        {route &&
          (() => {
            const a = project(route.from.lat, route.from.lng);
            const b = project(route.to.lat, route.to.lng);
            return (
              <g>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#059669" strokeWidth={4} strokeLinecap="round" strokeDasharray="10 8" />
                {route.label && (
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 10} textAnchor="middle" fontSize={16} fontWeight={700} fill="#047857">
                    {route.label}
                  </text>
                )}
              </g>
            );
          })()}

        {bloodBanks.map((b) => {
          const p = project(b.lat, b.lng);
          return (
            <g key={b.id} onMouseEnter={() => setHovered(b.id)} onMouseLeave={() => setHovered(null)}>
              <circle cx={p.x} cy={p.y} r={7} fill="#fecaca" stroke="#b91c1c" strokeWidth={2} />
              <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={9} fontWeight={700} fill="#7f1d1d">
                B
              </text>
              {(showLabels || hovered === b.id) && (
                <text x={p.x + 11} y={p.y + 4} fontSize={13} fill="#7f1d1d">
                  {b.label}
                </text>
              )}
            </g>
          );
        })}

        {ambulances.map((a) => {
          const p = project(a.lat, a.lng);
          return (
            <g key={a.id}>
              <rect x={p.x - 7} y={p.y - 5} width={14} height={10} rx={2} fill="#1d4ed8" />
              <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize={7} fontWeight={700} fill="#fff">
                AMB
              </text>
              {hovered === a.id && (
                <text x={p.x + 11} y={p.y + 4} fontSize={13} fill="#1e3a8a">
                  {a.label}
                </text>
              )}
            </g>
          );
        })}

        {hospitals.map((h) => {
          const p = project(h.lat, h.lng);
          const isPrimary = h.role === "PRIMARY";
          const isUnsuitable = h.role === "UNSUITABLE";
          const size = isPrimary ? 20 : 15;
          return (
            <g key={h.id} onMouseEnter={() => setHovered(h.id)} onMouseLeave={() => setHovered(null)}>
              {isPrimary && <circle cx={p.x} cy={p.y} r={26} fill="#05966922" stroke="#059669" strokeWidth={2} />}
              <rect
                x={p.x - size / 2}
                y={p.y - size / 2}
                width={size}
                height={size}
                rx={3}
                fill={BAND_FILL[h.band]}
                stroke={isPrimary ? "#064e3b" : isUnsuitable ? "#7f1d1d" : "#ffffff"}
                strokeWidth={isPrimary ? 3 : 2}
                opacity={isUnsuitable ? 0.55 : 1}
              />
              <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">
                H
              </text>
              {isUnsuitable && (
                <line x1={p.x - 11} y1={p.y + 11} x2={p.x + 11} y2={p.y - 11} stroke="#7f1d1d" strokeWidth={2.5} />
              )}
              {(showLabels || hovered === h.id) && (
                <text
                  x={p.x + size / 2 + 5}
                  y={p.y + 4}
                  fontSize={isPrimary ? 16 : 13}
                  fontWeight={isPrimary ? 700 : 400}
                  fill={isUnsuitable ? "#991b1b" : "#0f172a"}
                >
                  {h.name}
                  {h.stale ? " ⚠" : ""}
                </text>
              )}
            </g>
          );
        })}

        {incidents.map((inc) => {
          const p = project(inc.lat, inc.lng);
          return (
            <g key={inc.id}>
              <circle cx={p.x} cy={p.y} r={16} fill="#dc262633" />
              <circle cx={p.x} cy={p.y} r={9} fill="#dc2626" stroke="#fff" strokeWidth={2.5} />
              <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={11} fontWeight={900} fill="#fff">
                !
              </text>
              <text x={p.x + 14} y={p.y - 10} fontSize={15} fontWeight={700} fill="#991b1b">
                {inc.label}
              </text>
            </g>
          );
        })}

        {/* Scale bar */}
        <g transform={`translate(24, ${VIEW.h - 28})`}>
          <line x1={0} y1={0} x2={5 * PX_PER_KM} y2={0} stroke="#475569" strokeWidth={3} />
          <line x1={0} y1={-5} x2={0} y2={5} stroke="#475569" strokeWidth={3} />
          <line x1={5 * PX_PER_KM} y1={-5} x2={5 * PX_PER_KM} y2={5} stroke="#475569" strokeWidth={3} />
          <text x={5 * PX_PER_KM / 2} y={-9} textAnchor="middle" fontSize={13} fill="#475569">
            5 km
          </text>
        </g>
      </svg>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-white px-3 py-2 text-xs text-muted">
        <Legend color="#059669" label="Beds free" />
        <Legend color="#d97706" label="Tight" />
        <Legend color="#dc2626" label="Full" />
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-red-700 bg-red-200" aria-hidden />
          Blood bank
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm bg-blue-700" aria-hidden />
          Ambulance
        </span>
        <span className="ml-auto">Straight-line positions · no basemap required</span>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-3 w-3 rounded-sm" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}
