import type { DivePoint } from "@/data/points";

/**
 * 濁り（透明度）予測。
 * 透明度を「◯m」と断定せず、濁りやすさの要因を合算した4段階の目安として出す。
 *  1. 底揺れ × 底質（砂の巻き上げ）
 *  2. 複雑リーフ・閉鎖イノー内の海水滞留（満潮時や外洋波で舞った白濁りがすぐには抜けない地形特性）
 *  3. 過去24時間雨量 × 河川・排水の影響度（淡水・赤土）
 *  4. 潮の動き（下げ潮でインリーフの水が流出 / アウターリーフより高い上げ潮で外洋水が入る）
 *  5. 季節（3〜5月の春濁り）
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

/**
 * 直近 lookbackHours 時間（デフォルト12時間）の最大波高/うねり高を取得。
 * リーフ内のタイドプール・イノーでは満潮時や数時間前の波で舞った白濁りが残るため参照する。
 */
export function getRecentMaxWave(
  hourly: { waveHeight: (number | null)[]; swellHeight: (number | null)[] } | undefined,
  idx: number,
  lookbackHours = 12
): number | null {
  if (!hourly) return null;
  let max = 0;
  let found = false;
  const start = Math.max(0, idx - lookbackHours);
  for (let k = start; k <= idx; k++) {
    const w = Math.max(hourly.waveHeight[k] ?? 0, hourly.swellHeight[k] ?? 0);
    if (w > 0) {
      if (w > max) max = w;
      found = true;
    }
  }
  return found ? max : null;
}

const OUTER_ISLAND_AREAS: DivePoint["area"][] = ["慶良間", "宮古", "石垣"];

/** 砂の舞いやすい海岸で「クリア」を出す条件 */
const STRICT_CLEAR_MAX_SCORE = 6; // 通常は20未満でクリア
const STRICT_CLEAR_MAX_WAVE_M = 0.6; // 直近12時間の最大波高

/** 「クリア」判定をシビアにするポイントか（明示指定がなければ底質とエリアから決定） */
export function isClarityStrict(point: DivePoint): boolean {
  if (point.clarityStrict !== undefined) return point.clarityStrict;
  if (point.bottomType === "rock") return false;
  return !OUTER_ISLAND_AREAS.includes(point.area);
}

export function calculateTurbidity(
  point: DivePoint,
  bottomSurgeCm: number,
  rain24hMm: number | null,
  tideDeltaCm: number | null,
  time: string | undefined,
  recentWaveM?: number | null,
  tideCm?: number | null
): TurbidityEvaluation {
  const reasons: string[] = [];

  // 1. 砂の巻き上げ（最大60点）
  const sand = Math.min(60, bottomSurgeCm * BOTTOM_COEF[point.bottomType]);
  if (sand >= 25) reasons.push("底揺れによる砂の巻き上げ");

  // 2. 複雑リーフ・イノー内の海水滞留（白濁りの抜けにくさ）
  const stagnation =
    point.reefStagnation ??
    (point.hasOuterReef && point.reefProtection >= 0.6
      ? Math.min(0.6, (point.reefProtection - 0.45) * 1.4)
      : 0);

  let stagnationPt = 0;
  const isReefClosedByLowTide =
    tideCm !== null &&
    tideCm !== undefined &&
    point.reefThresholdCm !== undefined &&
    tideCm < point.reefThresholdCm;

  if (stagnation > 0) {
    const waveRef = Math.max(recentWaveM ?? 0.6, 0.4);
    stagnationPt = Math.round(stagnation * (22 + Math.min(24, waveRef * 22)));
    if (isReefClosedByLowTide) {
      // 干潮でアウターリーフが露出・閉鎖している間は外洋のきれいな水が入らず白濁りがこもる
      stagnationPt += Math.round(stagnation * 8);
    }
    if (stagnationPt >= 18) {
      reasons.push("複雑リーフ内の海水滞留（白濁りがすぐには抜けにくい地形）");
    }
  }

  // 3. 雨・淡水・排水（最大40点）
  const rain = Math.min(40, (rain24hMm ?? 0) * RIVER_COEF[point.riverImpact] * 2);
  if (rain >= 15) reasons.push("雨による淡水・排水流入（モヤ・赤土）");

  // 4. 潮の動き（岩礁ポイントは浅場の水の出入りの影響が小さいため対象外）
  let tidePt = 0;
  if (tideDeltaCm !== null && point.bottomType !== "rock") {
    if (tideDeltaCm <= -10) {
      tidePt = 15;
      reasons.push("下げ潮によるインリーフ水の流出");
    } else if (tideDeltaCm >= 10 && !isReefClosedByLowTide) {
      // 上げ潮による外洋水流入でクリアになるのは、潮位がアウターリーフを超えている時のみ
      tidePt = -10;
    }
  }

  // 5. 春濁り（3〜5月）
  const month = time ? Number(time.slice(5, 7)) : 0;
  let season = 0;
  if (month >= 3 && month <= 5) {
    season = 10;
    reasons.push("春濁りシーズン（プランクトン傾向）");
  }

  let score = Math.max(0, Math.round(sand + stagnationPt + rain + tidePt + season));

  // 6. 砂の舞いやすい海岸は「クリア」の条件をシビアにする
  //    （直近12時間の波が小さく・雨がなく・濁り要因がほぼゼロの日だけクリア。それ以外は「良好」止まり）
  if (isClarityStrict(point) && score < 20) {
    const calmSea = (recentWaveM ?? 1) <= STRICT_CLEAR_MAX_WAVE_M;
    const noRain = (rain24hMm ?? 0) < 5;
    if (!(score < STRICT_CLEAR_MAX_SCORE && calmSea && noRain)) {
      score = 20;
      reasons.push("砂の舞いやすい海岸のため、ベタ凪が続いた日以外はクリアまで届きにくい");
    }
  }

  const status: TurbidityStatus = score >= 65 ? "poor" : score >= 40 ? "cloudy" : score >= 20 ? "good" : "clear";
  return { score, status, reasons };
}

