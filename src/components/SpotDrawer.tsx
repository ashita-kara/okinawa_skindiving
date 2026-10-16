"use client";

import { useEffect, useMemo, useRef } from "react";
import { X, ArrowDown, MapPin, Shield, Compass, Info, Wind } from "lucide-react";
import type { DivePoint } from "@/data/points";
import { calculateUnderwaterSurge, getAngleDiff, type SwellEvaluation } from "@/lib/swellCalc";
import type { PointHourly } from "@/lib/fetchMarineData";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
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
  lowTide: boolean;
  hourIdx: number;
  onSelectHour: (i: number) => void;
  onClose: () => void;
}

export default function SpotDrawer({ point, open, hourly, lowTide, hourIdx, onSelectHour, onClose }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Escキーで閉じる
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);

  // 3時間おきのカラム（干潮モードに連動して再計算）
  const cols = useMemo(() => {
    if (!point || !hourly) return [];
    return hourly.time
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => Number(t.slice(11, 13)) % 3 === 0)
      .map(({ t, i }) => {
        const sh = hourly.swellHeight[i] ?? null;
        const sp = hourly.swellPeriod[i] ?? null;
        const sd = hourly.swellDirection[i] ?? null;
        return {
          t,
          i,
          sh,
          sp,
          sd,
          wh: hourly.waveHeight[i] ?? null,
          wwh: hourly.windWaveHeight[i] ?? null,
          ws: hourly.windSpeed[i] ?? null,
          wg: hourly.windGusts[i] ?? null,
          wd: hourly.windDirection[i] ?? null,
          ev: calculateUnderwaterSurge(sh, sp, sd, point, lowTide),
        };
      });
  }, [point, hourly, lowTide]);

  // スライダーの時刻を含む3時間枠をハイライト
  const activeCol = cols.findIndex((c) => c.i <= hourIdx && hourIdx < c.i + 3);

  // ハイライト列が見えるようにスクロール
  useEffect(() => {
    if (!open || activeCol < 0) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-col="${activeCol}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [open, activeCol]);

  const LABEL = "sticky left-0 z-10 bg-white/95 backdrop-blur pr-3 pl-4 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap border-r border-slate-100";

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
        aria-label={point ? `${point.name}の時間別予報` : "時間別予報"}
        className={`fixed bottom-0 left-0 right-0 z-50 flex h-[52vh] min-h-[420px] flex-col rounded-t-3xl border-t border-sky-100 bg-white shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {point && (
          <>
            {/* ヘッダー */}
            <div className="relative shrink-0 border-b border-slate-100 px-5 pb-3 pt-3 sm:px-8">
              <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-200" />
              <button
                id="drawer-close"
                onClick={onClose}
                aria-label="閉じる"
                className="absolute right-4 top-4 rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex flex-wrap items-center gap-2 pr-12">
                <h2 className="text-lg font-bold text-slate-800 sm:text-xl">{point.name}</h2>
                {point.subName && (
                  <span className="rounded-md bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">{point.subName}</span>
                )}
                {lowTide && point.hasOuterReef && (
                  <span className="rounded-md bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700 ring-1 ring-teal-200">干潮補正中</span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-sky-500" />{point.area}・基準水深 {point.targetDepth}m</span>
                <span className="flex items-center gap-1"><Compass className="h-3.5 w-3.5 text-sky-500" />開口：{dirName(point.openDirection)}（{point.openDirection}°±{point.openAngleWidth}°）</span>
                <span className="flex items-center gap-1"><Shield className="h-3.5 w-3.5 text-sky-500" />リーフ減衰率 {Math.round(point.reefProtection * 100)}%{point.hasOuterReef ? "（アウターリーフあり）" : ""}</span>
              </div>
              <p className="mt-1.5 flex gap-1.5 text-xs leading-relaxed text-slate-500">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />{point.note}
              </p>
            </div>

            {/* タイムテーブル */}
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
              {cols.length === 0 ? (
                <p className="p-6 text-sm text-slate-500">予報データがありません。</p>
              ) : (
                <table className="border-separate border-spacing-0 text-center">
                  <tbody>
                    {/* ① 日付 */}
                    <tr>
                      <th className={`${LABEL} pt-2`}>日付</th>
                      {cols.map((c, k) => {
                        const first = k === 0 || c.t.slice(0, 10) !== cols[k - 1].t.slice(0, 10);
                        const w = WEEK[new Date(c.t.slice(0, 10) + "T00:00:00Z").getUTCDay()];
                        return (
                          <td key={c.t} className={`h-7 whitespace-nowrap pt-2 text-left text-xs font-bold text-slate-700 ${first ? "border-l border-slate-200 pl-1.5" : ""}`}>
                            {first ? `${c.t.slice(5, 7)}/${c.t.slice(8, 10)}(${w})` : ""}
                          </td>
                        );
                      })}
                    </tr>
                    {/* ② 時間 */}
                    <tr>
                      <th className={LABEL}>時間</th>
                      {cols.map((c, k) => (
                        <td key={c.t} className="p-0">
                          <button
                            data-col={k}
                            onClick={() => onSelectHour(c.i)}
                            className={`w-14 py-1 font-mono text-sm transition ${
                              k === activeCol ? "rounded-t-lg bg-rose-500 font-bold text-white" : "text-slate-600 hover:bg-sky-50"
                            }`}
                          >
                            {c.t.slice(11, 13)}
                          </button>
                        </td>
                      ))}
                    </tr>
                    {/* ③ 判定カラーバー */}
                    <tr>
                      <th className={LABEL}>判定</th>
                      {cols.map((c, k) => (
                        <td key={c.t} className={`p-0 ${k === activeCol ? "bg-rose-50" : ""}`} onClick={() => onSelectHour(c.i)}>
                          <div className={`h-2.5 ${CELL_BG[c.ev.status]}`} title={c.ev.label} />
                        </td>
                      ))}
                    </tr>
                    {/* ④ 振られ幅 */}
                    <Row label="振られ幅 (cm)" cols={cols} activeCol={activeCol} onSelect={onSelectHour} labelCls={LABEL}>
                      {(c) => (
                        <span className={`text-lg font-black ${c.ev.status === "danger" ? "text-rose-600" : c.ev.status === "caution" ? "text-amber-600" : "text-sky-900"}`}>
                          {c.ev.bottomSurgeCm}
                        </span>
                      )}
                    </Row>
                    {/* ⑤ 実効うねり / 沖のうねり高 */}
                    <Row label={<>実効うねり<br /><span className="text-[10px] text-slate-400">沖のうねり高 (m)</span></>} cols={cols} activeCol={activeCol} onSelect={onSelectHour} labelCls={LABEL}>
                      {(c) => (
                        <div className="leading-tight">
                          <div className="font-mono text-sm font-bold text-slate-800">{c.ev.effectiveSwellHeight.toFixed(2)}</div>
                          <div className="font-mono text-[10px] text-slate-400">{c.sh?.toFixed(1) ?? "-"}</div>
                        </div>
                      )}
                    </Row>
                    {/* ⑥ 周期 */}
                    <Row label="うねり周期 (s)" cols={cols} activeCol={activeCol} onSelect={onSelectHour} labelCls={LABEL}>
                      {(c) => (
                        <span className={`font-mono text-sm ${c.sp !== null && c.sp >= 8 ? "font-bold text-orange-600" : "text-slate-600"}`}>
                          {c.sp?.toFixed(1) ?? "-"}
                        </span>
                      )}
                    </Row>
                    {/* ⑧ うねりの向き */}
                    <Row label="うねりの向き" cols={cols} activeCol={activeCol} onSelect={onSelectHour} labelCls={LABEL}>
                      {(c) => {
                        if (c.sd === null) return <span className="text-slate-400">-</span>;
                        const diff = getAngleDiff(c.sd, point.openDirection);
                        const color =
                          diff <= point.openAngleWidth * 0.5 ? "text-rose-500"
                          : diff <= point.openAngleWidth ? "text-orange-500"
                          : diff <= point.openAngleWidth + 45 ? "text-sky-500"
                          : "text-slate-400";
                        return (
                          <div className={`flex flex-col items-center ${color}`}>
                            {/* ArrowDown(下向き)を来る方向に回転 → 波の進行方向を示す */}
                            <ArrowDown className="h-5 w-5" strokeWidth={2.75} style={{ transform: `rotate(${c.sd}deg)` }} />
                            <span className="text-[10px] font-semibold">{dirName(c.sd)}</span>
                          </div>
                        );
                      }}
                    </Row>

                    {/* ── 波と風 ── */}
                    <tr>
                      <th className={`${LABEL} bg-sky-50/95 py-1 text-[10px] font-bold text-sky-700`}>
                        <span className="flex items-center gap-1"><Wind className="h-3 w-3" />波と風</span>
                      </th>
                      <td colSpan={cols.length} className="bg-sky-50 py-1" />
                    </tr>
                    {/* ⑨ 波の高さ */}
                    <Row label={<>波の高さ (m)<br /><span className="text-[10px] text-slate-400">うち風波</span></>} cols={cols} activeCol={activeCol} onSelect={onSelectHour} labelCls={LABEL}>
                      {(c) => (
                        <div className="leading-tight">
                          <div className={`font-mono text-sm font-bold ${c.wh !== null && c.wh >= 2 ? "text-rose-600" : c.wh !== null && c.wh >= 1.25 ? "text-amber-600" : "text-slate-800"}`}>
                            {c.wh?.toFixed(1) ?? "-"}
                          </div>
                          <div className="font-mono text-[10px] text-slate-400">{c.wwh?.toFixed(1) ?? "-"}</div>
                        </div>
                      )}
                    </Row>
                    {/* ⑩ 風速 */}
                    <Row label={<>風速 (m/s)<br /><span className="text-[10px] text-slate-400">最大瞬間</span></>} cols={cols} activeCol={activeCol} onSelect={onSelectHour} labelCls={LABEL}>
                      {(c) => (
                        <div className="leading-tight">
                          <div className={`font-mono text-sm font-bold ${windColor(c.ws)}`}>{c.ws?.toFixed(0) ?? "-"}</div>
                          <div className="font-mono text-[10px] text-slate-400">{c.wg?.toFixed(0) ?? "-"}</div>
                        </div>
                      )}
                    </Row>
                    {/* ⑪ 風向 */}
                    <Row label={<>風向<br /><span className="text-[10px] text-slate-400">赤=向かい風 / 青=風裏</span></>} cols={cols} activeCol={activeCol} onSelect={onSelectHour} labelCls={LABEL} last>
                      {(c) => {
                        if (c.wd === null) return <span className="text-slate-400">-</span>;
                        // 海側(開口方向)から吹く=向かい風(オンショア)、陸側から=風裏(オフショア)
                        const diff = getAngleDiff(c.wd, point.openDirection);
                        const color = diff <= 45 ? "text-rose-500" : diff <= 90 ? "text-orange-500" : diff <= 135 ? "text-slate-400" : "text-sky-500";
                        return (
                          <div className={`flex flex-col items-center ${color}`}>
                            <ArrowDown className="h-5 w-5" strokeWidth={2.75} style={{ transform: `rotate(${c.wd}deg)` }} />
                            <span className="text-[10px] font-semibold">{dirName(c.wd)}</span>
                          </div>
                        );
                      }}
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
  wwh: number | null;
  ws: number | null;
  wg: number | null;
  wd: number | null;
  ev: SwellEvaluation;
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
      <th className={`${labelCls} border-b border-slate-100 py-2`}>{label}</th>
      {cols.map((c, k) => (
        <td
          key={c.t}
          onClick={() => onSelect(c.i)}
          className={`h-12 cursor-pointer border-b border-slate-100 px-1 ${
            k === activeCol ? `bg-rose-50 ring-inset ${last ? "rounded-b-lg" : ""}` : "hover:bg-sky-50/60"
          }`}
        >
          {children(c)}
        </td>
      ))}
    </tr>
  );
}
