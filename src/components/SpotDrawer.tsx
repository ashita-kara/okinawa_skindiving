"use client";

import { useEffect, useMemo, useRef } from "react";
import { X, ArrowDown, MapPin, Shield, Compass, Info, AlertTriangle, Anchor } from "lucide-react";
import type { DivePoint } from "@/data/points";
import {
  calculateUnderwaterSurge,
  estimateSurfFace,
  getAngleDiff,
  type SwellEvaluation,
} from "@/lib/swellCalc";
import {
  calculateTurbidity,
  getRecentIncidentSwell,
  TURBIDITY_META,
  type TurbidityEvaluation,
} from "@/lib/turbidityCalc";
import type { PointHourly } from "@/lib/fetchMarineData";
import { getTideInput, weekdayJa, type TideData } from "@/lib/tideCalc";

const DIRS = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"];
export const dirName = (deg: number) => DIRS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

/** 風速の色分け（スキンダイビング目安） */
function windColor(ws: number | null) {
  if (ws === null) return "text-slate-400";
  if (ws >= 10) return "text-rose-600";
  if (ws >= 7) return "text-amber-600";
  if (ws >= 4) return "text-sky-700";
  return "text-emerald-600";
}

const CELL_BG: Record<SwellEvaluation["status"], string> = {
  calm: "bg-emerald-400",
  moderate: "bg-sky-400",
  caution: "bg-amber-400",
  danger: "bg-rose-500",
};

interface Props {
  point: DivePoint | null;
  open: boolean;
  hourly?: PointHourly;
  tide: TideData;
  hourIdx: number;
  onSelectHour: (i: number) => void;
  onClose: () => void;
}

