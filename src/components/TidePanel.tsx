"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Moon, ArrowUp, ArrowDown, Anchor } from "lucide-react";
import { moonEmoji, weekdayJa, addDays, type TideData, type TideDay, type TideName } from "@/lib/tideCalc";

const TIDE_NAME_STYLE: Record<TideName, string> = {
  大潮: "bg-rose-100 text-rose-700",
  中潮: "bg-orange-100 text-orange-700",
  小潮: "bg-sky-100 text-sky-700",
  長潮: "bg-slate-100 text-slate-600",
  若潮: "bg-emerald-100 text-emerald-700",
};

const REEF_BAND = { low: 80, high: 120 }; // リーフ遮断の目安帯（ポイント別閾値 80〜120cm の範囲）

interface Props {
  tide: TideData;
  times: string[];
  hourIdx: number;
  onSelectHour: (i: number) => void;
}

export default function TidePanel({ tide, times, hourIdx, onSelectHour }: Props) {
  const sliderTime = times[hourIdx];
  const sliderDay = sliderTime?.slice(0, 10);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const activeDay = pickedDay ?? sliderDay ?? Object.keys(tide.days).sort()[1];

  // カレンダー対象月（前月末のバッファ日は除外）
  const months = useMemo(() => {
    const count = new Map<string, number>();
    Object.keys(tide.days).forEach((d) => count.set(d.slice(0, 7), (count.get(d.slice(0, 7)) ?? 0) + 1));
    return [...count.entries()].filter(([, n]) => n >= 20).map(([m]) => m).sort();
  }, [tide.days]);
  const [monthOverride, setMonthOverride] = useState<string | null>(null);
  const viewMonth = monthOverride ?? activeDay?.slice(0, 7) ?? months[0];
  const monthIdx = months.indexOf(viewMonth);

  const forecastDays = useMemo(() => new Set(times.map((t) => t.slice(0, 10))), [times]);

  const pickDay = (d: string) => {
    // 予報期間内の日なら、スライダーも同じ時刻のその日に移動（連動）
    const hh = sliderTime?.slice(11, 13) ?? "12";
    const i = times.findIndex((t) => t === `${d}T${hh}:00`);
    if (i >= 0) {
      onSelectHour(i);
      setPickedDay(null);
    } else {
      setPickedDay(d);
    }
  };

  if (tide.error || !activeDay) {
    return (
      <div className="rounded-3xl bg-white p-6 text-sm text-slate-600 shadow-xl ring-1 ring-sky-100">
        潮汐データを取得できませんでした{tide.error ? `（${tide.error}）` : ""}。時間をおいて再読み込みしてください。
      </div>
    );
  }

  const day = tide.days[activeDay];
  const nextDay = tide.days[addDays(activeDay, 1)];

  return (
    <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
      {/* タイドグラフ */}
      <section className="rounded-3xl border border-sky-100 bg-white p-4 shadow-xl sm:p-6" aria-label="24時間タイドグラフ">
        {day ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs text-slate-500">{tide.station}（気象庁 潮位表）</p>
                <h2 className="text-xl font-bold text-slate-800">
                  {Number(activeDay.slice(5, 7))}月{Number(activeDay.slice(8, 10))}日（{weekdayJa(activeDay)}）
                </h2>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className={`rounded-full px-3 py-1 font-bold ${TIDE_NAME_STYLE[day.tideName]}`}>{day.tideName}</span>
                <span className="flex items-center gap-1 text-slate-600">
                  <span className="text-lg">{moonEmoji(day.moonAge)}</span>月齢 {day.moonAge.toFixed(1)}
                </span>
              </div>
            </div>

            <TideGraph
              day={day}
              nextDay={nextDay}
              cursorTime={sliderDay === activeDay ? sliderTime : undefined}
              onPickHour={(h) => {
                const i = times.findIndex((t) => t === `${activeDay}T${String(h).padStart(2, "0")}:00`);
                if (i >= 0) {
                  onSelectHour(i);
                  setPickedDay(null);
                }
              }}
              clickable={forecastDays.has(activeDay)}
            />

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[...day.highs.map((e) => ({ ...e, kind: "満潮" as const })), ...day.lows.map((e) => ({ ...e, kind: "干潮" as const }))]
                .sort((a, b) => a.time.localeCompare(b.time))
                .map((e) => (
                  <div
                    key={e.kind + e.time}
                    className={`rounded-2xl px-3 py-2 ${e.kind === "満潮" ? "bg-sky-50 text-sky-800" : "bg-amber-50 text-amber-800"}`}
                  >
                    <p className="flex items-center gap-1 text-[11px] font-semibold">
                      {e.kind === "満潮" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {e.kind}
                    </p>
                    <p className="font-mono text-lg font-bold leading-tight">{e.time}</p>
                    <p className="font-mono text-xs">{e.cm}cm</p>
                  </div>
                ))}
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
              <Anchor className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-500" />
              緑の帯（{REEF_BAND.low}〜{REEF_BAND.high}cm）はアウターリーフが防波堤として効き始める目安です。潮位がポイントごとの基準値以下になると、一覧・地図の底揺れ計算に自動で反映されます。
              {forecastDays.has(activeDay) && " グラフをタップするとその時刻に切り替わります。"}
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-500">この日の潮位データはありません。</p>
        )}
      </section>

      {/* 月間カレンダー */}
      <section className="rounded-3xl border border-sky-100 bg-white p-4 shadow-xl sm:p-6" aria-label="月間潮回りカレンダー">
        <div className="mb-3 flex items-center justify-between">
          <button
            id="tide-prev-month"
            onClick={() => monthIdx > 0 && setMonthOverride(months[monthIdx - 1])}
            disabled={monthIdx <= 0}
            aria-label="前の月"
            className="rounded-full p-2 text-slate-600 transition hover:bg-sky-50 disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="flex items-center gap-1.5 text-lg font-bold text-slate-800">
            <Moon className="h-4 w-4 text-sky-500" />
            {viewMonth ? `${viewMonth.slice(0, 4)}年${Number(viewMonth.slice(5, 7))}月` : ""} 潮回り
          </h2>
          <button
            id="tide-next-month"
            onClick={() => monthIdx < months.length - 1 && setMonthOverride(months[monthIdx + 1])}
            disabled={monthIdx < 0 || monthIdx >= months.length - 1}
            aria-label="次の月"
            className="rounded-full p-2 text-slate-600 transition hover:bg-sky-50 disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        {viewMonth && (
          <MonthCalendar
            month={viewMonth}
            days={tide.days}
            activeDay={activeDay}
            forecastDays={forecastDays}
            todayJst={times[0]?.slice(0, 10)}
            onPick={(d) => {
              setMonthOverride(null);
              pickDay(d);
            }}
          />
        )}
        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
          {(Object.keys(TIDE_NAME_STYLE) as TideName[]).map((n) => (
            <span key={n} className={`rounded px-1.5 py-0.5 font-semibold ${TIDE_NAME_STYLE[n]}`}>{n}</span>
          ))}
          <span className="flex items-center gap-1 text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />予報期間
          </span>
        </div>
      </section>
    </div>
  );
}

