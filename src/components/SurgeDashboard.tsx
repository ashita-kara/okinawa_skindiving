"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SpotDrawer from "@/components/SpotDrawer";
import { Waves, Navigation, Clock, Anchor, MapPin, Info, AlertTriangle } from "lucide-react";
import { DIVE_POINTS, type AreaCategory, type DivePoint } from "@/data/points";
import { calculateUnderwaterSurge, getAngleDiff, type SwellEvaluation } from "@/lib/swellCalc";
import type { MarineResult } from "@/lib/fetchMarineData";

const TABS: ("すべて" | AreaCategory)[] = ["すべて", "南部", "中部", "恩納村", "名護・本部", "国頭・北部", "慶良間"];

const STATUS_STYLE: Record<SwellEvaluation["status"], { badge: string; bar: string; glow: string }> = {
  calm: { badge: "bg-emerald-50 text-emerald-700 ring-emerald-200", bar: "bg-emerald-400", glow: "shadow-emerald-900/5" },
  moderate: { badge: "bg-sky-50 text-sky-700 ring-sky-200", bar: "bg-sky-400", glow: "shadow-sky-900/5" },
  caution: { badge: "bg-amber-50 text-amber-700 ring-amber-200", bar: "bg-amber-400", glow: "shadow-amber-900/10" },
  danger: { badge: "bg-rose-50 text-rose-700 ring-rose-200", bar: "bg-rose-500", glow: "shadow-rose-900/10" },
};

function dirLabel(deg: number) {
  const names = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"];
  return names[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

function formatTime(t?: string) {
  if (!t) return "--";
  const w = ["日", "月", "火", "水", "木", "金", "土"][new Date(t.slice(0, 10) + "T00:00:00Z").getUTCDay()];
  return `${t.slice(5, 7)}/${t.slice(8, 10)}(${w}) ${t.slice(11, 16)}`;
}

/** ポイント開口方位（扇形）と、うねりの来る方向（矢印）のコンパス */
function DirectionCompass({ point, swellDir }: { point: DivePoint; swellDir: number | null }) {
  const r = 34;
  const c = 40;
  const toXY = (deg: number, rad = r) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [c + rad * Math.cos(a), c + rad * Math.sin(a)];
  };
  const w = Math.min(point.openAngleWidth, 179);
  const [x1, y1] = toXY(point.openDirection - w);
  const [x2, y2] = toXY(point.openDirection + w);
  const large = w * 2 > 180 ? 1 : 0;
  const hit = swellDir !== null && getAngleDiff(swellDir, point.openDirection) <= point.openAngleWidth;

  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0" aria-label="うねり向きと開口方位">
      <circle cx={c} cy={c} r={r} className="fill-sky-50 stroke-sky-200" strokeWidth={1} />
      <path d={`M${c},${c} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`} className="fill-teal-300/40 stroke-teal-400/60" strokeWidth={1} />
      {["北", "東", "南", "西"].map((l, i) => {
        const [x, y] = toXY(i * 90, r - 7);
        return (
          <text key={l} x={x} y={y + 2.5} textAnchor="middle" className="fill-slate-400 text-[7px] font-semibold">{l}</text>
        );
      })}
      {swellDir !== null && (() => {
        // 矢印: うねりが来る方角(外側)から中心へ向かう
        const [sx, sy] = toXY(swellDir, r + 2);
        const [ex, ey] = toXY(swellDir, 6);
        return (
          <g className={hit ? "text-rose-500" : "text-sky-700"}>
            <defs>
              <marker id={`ah-${point.id}`} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="currentColor" />
              </marker>
            </defs>
            <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="currentColor" strokeWidth={2.2} markerEnd={`url(#ah-${point.id})`} />
          </g>
        );
      })()}
      <circle cx={c} cy={c} r={2} className="fill-sky-900" />
    </svg>
  );
}

