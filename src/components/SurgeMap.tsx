"use client";

/**
 * 地図表示（Leaflet）。
 * ⚠ window に依存するため、必ず next/dynamic の { ssr: false } 経由で読み込むこと。
 */
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { DivePoint } from "@/data/points";
import type { SwellEvaluation } from "@/lib/swellCalc";

export interface MapItem {
  p: DivePoint;
  ev: SwellEvaluation;
  hasData: boolean;
}

const PIN_COLOR: Record<SwellEvaluation["status"], string> = {
  calm: "#10b981",
  moderate: "#38bdf8",
  caution: "#f59e0b",
  danger: "#f43f5e",
};

function pinIcon(item: MapItem, selected: boolean) {
  const color = PIN_COLOR[item.ev.status];
  const cm = item.hasData ? String(item.ev.bottomSurgeCm) : "-";
  const size = selected ? 40 : 34;
  const alert = item.ev.currentAlerts.length
    ? `<span style="position:absolute;top:-4px;right:-4px;width:14px;height:14px;border-radius:9999px;background:#fbbf24;border:2px solid #fff;font-size:9px;line-height:10px;text-align:center;color:#78350f;font-weight:900">!</span>`
    : "";
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="position:relative;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 4px 12px rgba(15,42,61,.35);display:flex;align-items:center;justify-content:center;color:#fff;font:800 ${selected ? 14 : 12}px/1 ui-monospace,monospace;${selected ? "outline:3px solid #0369a1;" : ""}">${cm}${alert}</div>`,
  });
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  const key = positions.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (positions.length === 0) return;
    map.fitBounds(L.latLngBounds(positions), { padding: [36, 36], maxZoom: 12 });
    const id = setTimeout(() => map.invalidateSize(), 50);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

export default function SurgeMap({
  items,
  selectedId,
  onSelect,
}: {
  items: MapItem[];
  selectedId?: string;
  onSelect: (p: DivePoint) => void;
}) {
  const posList = useMemo(
    () => items.map((it) => [it.p.lat, it.p.lon] as [number, number]),
    [items]
  );

  return (
    <div className="relative isolate z-0 overflow-hidden rounded-3xl border border-sky-100 shadow-xl">
      <MapContainer
        center={[26.45, 127.75]}
        zoom={9}
        scrollWheelZoom
        className="h-[62vh] w-full md:h-[68vh]"
        attributionControl
      >
        <TileLayer
          attribution='<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>'
          url="https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"
          minZoom={5}
          maxZoom={18}
        />
        <FitBounds positions={posList} />
        {items.map((it) => (
          <Marker
            key={it.p.id}
            position={[it.p.lat, it.p.lon]}
            icon={pinIcon(it, it.p.id === selectedId)}
            eventHandlers={{ click: () => onSelect(it.p) }}
            keyboard
            title={`${it.p.name}${it.p.subName ? ` ${it.p.subName}` : ""}`}
          >
            <Tooltip direction="top" offset={[0, -16]}>
              <span className="font-bold">{it.p.name}</span>
              {it.p.subName && <span className="ml-1 text-sky-700">{it.p.subName}</span>}
              <br />
              振られ幅 {it.hasData ? `${it.ev.bottomSurgeCm}cm` : "-"}・{it.ev.label}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>

      {/* 凡例 */}
      <div className="pointer-events-none absolute bottom-6 left-3 z-[1000] rounded-xl bg-white/90 px-3 py-2 text-[11px] text-slate-600 shadow-md backdrop-blur">
        <p className="mb-1 font-bold text-slate-700">ピン内の数字＝振られ幅(cm)</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {(
            [
              ["calm", "穏やか"],
              ["moderate", "やや揺れ"],
              ["caution", "注意"],
              ["danger", "危険"],
            ] as const
          ).map(([s, l]) => (
            <span key={s} className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIN_COLOR[s] }} />
              {l}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="flex h-3 w-3 items-center justify-center rounded-full bg-amber-400 text-[8px] font-black text-amber-900">!</span>
            離岸流注意
          </span>
        </div>
      </div>
    </div>
  );
}