function MonthCalendar({
  month,
  days,
  activeDay,
  forecastDays,
  todayJst,
  onPick,
}: {
  month: string;
  days: Record<string, TideDay>;
  activeDay: string;
  forecastDays: Set<string>;
  todayJst?: string;
  onPick: (d: string) => void;
}) {
  const first = `${month}-01`;
  const lead = new Date(first + "T00:00:00Z").getUTCDay();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = first; d.slice(0, 7) === month; d = addDays(d, 1)) cells.push(d);

  return (
    <div className="grid grid-cols-7 gap-1 text-center">
      {["日", "月", "火", "水", "木", "金", "土"].map((w, i) => (
        <div key={w} className={`pb-1 text-[11px] font-semibold ${i === 0 ? "text-rose-500" : i === 6 ? "text-sky-600" : "text-slate-500"}`}>
          {w}
        </div>
      ))}
      {cells.map((d, k) => {
        if (!d) return <div key={`b${k}`} />;
        const td = days[d];
        const active = d === activeDay;
        return (
          <button
            key={d}
            id={`tide-day-${d}`}
            onClick={() => td && onPick(d)}
            disabled={!td}
            className={`relative flex flex-col items-center rounded-xl py-1 transition ${
              active ? "bg-sky-500 text-white shadow-md shadow-sky-500/30" : "hover:bg-sky-50"
            } ${d === todayJst && !active ? "ring-2 ring-sky-300" : ""} disabled:opacity-30`}
          >
            <span className="text-xs font-bold">{Number(d.slice(8, 10))}</span>
            <span className="text-sm leading-none">{td ? moonEmoji(td.moonAge) : ""}</span>
            {td && (
              <span className={`mt-0.5 rounded px-1 text-[9px] font-semibold ${active ? "bg-white/25 text-white" : TIDE_NAME_STYLE[td.tideName]}`}>
                {td.tideName}
              </span>
            )}
            {forecastDays.has(d) && (
              <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${active ? "bg-white" : "bg-sky-500"}`} />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** 滑らかな24時間タイドグラフ（Catmull-Rom → ベジェ曲線） */
function TideGraph({
  day,
  nextDay,
  cursorTime,
  clickable,
  onPickHour,
}: {
  day: TideDay;
  nextDay?: TideDay;
  cursorTime?: string;
  clickable: boolean;
  onPickHour: (h: number) => void;
}) {
  const W = 720;
  const H = 260;
  const pad = { l: 40, r: 14, t: 26, b: 28 };
  const values = [...day.hourly, nextDay?.hourly[0] ?? day.hourly[23]];
  const yMin = Math.min(-10, ...values) - 5;
  const yMax = Math.max(220, ...values) + 10;
  const x = (h: number) => pad.l + (h / 24) * (W - pad.l - pad.r);
  const y = (cm: number) => pad.t + (1 - (cm - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);

  const pts = values.map((v, h) => [x(h), y(v)] as const);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  const area = `${d} L${x(24)},${y(yMin)} L${x(0)},${y(yMin)} Z`;
  const toHour = (t: string) => Number(t.slice(0, 2)) + Number(t.slice(3, 5)) / 60;
  const cursorH = cursorTime ? Number(cursorTime.slice(11, 13)) : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`mt-3 w-full select-none ${clickable ? "cursor-pointer" : ""}`}
      role="img"
      aria-label="潮位グラフ"
      onClick={(e) => {
        if (!clickable) return;
        const r = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * W;
        const h = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * 24);
        if (h >= 0 && h <= 23) onPickHour(h);
      }}
    >
      <defs>
        <linearGradient id="tideFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.04" />
        </linearGradient>
      </defs>

      {/* 目盛り */}
      {[0, 50, 100, 150, 200].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeDasharray="3 4" />
          <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#94a3b8">{v}</text>
        </g>
      ))}
      {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
        <text key={h} x={x(h)} y={H - 8} textAnchor="middle" fontSize="11" fill="#94a3b8">{h}時</text>
      ))}

      {/* リーフ遮断目安帯 */}
      <rect x={pad.l} width={W - pad.l - pad.r} y={y(REEF_BAND.high)} height={y(REEF_BAND.low) - y(REEF_BAND.high)} fill="#14b8a6" opacity="0.12" />
      <text x={W - pad.r - 4} y={y(REEF_BAND.high) - 4} textAnchor="end" fontSize="10" fill="#0d9488">リーフ遮断目安</text>

      <path d={area} fill="url(#tideFill)" />
      <path d={d} fill="none" stroke="#0284c7" strokeWidth="3" strokeLinecap="round" />

      {/* 満潮・干潮 */}
      {day.highs.map((e) => (
        <g key={"h" + e.time}>
          <circle cx={x(toHour(e.time))} cy={y(e.cm)} r="5" fill="#0369a1" stroke="#fff" strokeWidth="2" />
          <text x={x(toHour(e.time))} y={y(e.cm) - 10} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0369a1">
            満 {e.time} {e.cm}cm
          </text>
        </g>
      ))}
      {day.lows.map((e) => (
        <g key={"l" + e.time}>
          <circle cx={x(toHour(e.time))} cy={y(e.cm)} r="5" fill="#d97706" stroke="#fff" strokeWidth="2" />
          <text x={x(toHour(e.time))} y={y(e.cm) + 18} textAnchor="middle" fontSize="11" fontWeight="700" fill="#b45309">
            干 {e.time} {e.cm}cm
          </text>
        </g>
      ))}

      {/* 選択中の時刻 */}
      {cursorH !== null && (
        <g>
          <line x1={x(cursorH)} x2={x(cursorH)} y1={pad.t - 10} y2={H - pad.b} stroke="#f43f5e" strokeWidth="2" />
          <circle cx={x(cursorH)} cy={y(day.hourly[cursorH])} r="6" fill="#f43f5e" stroke="#fff" strokeWidth="2" />
          <rect x={x(cursorH) - 34} y={pad.t - 24} width="68" height="18" rx="9" fill="#f43f5e" />
          <text x={x(cursorH)} y={pad.t - 11} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
            {String(cursorH).padStart(2, "0")}時 {day.hourly[cursorH]}cm
          </text>
        </g>
      )}
    </svg>
  );
}
