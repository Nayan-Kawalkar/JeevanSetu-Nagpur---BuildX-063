"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A dependency-free map of the Nagpur demo area.
 *
 * Everything that carries meaning — markers, distance rings, routes, the scale bar — is drawn
 * by this component from real coordinates, so the geometry is ours and always renders. Open
 * street tiles are layered underneath for recognisable context, and they are the only part that
 * needs a network: if they fail, the schematic grid shows through and nothing else changes.
 * That is the point. A venue with no wifi must still get a working map.
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

const PX_PER_KM = VIEW.w / (BBOX.lngMax - BBOX.lngMin) / KM_PER_DEG_LNG;

// ---------------------------------------------------------------- basemap tiles

/**
 * Real street tiles from OpenStreetMap, drawn straight into the SVG as <image> elements.
 *
 * No API key, no billing account and no map library: OSM tiles are open, which is the whole
 * reason they are here. Google Maps needs a key this project does not have, and a map that
 * cannot render is worse than one that renders plainly. If the tiles fail — no network at the
 * venue, OSM unreachable — the grid underneath simply shows through and every marker, ring and
 * distance stays exactly where it was. The basemap is decoration; the geometry is ours.
 *
 * Attribution is not optional. OpenStreetMap's licence requires the credit rendered below.
 */
const TILE_ZOOM = 13;

function lngToTileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * 2 ** z;
}

function latToTileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}

function tileXToLng(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export interface BasemapTile {
  key: string;
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Tiles are Web Mercator and this map is equirectangular. Across 0.18° of latitude at 21°N the
 * two disagree by well under a pixel, so each tile is simply projected by its own corners rather
 * than reprojecting the whole map. At city scale that is exact enough; at country scale it
 * would not be.
 */
function basemapTiles(): BasemapTile[] {
  const z = TILE_ZOOM;
  const x0 = Math.floor(lngToTileX(BBOX.lngMin, z));
  const x1 = Math.floor(lngToTileX(BBOX.lngMax, z));
  const y0 = Math.floor(latToTileY(BBOX.latMax, z));
  const y1 = Math.floor(latToTileY(BBOX.latMin, z));
  const out: BasemapTile[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const topLeft = project(tileYToLat(y, z), tileXToLng(x, z));
      const bottomRight = project(tileYToLat(y + 1, z), tileXToLng(x + 1, z));
      out.push({
        key: `${z}/${x}/${y}`,
        // Subdomain rotation keeps a page load from queueing behind one host's connection limit.
        url: `https://${["a", "b", "c"][(x + y) % 3]}.tile.openstreetmap.org/${z}/${x}/${y}.png`,
        x: topLeft.x,
        y: topLeft.y,
        w: bottomRight.x - topLeft.x,
        h: bottomRight.y - topLeft.y,
      });
    }
  }
  return out;
}

const TILES = basemapTiles();

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

/** Priority order decides who keeps their label when two would collide. */
const ROLE_RANK: Record<string, number> = { PRIMARY: 0, BACKUP: 1, UNSUITABLE: 2, NONE: 3 };

// ---------------------------------------------------------------- label placement

interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface LabelCandidate {
  id: string;
  text: string;
  /** Full text for the accessible tooltip when the drawn text is shortened. */
  title: string;
  anchor: { x: number; y: number };
  /** Half-size of the marker, so the label clears it. */
  gap: number;
  fontSize: number;
  weight: number;
  fill: string;
}

interface PlacedLabel extends LabelCandidate {
  x: number;
  y: number;
  textAnchor: "start" | "end" | "middle";
}

/** SVG has no text metrics before paint, so approximate: 0.55em per character is close for this face. */
function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.55;
}

