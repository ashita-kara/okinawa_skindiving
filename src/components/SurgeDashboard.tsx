"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import SpotDrawer from "@/components/SpotDrawer";
import TidePanel from "@/components/TidePanel";
import {
  Waves, Clock, Anchor, MapPin, Info, AlertTriangle, Heart, ChevronUp, ChevronDown,
  LayoutGrid, Map as MapIcon, Moon,
} from "lucide-react";
import { DIVE_POINTS, type AreaCategory, type DivePoint } from "@/data/points";
import { calculateUnderwaterSurge, getAngleDiff, type SwellEvaluation } from "@/lib/swellCalc";
import type { MarineResult } from "@/lib/fetchMarineData";
import { getTideInput, moonEmoji, type TideData } from "@/lib/tideCalc";

// Leaflet は window 依存のため SSR 無効で読み込む（SSRクラッシュ防止）
const SurgeMap = dynamic(() => import("@/components/SurgeMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[62vh] items-center justify-center rounded-3xl bg-sky-50 text-sm text-sky-700 md:h-[68vh]">
      地図を読み込み中…
    </div>
  ),
});

type Tab = "すべて" | "お気に入り" | AreaCategory;
type View = "list" | "map" | "tide";

const TABS: Tab[] = ["すべて", "お気に入り", "南部", "中部", "恩納村", "名護・本部", "国頭・北部", "慶良間"];
const FAV_KEY = "okinawa-skindiving:favorites:v1";

const STATUS_STYLE: Record<SwellEvaluation["status"], { badge: string; bar: string; glow: string }> = {
  calm: { badge: "bg-emerald-50 text-emerald-700 ring-emerald-200", bar: "bg-emerald-400", glow: "shadow-emerald-900/5" },
  moderate: { badge: "bg-sky-50 text-sky-700 ring-sky-200", bar: "bg-sky-400", glow: "shadow-sky-900/5" },
  caution: { badge: "bg-amber-50 text-amber-700 ring-amber-200", bar: "bg-amber-400", glow: "shadow-amber-900/10" },
  danger: { badge: "bg-rose-50 text-rose-700 ring-rose-200", bar: "bg-rose-500", glow: "shadow-rose-900/10" },
};

/** 五十音順（同名ポイントは元の並び＝プール番号順を維持） */
const POINTS_BY_YOMI: DivePoint[] = DIVE_POINTS.map((p, i) => ({ p, i }))
  .sort((a, b) => a.p.yomi.localeCompare(b.p.yomi, "ja") || a.i - b.i)
  .map(({ p }) => p);
const POINT_BY_ID = new Map(DIVE_POINTS.map((p) => [p.id, p]));

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
    // サーバー/ブラウザ間の浮動小数点の末尾差でハイドレーション不一致にならないよう丸める
    return [Math.round((c + rad * Math.cos(a)) * 100) / 100, Math.round((c + rad * Math.sin(a)) * 100) / 100];
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

