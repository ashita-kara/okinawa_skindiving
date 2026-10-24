import type { DivePoint } from "@/data/points";

/**
 * 濁り（透明度）予測。
 * 透明度を「◯m」と断定せず、濁りやすさの要因を合算した4段階の目安として出す。
 *  1. 底揺れ × 底質（砂の巻き上げ）
 *  2. 過去24時間雨量 × 河川・排水の影響度（淡水・赤土）
 *  3. 潮の動き（下げ潮でインリーフの水が流出 / 上げ潮で外洋水が入る）
 *  4. 季節（3〜5月の春濁り）
 */

export type TurbidityStatus = "clear" | "good" | "cloudy" | "poor";

export interface TurbidityEvaluation {
  score: number; // 0〜（高いほど濁りやすい）
  status: TurbidityStatus;
  reasons: string[];
}

const BOTTOM_COEF: Record<DivePoint["bottomType"], number> = {
  rock: 0.25,
  coral_sand: 1.0,
  fine_sand: 1.6,
};

const RIVER_COEF: Record<DivePoint["riverImpact"], number> = {
  none: 0.1,
  low: 0.5,
  high: 1.5,
};

export const TURBIDITY_META: Record<
  TurbidityStatus,
  { icon: string; label: string; short: string; badge: string; text: string }
> = {
  clear: { icon: "💎", label: "クリア", short: "クリア", badge: "bg-cyan-50 text-cyan-700 ring-cyan-200", text: "text-cyan-700" },
  good: { icon: "💧", label: "良好（浅場のみ微濁り）", short: "良好", badge: "bg-sky-50 text-sky-700 ring-sky-200", text: "text-sky-700" },
  cloudy: { icon: "🌫️", label: "白濁り・モヤ注意", short: "白濁り", badge: "bg-stone-100 text-stone-700 ring-stone-300", text: "text-stone-600" },
  poor: { icon: "🟤", label: "視界不良", short: "不良", badge: "bg-amber-100 text-amber-900 ring-amber-300", text: "text-amber-800" },
};

export function calculateTurbidity(
  point: DivePoint,
  bottomSurgeCm: number,
  rain24hMm: number | null,
  tideDeltaCm: number | null,
  time: string | undefined
): TurbidityEvaluation {
  const reasons: string[] = [];

  // 1. 砂の巻き上げ（最大60点）
  const sand = Math.min(60, bottomSurgeCm * BOTTOM_COEF[point.bottomType]);
  if (sand >= 25) reasons.push("底揺れによる砂の巻き上げ");

  // 2. 雨・淡水・排水（最大40点）
  const rain = Math.min(40, (rain24hMm ?? 0) * RIVER_COEF[point.riverImpact] * 2);
  if (rain >= 15) reasons.push("雨による淡水・排水流入（モヤ・赤土）");

  // 3. 潮の動き（岩礁ポイントは浅場の水の出入りの影響が小さいため対象外）
  let tidePt = 0;
  if (tideDeltaCm !== null && point.bottomType !== "rock") {
    if (tideDeltaCm <= -10) {
      tidePt = 15;
      reasons.push("下げ潮によるインリーフ水の流出");
    } else if (tideDeltaCm >= 10) {
      tidePt = -10;
    }
  }

  // 4. 春濁り（3〜5月）
  const month = time ? Number(time.slice(5, 7)) : 0;
  let season = 0;
  if (month >= 3 && month <= 5) {
    season = 10;
    reasons.push("春濁りシーズン（プランクトン傾向）");
  }

  const score = Math.max(0, Math.round(sand + rain + tidePt + season));
  const status: TurbidityStatus = score >= 65 ? "poor" : score >= 40 ? "cloudy" : score >= 20 ? "good" : "clear";
  return { score, status, reasons };
}