/** Long hospital names never fit; cut at a word boundary and keep the full name in a tooltip. */
function shorten(name: string, max = 24): string {
  const head = name.split(",")[0];
  if (head.length <= max) return head;
  const cut = head.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 10 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function overlaps(a: Box, b: Box): boolean {
  return !(a.x2 < b.x1 || b.x2 < a.x1 || a.y2 < b.y1 || b.y2 < a.y1);
}

function inView(b: Box): boolean {
  return b.x1 >= 2 && b.x2 <= VIEW.w - 2 && b.y1 >= 2 && b.y2 <= VIEW.h - 2;
}

/**
 * Greedy label placement in priority order: the incident and the recommended hospital
 * get their label first, and anything that cannot be drawn without overlapping is dropped
 * rather than rendered as unreadable overlapping text. Dropped labels still appear on hover.
 */
function placeLabels(candidates: LabelCandidate[], reserved: Box[]): PlacedLabel[] {
  const taken: Box[] = [...reserved];
  const placed: PlacedLabel[] = [];

  for (const c of candidates) {
    const w = textWidth(c.text, c.fontSize);
    const h = c.fontSize * 1.15;
    const { x, y } = c.anchor;
    const options: { x: number; y: number; textAnchor: PlacedLabel["textAnchor"]; box: Box }[] = [
      // right, left, above, below
      { x: x + c.gap, y: y + h * 0.32, textAnchor: "start", box: { x1: x + c.gap, y1: y - h / 2, x2: x + c.gap + w, y2: y + h / 2 } },
      { x: x - c.gap, y: y + h * 0.32, textAnchor: "end", box: { x1: x - c.gap - w, y1: y - h / 2, x2: x - c.gap, y2: y + h / 2 } },
      { x, y: y - c.gap - h * 0.35, textAnchor: "middle", box: { x1: x - w / 2, y1: y - c.gap - h * 1.3, x2: x + w / 2, y2: y - c.gap } },
      { x, y: y + c.gap + h, textAnchor: "middle", box: { x1: x - w / 2, y1: y + c.gap, x2: x + w / 2, y2: y + c.gap + h * 1.3 } },
    ];

    const fit = options.find((o) => inView(o.box) && !taken.some((t) => overlaps(t, o.box)));
    if (!fit) continue;
    taken.push(fit.box);
    placed.push({ ...c, x: fit.x, y: fit.y, textAnchor: fit.textAnchor });
  }
  return placed;
}

// ---------------------------------------------------------------- component

export function NagpurMap({
  hospitals = [],
  bloodBanks = [],
  ambulances = [],
  incidents = [],
  route,
  showLabels = true,
  basemap = true,
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
  /** Draw OpenStreetMap tiles behind the data. Off gives the plain schematic grid. */
  basemap?: boolean;
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

  const labels = useMemo(() => {
    if (!showLabels) return [];
    const candidates: LabelCandidate[] = [];

    for (const inc of incidents) {
      const p = project(inc.lat, inc.lng);
      candidates.push({
        id: inc.id,
        text: shorten(inc.label, 28),
        title: inc.label,
        anchor: p,
        gap: 18,
        fontSize: 15,
        weight: 700,
        fill: "#991b1b",
      });
    }

    const byPriority = [...hospitals].sort(
      (a, b) => (ROLE_RANK[a.role ?? "NONE"] ?? 3) - (ROLE_RANK[b.role ?? "NONE"] ?? 3),
    );
    for (const h of byPriority) {
      const p = project(h.lat, h.lng);
      const isPrimary = h.role === "PRIMARY";
      candidates.push({
        id: h.id,
        text: shorten(h.name) + (h.stale ? " ⚠" : ""),
        title: h.name,
        anchor: p,
        gap: isPrimary ? 28 : 12,
        fontSize: isPrimary ? 16 : 13,
        weight: isPrimary ? 700 : 400,
        fill: h.role === "UNSUITABLE" ? "#991b1b" : "#0f172a",
      });
    }

    for (const b of bloodBanks) {
      const p = project(b.lat, b.lng);
      candidates.push({
        id: b.id,
        text: shorten(b.label, 20),
        title: b.label,
        anchor: p,
        gap: 10,
        fontSize: 12,
        weight: 400,
        fill: "#7f1d1d",
      });
    }

    // Keep labels clear of the scale bar in the bottom-left corner.
    const reserved: Box[] = [{ x1: 10, y1: VIEW.h - 50, x2: 40 + 5 * PX_PER_KM, y2: VIEW.h - 10 }];
    return placeLabels(candidates, reserved);
  }, [hospitals, bloodBanks, incidents, showLabels]);

  const hoveredLabel = useMemo(() => {
    if (!hovered || labels.some((l) => l.id === hovered)) return null;
    const all = [
      ...hospitals.map((h) => ({ id: h.id, label: h.name, lat: h.lat, lng: h.lng, fill: "#0f172a" })),
      ...bloodBanks.map((b) => ({ id: b.id, label: b.label, lat: b.lat, lng: b.lng, fill: "#7f1d1d" })),
      ...ambulances.map((a) => ({ id: a.id, label: a.label, lat: a.lat, lng: a.lng, fill: "#1e3a8a" })),
    ].find((x) => x.id === hovered);
    if (!all) return null;
    const p = project(all.lat, all.lng);
    return { ...all, x: p.x, y: p.y };
  }, [hovered, labels, hospitals, bloodBanks, ambulances]);

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-slate-50", className)}>
      <svg
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        style={{ height, width: "100%" }}
        role="img"
        aria-label={`Map of the Nagpur demo area showing ${hospitals.length} hospitals, ${bloodBanks.length} blood banks and ${incidents.length} incidents`}
      >
        <rect width={VIEW.w} height={VIEW.h} fill="#f1f5f9" />
        {basemap && (
          <g opacity={0.95}>
            {TILES.map((t) => (
              <image
                key={t.key}
                href={t.url}
                x={t.x}
                y={t.y}
                width={t.w}
                height={t.h}
                preserveAspectRatio="none"
                // A tile that 404s or times out just leaves the grid showing; nothing else breaks.
                onError={(e) => e.currentTarget.remove()}
              />
            ))}
          </g>
        )}
        {/* With streets underneath, the schematic grid becomes noise — keep it only as the
            fallback surface when there is no basemap. */}
        {!basemap && grid.map((l, i) => (
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

        {/* --- markers --- */}

        {bloodBanks.map((b) => {
          const p = project(b.lat, b.lng);
          return (
            <g key={b.id} onMouseEnter={() => setHovered(b.id)} onMouseLeave={() => setHovered(null)}>
              <title>{b.label}</title>
              <circle cx={p.x} cy={p.y} r={7} fill="#fecaca" stroke="#b91c1c" strokeWidth={2} />
              <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={9} fontWeight={700} fill="#7f1d1d">
                B
              </text>
            </g>
          );
        })}

        {ambulances.map((a) => {
          const p = project(a.lat, a.lng);
          return (
            <g key={a.id} onMouseEnter={() => setHovered(a.id)} onMouseLeave={() => setHovered(null)}>
              <title>{a.label}</title>
              <rect x={p.x - 7} y={p.y - 5} width={14} height={10} rx={2} fill="#1d4ed8" />
              <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize={7} fontWeight={700} fill="#fff">
                AMB
              </text>
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
              <title>{h.name}</title>
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
            </g>
          );
        })}

        {incidents.map((inc) => {
          const p = project(inc.lat, inc.lng);
          return (
            <g key={inc.id}>
              <title>{inc.label}</title>
              <circle cx={p.x} cy={p.y} r={16} fill="#dc262633" />
              <circle cx={p.x} cy={p.y} r={9} fill="#dc2626" stroke="#fff" strokeWidth={2.5} />
              <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={11} fontWeight={900} fill="#fff">
                !
              </text>
            </g>
          );
        })}

        {/* --- labels, drawn last so they sit above every marker --- */}

        {labels.map((l) => (
          <text
            key={l.id}
            x={l.x}
            y={l.y}
            textAnchor={l.textAnchor}
            fontSize={l.fontSize}
            fontWeight={l.weight}
            fill={l.fill}
            paintOrder="stroke"
            stroke="#f1f5f9"
            strokeWidth={3}
            strokeLinejoin="round"
          >
            <title>{l.title}</title>
            {l.text}
          </text>
        ))}

        {/* A label that lost the collision contest is still reachable by pointing at its marker. */}
        {hoveredLabel && (
          <text
            x={hoveredLabel.x + 14}
            y={hoveredLabel.y - 12}
            fontSize={14}
            fontWeight={700}
            fill={hoveredLabel.fill}
            paintOrder="stroke"
            stroke="#f1f5f9"
            strokeWidth={4}
            strokeLinejoin="round"
          >
            {hoveredLabel.label}
          </text>
        )}

        {/* Scale bar */}
        <g transform={`translate(24, ${VIEW.h - 28})`}>
          <line x1={0} y1={0} x2={5 * PX_PER_KM} y2={0} stroke="#475569" strokeWidth={3} />
          <line x1={0} y1={-5} x2={0} y2={5} stroke="#475569" strokeWidth={3} />
          <line x1={5 * PX_PER_KM} y1={-5} x2={5 * PX_PER_KM} y2={5} stroke="#475569" strokeWidth={3} />
          <text x={(5 * PX_PER_KM) / 2} y={-9} textAnchor="middle" fontSize={13} fill="#475569">
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
        <span className="ml-auto">
          {basemap ? (
            <>
              Streets ©{" "}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                OpenStreetMap
              </a>{" "}
              contributors · point at a marker for its name
            </>
          ) : (
            "Straight-line positions · point at a marker for its full name"
          )}
        </span>
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