export default function SurgeDashboard({ data, tide }: { data: MarineResult; tide: TideData }) {
  const [tab, setTab] = useState<Tab>("すべて");
  const [view, setView] = useState<View>("list");
  const [hourIdx, setHourIdx] = useState(0);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<DivePoint | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback((p: DivePoint) => {
    setSelectedPoint(p);
    setDrawerOpen(true);
  }, []);
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

  // お気に入り: Hydration Error 防止のため、マウント後に localStorage から反映
  useEffect(() => {
    let saved: string[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]");
      if (Array.isArray(raw)) saved = raw.filter((id): id is string => typeof id === "string" && POINT_BY_ID.has(id));
    } catch {
      /* 破損データは無視 */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- マウント後の localStorage 反映（意図的）
    setFavorites(saved);
  }, []);

  const saveFavorites = (next: string[]) => {
    setFavorites(next);
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
    } catch {
      /* プライベートモード等で保存不可でも動作継続 */
    }
  };
  const toggleFavorite = (id: string) =>
    saveFavorites(favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id]);
  const moveFavorite = (id: string, dir: -1 | 1) => {
    const i = favorites.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= favorites.length) return;
    const next = [...favorites];
    [next[i], next[j]] = [next[j], next[i]];
    saveFavorites(next);
  };

  const currentTime = times[hourIdx];
  const tideInput = useMemo(() => getTideInput(tide, currentTime), [tide, currentTime]);
  const tideDay = currentTime ? tide.days[currentTime.slice(0, 10)] : undefined;

  const visiblePoints = useMemo<DivePoint[]>(() => {
    if (tab === "お気に入り") return favorites.map((id) => POINT_BY_ID.get(id)).filter((p): p is DivePoint => !!p);
    return POINTS_BY_YOMI.filter((p) => tab === "すべて" || p.area === tab);
  }, [tab, favorites]);

  const rows = useMemo(
    () =>
      visiblePoints.map((p) => {
        const h = data.byPointId[p.id];
        const sh = h?.swellHeight[hourIdx] ?? null;
        const sp = h?.swellPeriod[hourIdx] ?? null;
        const sd = h?.swellDirection[hourIdx] ?? null;
        const wh = h?.waveHeight[hourIdx] ?? null;
        return { p, sh, sp, sd, wh, ev: calculateUnderwaterSurge(sh, sp, sd, p, tideInput), hasData: !!h };
      }),
    [data, visiblePoints, hourIdx, tideInput]
  );

  const counts = useMemo(() => {
    const c = { calm: 0, moderate: 0, caution: 0, danger: 0 };
    rows.forEach((r) => c[r.ev.status]++);
    return c;
  }, [rows]);

  const tabCount = (t: Tab) =>
    t === "すべて" ? DIVE_POINTS.length : t === "お気に入り" ? favorites.length : DIVE_POINTS.filter((p) => p.area === t).length;

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
            Open-Meteo Marine のうねりデータに、各ポイントの開口方位・リーフ減衰・基準水深の水粒子軌道と那覇の潮位を掛け合わせ、水中で体が振られる幅を算出します。
          </p>
        </div>
      </header>

      {/* コントロール */}
      <section className="sticky top-0 z-[45] border-y border-sky-100 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl space-y-3 px-5 py-3 sm:px-10 md:space-y-4 md:py-4">
          {/* 表示切替 */}
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex rounded-full bg-sky-50 p-1 ring-1 ring-sky-100" role="tablist" aria-label="表示切替">
              {(
                [
                  ["list", "リスト", LayoutGrid],
                  ["map", "マップ", MapIcon],
                  ["tide", "潮汐", Moon],
                ] as const
              ).map(([v, label, Icon]) => (
                <button
                  key={v}
                  id={`view-${v}`}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                    view === v ? "bg-white text-sky-700 shadow-sm ring-1 ring-sky-200" : "text-slate-500 hover:text-sky-700"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
            {tideInput.tideCm !== null && (
              <button
                id="tide-chip"
                onClick={() => setView("tide")}
                className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs text-slate-600 ring-1 ring-slate-200 transition hover:bg-sky-50"
                title="潮汐画面を開く"
              >
                <span className="text-sm">{tideDay ? moonEmoji(tideDay.moonAge) : "🌊"}</span>
                <span className="hidden sm:inline">{tide.station}</span>
                <b className="font-mono text-sky-800">{tideInput.tideCm}cm</b>
                {tideInput.deltaCm !== null && (
                  <span className={tideInput.deltaCm < 0 ? "text-amber-600" : "text-sky-600"}>
                    {tideInput.deltaCm > 0 ? "↑上げ" : tideInput.deltaCm < 0 ? "↓下げ" : "→"}
                  </span>
                )}
                {tideDay && <span className="font-semibold text-slate-700">{tideDay.tideName}</span>}
              </button>
            )}
          </div>

          {view !== "tide" && (
            <nav className="-mx-1 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="エリア">
              {TABS.map((t) => (
                <button
                  key={t}
                  id={`tab-${t}`}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`flex items-center whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                    tab === t
                      ? "bg-gradient-to-r from-sky-500 to-teal-400 text-white shadow-md shadow-sky-500/25"
                      : t === "お気に入り"
                        ? "bg-rose-50 text-rose-600 hover:bg-rose-100"
                        : "bg-sky-50 text-slate-600 hover:bg-sky-100 hover:text-sky-800"
                  }`}
                >
                  {t === "お気に入り" && <Heart className={`mr-1 h-3.5 w-3.5 ${tab === t ? "fill-white" : "fill-rose-500 text-rose-500"}`} />}
                  {t}
                  <span className="ml-1.5 text-xs opacity-60">{tabCount(t)}</span>
                </button>
              ))}
            </nav>
          )}

          <div>
            <label htmlFor="time-slider" className="mb-1 flex items-center gap-2 text-xs text-slate-500">
              <Clock className="h-3.5 w-3.5" /> 予報日時
              <span className="font-mono text-base font-semibold text-sky-700">{formatTime(currentTime)}</span>
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

          {view !== "tide" && (
            <div className="flex flex-wrap gap-2 text-xs">
              {(["calm", "moderate", "caution", "danger"] as const).map((s) => (
                <span key={s} className={`rounded-full px-2.5 py-0.5 ring-1 ${STATUS_STYLE[s].badge}`}>
                  {{ calm: "穏やか", moderate: "やや揺れ", caution: "注意", danger: "危険" }[s]} {counts[s]}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-10">
        {data.error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-rose-200">
            <AlertTriangle className="h-4 w-4" /> データ取得に失敗しました: {data.error}
          </div>
        )}
        {tide.error && view !== "tide" && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">
            <AlertTriangle className="h-4 w-4" /> 潮位データを取得できなかったため、干潮リーフ遮断と離岸流の判定は行っていません。
          </div>
        )}

        {view === "tide" ? (
          <TidePanel tide={tide} times={times} hourIdx={hourIdx} onSelectHour={setHourIdx} />
        ) : tab === "お気に入り" && rows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-rose-200 bg-white/70 p-10 text-center text-sm text-slate-500">
            <Heart className="mx-auto mb-2 h-8 w-8 text-rose-300" />
            お気に入りはまだありません。<br />
            各スポットカードの <Heart className="inline h-3.5 w-3.5 text-rose-500" /> をタップすると、ここに登録されます。
          </div>
        ) : view === "map" ? (
          <SurgeMap
            items={rows}
            selectedId={drawerOpen ? selectedPoint?.id : undefined}
            onSelect={openDrawer}
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(({ p, sh, sp, sd, wh, ev, hasData }, idx) => {
              const st = STATUS_STYLE[ev.status];
              const fav = favorites.includes(p.id);
              const stop = (e: React.SyntheticEvent) => e.stopPropagation();
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
                    <div className="min-w-0">
                      <p className="flex items-center gap-1 text-[11px] text-slate-500">
                        <MapPin className="h-3 w-3" /> {p.area}・水深{p.targetDepth}m
                      </p>
                      <h2 className="mt-1 text-base font-bold leading-snug text-slate-800">{p.name}</h2>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {p.subName && (
                          <span className="inline-block rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                            {p.subName}
                          </span>
                        )}
                        {ev.reefShielded && (
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700 ring-1 ring-teal-200">
                            <Anchor className="h-3 w-3" /> 干潮リーフ遮断中（{p.reefThresholdCm}cm以下・現在{ev.tideCm}cm）
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <button
                        id={`fav-${p.id}`}
                        onClick={(e) => {
                          stop(e);
                          toggleFavorite(p.id);
                        }}
                        onKeyDown={stop}
                        aria-pressed={fav}
                        aria-label={fav ? "お気に入りから外す" : "お気に入りに登録"}
                        className={`rounded-full p-1.5 transition hover:scale-110 ${fav ? "bg-rose-50 text-rose-500" : "text-slate-300 hover:bg-rose-50 hover:text-rose-400"}`}
                      >
                        <Heart className={`h-5 w-5 ${fav ? "fill-rose-500" : ""}`} />
                      </button>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${st.badge}`}>{ev.label}</span>
                    </div>
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
                      <dt className="flex items-center justify-center gap-1 text-slate-500"><Waves className="h-3 w-3" />うねりの向き</dt>
                      <dd className="font-semibold text-slate-700">{sd !== null ? `${dirLabel(sd)}から` : "-"}</dd>
                    </div>
                    <div className="rounded-xl bg-sky-50/70 p-2">
                      <dt className="text-slate-500">実効/波高</dt>
                      <dd className="font-mono font-semibold text-slate-700">{ev.effectiveSwellHeight}/{wh?.toFixed(1) ?? "-"}m</dd>
                    </div>
                  </dl>

                  {ev.currentAlerts.map((a) => (
                    <p key={a.type} className="mt-3 flex gap-1.5 rounded-xl bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-800 ring-1 ring-amber-200">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span><b>⚠️ {a.title}</b><br />{a.message}</span>
                    </p>
                  ))}

                  <p className="mt-3 text-xs text-slate-600">{ev.advice}</p>

                  <p className="mt-auto flex gap-2 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-500">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />
                    {p.note}
                  </p>

                  {tab === "お気に入り" && (
                    <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                      <span className="mr-auto text-[11px] text-slate-400">並び順 {idx + 1}/{rows.length}</span>
                      <button
                        id={`fav-up-${p.id}`}
                        onClick={(e) => {
                          stop(e);
                          moveFavorite(p.id, -1);
                        }}
                        onKeyDown={stop}
                        disabled={idx === 0}
                        className="flex items-center gap-0.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-30"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />上へ
                      </button>
                      <button
                        id={`fav-down-${p.id}`}
                        onClick={(e) => {
                          stop(e);
                          moveFavorite(p.id, 1);
                        }}
                        onKeyDown={stop}
                        disabled={idx === rows.length - 1}
                        className="flex items-center gap-0.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-30"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />下へ
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        <footer className="mt-10 text-center text-[11px] leading-relaxed text-slate-500">
          Data: Open-Meteo Marine / Forecast API（1時間キャッシュ）・潮位: 気象庁 潮位表（那覇）<br />
          本予報は目安です。離岸流の表示は発生しやすさの注意喚起であり、安全を保証するものではありません。現地の状況を必ず確認してください。
        </footer>
      </main>

      <SpotDrawer
        point={selectedPoint}
        open={drawerOpen}
        hourly={selectedPoint ? data.byPointId[selectedPoint.id] : undefined}
        tide={tide}
        hourIdx={hourIdx}
        onSelectHour={setHourIdx}
        onClose={closeDrawer}
      />
    </div>
  );
}