export default function SpotDrawer({ point, open, hourly, tide, hourIdx, onSelectHour, onClose }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Escキーで閉じる
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);

  // 3時間おきのカラム（潮位による自動リーフ遮蔽を含めて計算）
  const cols = useMemo(() => {
    if (!point || !hourly) return [];
    return hourly.time
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => Number(t.slice(11, 13)) % 3 === 0)
      .map(({ t, i }) => {
        const sh = hourly.swellHeight[i] ?? null;
        const sp = hourly.swellPeriod[i] ?? null;
        const sd = hourly.swellDirection[i] ?? null;
        const rain24h = hourly.past24hRainMm[i] ?? null;
        const recentWave = getRecentIncidentSwell(hourly, i, point, 12);
        const tideIn = getTideInput(tide, t);
        const ev = calculateUnderwaterSurge(sh, sp, sd, point, tideIn);
        const tb = calculateTurbidity(point, ev.bottomSurgeCm, rain24h, tideIn.deltaCm, t, recentWave, tideIn.tideCm);
        return {
          t,
          i,
          sh,
          sp,
          sd,
          wh: hourly.waveHeight[i] ?? null,
          ws: hourly.windSpeed[i] ?? null,
          wg: hourly.windGusts[i] ?? null,
          wd: hourly.windDirection[i] ?? null,
          tideCm: tideIn.tideCm,
          tideDelta: tideIn.deltaCm,
          surf: estimateSurfFace(sh, sp, sd, point),
          ev,
          tb,
        };
      });
  }, [point, hourly, tide]);

  // スライダーの時刻を含む3時間枠をハイライト
  const activeCol = cols.findIndex((c) => c.i <= hourIdx && hourIdx < c.i + 3);

  // スライダー時刻ちょうどの評価（ヘッダーの注意報表示用）
  const current = useMemo(() => {
    if (!point || !hourly) return null;
    const t = hourly.time[hourIdx];
    const tideIn = getTideInput(tide, t);
    const ev = calculateUnderwaterSurge(
      hourly.swellHeight[hourIdx] ?? null,
      hourly.swellPeriod[hourIdx] ?? null,
      hourly.swellDirection[hourIdx] ?? null,
      point,
      tideIn
    );
    const tb = calculateTurbidity(
      point,
      ev.bottomSurgeCm,
      hourly.past24hRainMm[hourIdx] ?? null,
      tideIn.deltaCm,
      t,
      getRecentIncidentSwell(hourly, hourIdx, point, 12),
      tideIn.tideCm
    );
    return { ev, tb };
  }, [point, hourly, tide, hourIdx]);

  // ハイライト列が見えるようにスクロール
  useEffect(() => {
    if (!open || activeCol < 0) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-col="${activeCol}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [open, activeCol]);

  const LABEL =
    "sticky left-0 z-10 bg-white/95 backdrop-blur whitespace-nowrap border-r border-slate-100 text-left font-medium text-slate-500 pl-2 pr-1.5 text-[10px] md:pl-4 md:pr-3 md:text-[11px]";

  return (
    <>
      {/* オーバーレイ */}
      <div
        onClick={onClose}
        aria-hidden
        className={`fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-[2px] transition-opacity duration-300 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <section
        id="spot-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={point ? `${point.name}の時間別目安` : "時間別目安"}
        className={`fixed bottom-0 left-0 right-0 z-50 flex max-h-[92dvh] flex-col rounded-t-3xl border-t border-sky-100 bg-white pb-2 shadow-2xl transition-transform duration-300 ease-out md:max-h-[85vh] md:pb-4 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {point && (
          <>
            {/* ヘッダー */}
            <div className="relative shrink-0 border-b border-slate-100 px-3 pb-2 pt-2 md:px-8 md:pb-3 md:pt-3">
              <div className="mx-auto mb-1.5 h-1 w-10 rounded-full bg-slate-200 md:mb-2 md:h-1.5 md:w-12" />
              <button
                id="drawer-close"
                onClick={onClose}
                aria-label="閉じる"
                className="absolute right-2 top-2 rounded-full bg-slate-100 p-1.5 text-slate-600 transition hover:bg-slate-200 hover:text-slate-900 md:right-4 md:top-4 md:p-2"
              >
                <X className="h-4 w-4 md:h-5 md:w-5" />
              </button>
              <div className="flex flex-wrap items-center gap-1.5 pr-10 md:gap-2 md:pr-12">
                <h2 className="text-sm font-bold text-slate-800 md:text-xl">{point.name}</h2>
                {point.subName && (
                  <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 md:px-2 md:text-xs">{point.subName}</span>
                )}
                {current && (
                  <span
                    className={`flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 md:px-2 md:text-xs ${TURBIDITY_META[current.tb.status].badge}`}
                    title={current.tb.reasons.length > 0 ? `要因: ${current.tb.reasons.join("・")}` : undefined}
                  >
                    <span>{TURBIDITY_META[current.tb.status].icon}</span>
                    <span>透明度: {TURBIDITY_META[current.tb.status].label}</span>
                  </span>
                )}
                {current?.ev.reefShielded && (
                  <span className="flex items-center gap-0.5 rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 ring-1 ring-teal-200 md:text-xs">
                    <Anchor className="h-3 w-3" />干潮リーフ遮断中（{point.reefThresholdCm}cm以下・現在{current.ev.tideCm}cm）
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-600 md:mt-1.5 md:gap-x-4 md:gap-y-1 md:text-xs">
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-sky-500 md:h-3.5 md:w-3.5" />{point.area}・基準水深 {point.targetDepth}m</span>
                <span className="flex items-center gap-1"><Compass className="h-3 w-3 text-sky-500 md:h-3.5 md:w-3.5" />開口：{dirName(point.openDirection)}（{point.openDirection}°±{point.openAngleWidth}°）</span>
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3 text-sky-500 md:h-3.5 md:w-3.5" />
                  リーフ減衰率 {Math.round(point.reefProtection * 100)}%
                  {point.reefThresholdCm !== undefined ? `（潮位${point.reefThresholdCm}cm以下で遮断）` : point.hasOuterReef ? "（アウターリーフあり）" : ""}
                </span>
              </div>
              <p className="mt-1 flex gap-1 text-[10px] leading-snug text-slate-500 md:mt-1.5 md:gap-1.5 md:text-xs md:leading-relaxed">
                <Info className="mt-0.5 h-3 w-3 shrink-0 text-sky-500 md:h-3.5 md:w-3.5" />
                <span className="line-clamp-2 md:line-clamp-none">{point.note}</span>
              </p>
              {current && current.ev.currentAlerts.length > 0 && (
                <div className="mt-1.5 space-y-1 md:mt-2">
                  {current.ev.currentAlerts.map((a) => (
                    <p key={a.type} className="flex gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[10px] leading-snug text-amber-800 ring-1 ring-amber-200 md:px-3 md:py-1.5 md:text-xs">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 md:h-3.5 md:w-3.5" />
                      <span><b>{a.title}：</b>{a.message}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* タイムテーブル */}
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
              {cols.length === 0 ? (
                <p className="p-6 text-sm text-slate-500">データがありません。</p>
              ) : (
                <table className="border-separate border-spacing-0 text-center">
                  <tbody>
                    {/* 日付 */}
                    <tr>
                      <th className={`${LABEL} pt-1 md:pt-2`}>日付</th>
                      {cols.map((c, k) => {
                        const first = k === 0 || c.t.slice(0, 10) !== cols[k - 1].t.slice(0, 10);
                        return (
                          <td key={c.t} className={`h-5 whitespace-nowrap pt-1 text-left text-[10px] font-bold text-slate-700 md:h-7 md:pt-2 md:text-xs ${first ? "border-l border-slate-200 pl-1 md:pl-1.5" : ""}`}>
                            {first ? `${c.t.slice(5, 7)}/${c.t.slice(8, 10)}(${weekdayJa(c.t)})` : ""}
                          </td>
                        );
                      })}
                    </tr>
                    {/* 時間 */}
                    <tr>
                      <th className={LABEL}>時間</th>
                      {cols.map((c, k) => (
                        <td key={c.t} className="p-0">
                          <button
                            data-col={k}
                            onClick={() => onSelectHour(c.i)}
                            className={`w-11 py-0.5 font-mono text-[11px] transition md:w-14 md:py-1 md:text-sm ${
                              k === activeCol ? "rounded-t-lg bg-rose-500 font-bold text-white" : "text-slate-600 hover:bg-sky-50"
                            }`}
                          >
                            {c.t.slice(11, 13)}
                          </button>
                        </td>
                      ))}
                    </tr>
                    {/* 判定カラーバー */}
                    <tr>
                      <th className={LABEL}>判定</th>
                      {cols.map((c, k) => (
                        <td key={c.t} className={`p-0 ${k === activeCol ? "bg-rose-50" : ""}`} onClick={() => onSelectHour(c.i)}>
                          <div className={`h-1.5 md:h-2.5 ${CELL_BG[c.ev.status]}`} title={c.ev.label} />
                        </td>
                      ))}
                    </tr>
                    {/* 振られ幅 */}
                    <Row label="振られ幅 cm" cols={cols} activeCol={activeCol} onSelect={onSelectHour} labelCls={LABEL}>
                      {(c) => (
                        <span className={`text-sm font-black md:text-lg ${c.ev.status === "danger" ? "text-rose-600" : c.ev.status === "caution" ? "text-amber-600" : "text-sky-900"}`}>
                          {c.ev.bottomSurgeCm}
                        </span>
                      )}
                    </Row>
                    {/* 透明度目安 */}
                    <Row label={<>透明度<span className="hidden text-slate-400 md:inline">目安</span></>} cols={cols} activeCol={activeCol} onSelect={onSelectHour} labelCls={LABEL}>
                      {(c) => {
                        const m = TURBIDITY_META[c.tb.status];
                        return (
                          <div
                            className="flex flex-col items-center leading-none"
                            title={c.tb.reasons.length > 0 ? `${m.label}（${c.tb.reasons.join("・")}）` : m.label}
                          >
                            <span className="text-xs md:text-sm">{m.icon}</span>
                            <span className={`text-[9px] font-semibold md:text-[10px] ${m.text}`}>{m.short}</span>
                          </div>
                        );
                      }}
                    </Row>
                    {/* 実効うねり / 沖の波高 */}
                    <Row label={<>実効うねり<span className="text-slate-400">/波高</span> m</>} cols={cols} activeCol={activeCol} onSelect={onSelectHour} labelCls={LABEL}>
                      {(c) => (
                        <div className="leading-none md:leading-tight">
                          <div className="font-mono text-[11px] font-bold text-slate-800 md:text-sm">{c.ev.effectiveSwellHeight.toFixed(2)}</div>
                          <div className={`font-mono text-[9px] md:text-[10px] ${c.wh !== null && c.wh >= 2 ? "font-bold text-rose-600" : c.wh !== null && c.wh >= 1.25 ? "font-bold text-amber-600" : "text-slate-400"}`}>
                            {c.wh?.toFixed(1) ?? "-"}
                          </div>
                        </div>
                      )}
                    </Row>
                    {/* 波乗り高さ */}
                    <Row label={<>波乗り高さ<span className="hidden text-slate-400 md:inline">（目安）</span></>} cols={cols} activeCol={activeCol} onSelect={onSelectHour} labelCls={LABEL}>
                      {(c) =>
                        c.surf ? (
                          <div className="leading-none md:leading-tight">
                            <div className="text-[10px] font-bold text-slate-700 md:text-xs">{c.surf.label}</div>
                            <div className="font-mono text-[9px] text-slate-400 md:text-[10px]">{c.surf.meters.toFixed(1)}m</div>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )
                      }
                    </Row>
                    {/* うねり 周期＆向き */}
                    <Row label={<>うねり<span className="text-slate-400"> 周期s/向き</span></>} cols={cols} activeCol={activeCol} onSelect={onSelectHour} labelCls={LABEL}>
                      {(c) => {
                        const diff = c.sd === null ? null : getAngleDiff(c.sd, point.openDirection);
                        const color =
                          diff === null ? "text-slate-400"
                          : diff <= point.openAngleWidth * 0.5 ? "text-rose-500"
                          : diff <= point.openAngleWidth ? "text-orange-500"
                          : diff <= point.openAngleWidth + 45 ? "text-sky-500"
                          : "text-slate-400";
                        return (
                          <div className="flex flex-col items-center leading-none">
                            <div className="flex items-center gap-0.5">
                              {c.sd !== null && (
                                <ArrowDown className={`h-3.5 w-3.5 md:h-5 md:w-5 ${color}`} strokeWidth={2.75} style={{ transform: `rotate(${c.sd}deg)` }} />
                              )}
                              <span className={`font-mono text-[11px] md:text-sm ${c.sp !== null && c.sp >= 8 ? "font-bold text-orange-600" : "text-slate-600"}`}>
                                {c.sp?.toFixed(0) ?? "-"}
                              </span>
                            </div>
                            <span className={`text-[9px] font-semibold md:text-[10px] ${color}`}>{c.sd !== null ? dirName(c.sd) : "-"}</span>
                          </div>
                        );
                      }}
                    </Row>
                    {/* 風 速度＆向き */}
                    <Row label={<>風<span className="text-slate-400"> m/s/向き</span></>} cols={cols} activeCol={activeCol} onSelect={onSelectHour} labelCls={LABEL}>
                      {(c) => {
                        // 海側(開口方向)から吹く=向かい風(オンショア)、陸側から=風裏(オフショア)
                        const diff = c.wd === null ? null : getAngleDiff(c.wd, point.openDirection);
                        const color =
                          diff === null ? "text-slate-400"
                          : diff <= 45 ? "text-rose-500"
                          : diff <= 90 ? "text-orange-500"
                          : diff <= 135 ? "text-slate-400"
                          : "text-sky-500";
                        return (
                          <div className="flex flex-col items-center leading-none">
                            <div className="flex items-center gap-0.5">
                              {c.wd !== null && (
                                <ArrowDown className={`h-3.5 w-3.5 md:h-5 md:w-5 ${color}`} strokeWidth={2.75} style={{ transform: `rotate(${c.wd}deg)` }} />
                              )}
                              <span className={`font-mono text-[11px] font-bold md:text-sm ${windColor(c.ws)}`}>{c.ws?.toFixed(0) ?? "-"}</span>
                            </div>
                            <span className={`text-[9px] font-semibold md:text-[10px] ${color}`}>
                              {c.wd !== null ? dirName(c.wd) : "-"}
                              <span className="hidden font-normal text-slate-400 md:inline">{c.wg !== null ? ` 最大${c.wg.toFixed(0)}` : ""}</span>
                            </span>
                          </div>
                        );
                      }}
                    </Row>
                    {/* 潮位 */}
                    <Row label={<>潮位 cm<span className="hidden text-slate-400 md:inline">（那覇）</span></>} cols={cols} activeCol={activeCol} onSelect={onSelectHour} labelCls={LABEL} last>
                      {(c) => (
                        <div className={`relative mx-auto flex w-fit flex-col items-center rounded px-1 leading-none ${c.ev.reefShielded ? "bg-teal-50 text-teal-700" : "text-slate-700"}`}>
                          <span className="font-mono text-[11px] font-bold md:text-sm">
                            {c.tideCm ?? "-"}
                            {c.tideDelta !== null && (
                              <span className="ml-px text-[9px]">{c.tideDelta > 0 ? "↑" : c.tideDelta < 0 ? "↓" : "→"}</span>
                            )}
                          </span>
                          <span className="text-[9px] md:text-[10px]">
                            {c.ev.reefShielded ? "⚓遮断" : ""}
                            {c.ev.currentAlerts.length > 0 && <span className="font-bold text-amber-600">⚠</span>}
                          </span>
                        </div>
                      )}
                    </Row>
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </section>
    </>
  );
}

type Col = {
  t: string;
  i: number;
  sh: number | null;
  sp: number | null;
  sd: number | null;
  wh: number | null;
  ws: number | null;
  wg: number | null;
  wd: number | null;
  tideCm: number | null;
  tideDelta: number | null;
  surf: { meters: number; label: string } | null;
  ev: SwellEvaluation;
  tb: TurbidityEvaluation;
};

function Row({
  label, cols, activeCol, onSelect, labelCls, children, last,
}: {
  label: React.ReactNode;
  cols: Col[];
  activeCol: number;
  onSelect: (i: number) => void;
  labelCls: string;
  children: (c: Col) => React.ReactNode;
  last?: boolean;
}) {
  return (
    <tr>
      <th className={`${labelCls} border-b border-slate-100 py-0.5 md:py-2`}>{label}</th>
      {cols.map((c, k) => (
        <td
          key={c.t}
          onClick={() => onSelect(c.i)}
          className={`h-7 cursor-pointer border-b border-slate-100 px-0.5 md:h-11 md:px-1 ${
            k === activeCol ? `bg-rose-50 ${last ? "rounded-b-lg" : ""}` : "hover:bg-sky-50/60"
          }`}
        >
          {children(c)}
        </td>
      ))}
    </tr>
  );
}