export default function SurgeDashboard({ data }: { data: MarineResult }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("すべて");
  const [hourIdx, setHourIdx] = useState(0);
  const [lowTide, setLowTide] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<DivePoint | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = (p: DivePoint) => {
    setSelectedPoint(p);
    setDrawerOpen(true);
  };
  // 閉じるアニメーション中も内容を保持するため selectedPoint は残す
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const times = useMemo(() => Object.values(data.byPointId)[0]?.time ?? [], [data]);

  // マウント後に現在時刻(JST)へスライダーを合わせる（ハイドレーション不一致回避）
  useEffect(() => {
    const now = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 13);
    const i = times.findIndex((t) => t.slice(0, 13) === now);
    if (i < 0) return;
    const id = requestAnimationFrame(() => setHourIdx(i));
    return () => cancelAnimationFrame(id);
  }, [times]);

  const rows = useMemo(
    () =>
      DIVE_POINTS.filter((p) => tab === "すべて" || p.area === tab).map((p) => {
        const h = data.byPointId[p.id];
        const sh = h?.swellHeight[hourIdx] ?? null;
        const sp = h?.swellPeriod[hourIdx] ?? null;
        const sd = h?.swellDirection[hourIdx] ?? null;
        const wh = h?.waveHeight[hourIdx] ?? null;
        return { p, sh, sp, sd, wh, ev: calculateUnderwaterSurge(sh, sp, sd, p, lowTide), hasData: !!h };
      }),
    [data, tab, hourIdx, lowTide]
  );

  const counts = useMemo(() => {
    const c = { calm: 0, moderate: 0, caution: 0, danger: 0 };
    rows.forEach((r) => c[r.ev.status]++);
    return c;
  }, [rows]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-[#fbf7ef] text-slate-800">
      <header className="relative overflow-hidden px-5 pb-6 pt-10 sm:px-10">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[48rem] -translate-x-1/2 rounded-full bg-sky-200/60 blur-3xl" />
        <div className="relative mx-auto max-w-6xl">
          <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-sky-600">
            <Waves className="h-4 w-4" /> 沖縄スキンダイビング
          </p>
          <h1 className="mt-2 bg-gradient-to-r from-sky-700 via-cyan-600 to-teal-500 bg-clip-text text-3xl font-extrabold text-transparent sm:text-5xl">
            海中うねり（底揺れ）予報
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-500">
            Open-Meteo Marine のうねりデータに、各ポイントの開口方位・リーフ減衰・基準水深の水粒子軌道を掛け合わせ、水中で体が振られる幅を算出します。
          </p>
        </div>
      </header>

      {/* コントロール */}
      <section className="sticky top-0 z-[45] border-y border-sky-100 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl space-y-4 px-5 py-4 sm:px-10">
          <nav className="-mx-1 flex gap-2 overflow-x-auto pb-1" role="tablist">
            {TABS.map((t) => (
              <button
                key={t}
                id={`tab-${t}`}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                  tab === t
                    ? "bg-gradient-to-r from-sky-500 to-teal-400 text-white shadow-md shadow-sky-500/25"
                    : "bg-sky-50 text-slate-600 hover:bg-sky-100 hover:text-sky-800"
                }`}
              >
                {t}
                <span className="ml-1.5 text-xs opacity-60">
                  {t === "すべて" ? DIVE_POINTS.length : DIVE_POINTS.filter((p) => p.area === t).length}
                </span>
              </button>
            ))}
          </nav>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <label htmlFor="time-slider" className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                <Clock className="h-3.5 w-3.5" /> 予報日時
                <span className="font-mono text-base font-semibold text-sky-700">{formatTime(times[hourIdx])}</span>
              </label>
              <input
                id="time-slider"
                type="range"
                min={0}
                max={Math.max(times.length - 1, 0)}
                value={hourIdx}
                onChange={(e) => setHourIdx(Number(e.target.value))}
                className="w-full accent-sky-500"
              />
            </div>
            <button
              id="low-tide-toggle"
              role="switch"
              aria-checked={lowTide}
              onClick={() => setLowTide((v) => !v)}
              className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm ring-1 transition-all ${
                lowTide ? "bg-teal-50 text-teal-700 ring-teal-300" : "bg-white text-slate-600 ring-slate-200 hover:bg-sky-50"
              }`}
            >
              <Anchor className="h-4 w-4" />
              干潮モード（アウターリーフ遮断）
              <span className={`relative h-5 w-9 rounded-full transition-colors ${lowTide ? "bg-teal-400" : "bg-slate-300"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${lowTide ? "left-[18px]" : "left-0.5"}`} />
              </span>
            </button>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {(["calm", "moderate", "caution", "danger"] as const).map((s) => (
              <span key={s} className={`rounded-full px-2.5 py-0.5 ring-1 ${STATUS_STYLE[s].badge}`}>
                {{ calm: "穏やか", moderate: "やや揺れ", caution: "注意", danger: "危険" }[s]} {counts[s]}
              </span>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-10">
        {data.error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-rose-200">
            <AlertTriangle className="h-4 w-4" /> データ取得に失敗しました: {data.error}
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ p, sh, sp, sd, wh, ev, hasData }) => {
            const st = STATUS_STYLE[ev.status];
            return (
              <article
                key={p.id}
                id={`card-${p.id}`}
                role="button"
                tabIndex={0}
                aria-label={`${p.name}${p.subName ? ` ${p.subName}` : ""}の時間別予報を開く`}
                onClick={() => openDrawer(p)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openDrawer(p))}
                className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-3xl border bg-white p-5 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-sky-300 hover:shadow-2xl focus-visible:outline-2 focus-visible:outline-sky-500 ${drawerOpen && selectedPoint?.id === p.id ? "border-sky-400 ring-2 ring-sky-300" : "border-sky-100"} ${st.glow}`}
              >
                <div className={`absolute inset-x-0 top-0 h-1 ${st.bar}`} />
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-1 text-[11px] text-slate-500">
                      <MapPin className="h-3 w-3" /> {p.area}・水深{p.targetDepth}m
                    </p>
                    <h2 className="mt-1 text-base font-bold leading-snug text-slate-800">{p.name}</h2>
                    {p.subName && (
                      <span className="mt-1 inline-block rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                        {p.subName}
                      </span>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${st.badge}`}>{ev.label}</span>
                </div>

                <div className="mt-4 flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-[11px] text-slate-500">海中の振られ幅</p>
                    <p className="font-mono text-5xl font-black tracking-tight text-sky-900">
                      {hasData ? ev.bottomSurgeCm : "--"}
                      <span className="ml-1 text-lg font-semibold text-slate-500">cm</span>
                    </p>
                  </div>
                  <DirectionCompass point={p} swellDir={sd} />
                </div>

                <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                  <div className="rounded-xl bg-sky-50/70 p-2">
                    <dt className="text-slate-500">うねり</dt>
                    <dd className="font-mono font-semibold text-slate-700">{sh?.toFixed(1) ?? "-"}m / {sp?.toFixed(0) ?? "-"}s</dd>
                  </div>
                  <div className="rounded-xl bg-sky-50/70 p-2">
                    <dt className="flex items-center justify-center gap-1 text-slate-500"><Navigation className="h-3 w-3" />向き</dt>
                    <dd className="font-semibold text-slate-700">{sd !== null ? `${dirLabel(sd)}から` : "-"}</dd>
                  </div>
                  <div className="rounded-xl bg-sky-50/70 p-2">
                    <dt className="text-slate-500">実効/波高</dt>
                    <dd className="font-mono font-semibold text-slate-700">{ev.effectiveSwellHeight}/{wh?.toFixed(1) ?? "-"}m</dd>
                  </div>
                </dl>

                <p className="mt-3 text-xs text-slate-600">{ev.advice}</p>

                <p className="mt-auto flex gap-2 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-500">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />
                  {p.note}
                </p>
              </article>
            );
          })}
        </div>

        <footer className="mt-10 text-center text-[11px] text-slate-500">
          Data: Open-Meteo Marine API（1時間キャッシュ）・本予報は目安です。現地の状況を必ず確認してください。
        </footer>
      </main>

      <SpotDrawer
        point={selectedPoint}
        open={drawerOpen}
        hourly={selectedPoint ? data.byPointId[selectedPoint.id] : undefined}
        lowTide={lowTide}
        hourIdx={hourIdx}
        onSelectHour={setHourIdx}
        onClose={closeDrawer}
      />
    </div>
  );
}
