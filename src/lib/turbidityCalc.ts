import type { DivePoint } from "@/data/points";
import { getExposureRatio } from "@/lib/swellCalc";

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
 * 直近 lookbackHours 時間（デフォルト12時間）に、そのポイントへ実際に入ってきたうねりの最大値（m）。
 * 合成波高（風浪込み）ではなく「うねり高 × 開口方位に対する直撃率」で評価する。
 * 例: 大度海岸（南向き）に東南東のうねりが斜めに入る日は、波高1.2mでも実際に届くのは0.4m程度。
 */
export function getRecentIncidentSwell(
  hourly:
    | { swellHeight: (number | null)[]; swellDirection: (number | null)[] }
    | undefined,
  idx: number,
  point: DivePoint,
  lookbackHours = 12
): number | null {
  if (!hourly) return null;
  let max = 0;
  let found = false;
  const start = Math.max(0, idx - lookbackHours);
  for (let k = start; k <= idx; k++) {
    const h = hourly.swellHeight[k];
    const d = hourly.swellDirection[k];
    if (h === null || h === undefined) continue;
    found = true;
    const incident = d === null || d === undefined ? h : h * getExposureRatio(d, point);
    if (incident > max) max = incident;
  }
  return found ? max : null;
}

const OUTER_ISLAND_AREAS: DivePoint["area"][] = ["慶良間", "宮古", "石垣"];

/** 砂の舞いやすい海岸で「クリア」を出す条件 */
const STRICT_CLEAR_MAX_SCORE = 10; // 通常は20未満でクリア
const STRICT_CLEAR_MAX_WAVE_M = 0.6; // 直近12時間に実際に入ってきたうねりの最大値

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
  /** 直近12時間に実際に入ってきたうねりの最大値（getRecentIncidentSwell） */
  recentIncidentSwellM?: number | null,
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

  const hasTide = tideCm !== null && tideCm !== undefined && point.reefThresholdCm !== undefined;
  const isReefClosedByLowTide = hasTide && tideCm! < point.reefThresholdCm!;
  // リーフ越流率（潮位がリーフ天井を越えた量。+40cmで最大）
  const overtop = hasTide && !isReefClosedByLowTide ? Math.min(1, (tideCm! - point.reefThresholdCm!) / 40) : 0;
  const isFlooding = tideDeltaCm !== null && tideDeltaCm >= 5;
  const incident = recentIncidentSwellM ?? 0.6;

  let stagnationPt = 0;
  if (stagnation > 0) {
    const waveRef = Math.max(incident, 0.4);
    stagnationPt = stagnation * (22 + Math.min(24, waveRef * 22));
    if (isReefClosedByLowTide) {
      // 干潮でアウターリーフが露出・閉鎖している間は外洋のきれいな水が入らず白濁りがこもる
      stagnationPt += stagnation * 8;
    } else if (isFlooding && overtop > 0) {
      // 上げ潮でリーフを越えて外洋のきれいな水が流れ込んでいる間は、越流量に応じて白濁りが洗い流される
      stagnationPt *= 1 - 0.85 * overtop;
    }
    stagnationPt = Math.round(stagnationPt);
    if (stagnationPt >= 18) {
      reasons.push("複雑リーフ内の海水滞留（白濁りがすぐには抜けにくい地形）");
    }
  }
  // 満潮でリーフを越えた直撃うねりがリーフ上で砕けて浅いプールの砂を巻き上げる
  // （揺れの増加分は swellCalc の越波補正で底揺れ→砂の巻き上げに反映済みのため、ここでは理由表示のみ）
  if (overtop >= 0.5 && incident >= 0.6 && point.hasOuterReef) {
    reasons.push("満潮でリーフを越えた波による砂の巻き上げ");
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
  //    （直近12時間に入ったうねりが小さく・雨がなく・濁り要因が少ない日だけクリア。それ以外は「良好」止まり）
  if (isClarityStrict(point) && score < 20) {
    const calmSea = (recentIncidentSwellM ?? 1) <= STRICT_CLEAR_MAX_WAVE_M;
    const noRain = (rain24hMm ?? 0) < 5;
    if (!(score < STRICT_CLEAR_MAX_SCORE && calmSea && noRain)) {
      score = 20;
      reasons.push("砂の舞いやすい海岸のため、ベタ凪が続いた日以外はクリアまで届きにくい");
    }
  }

  const status: TurbidityStatus = score >= 65 ? "poor" : score >= 40 ? "cloudy" : score >= 20 ? "good" : "clear";
  return { score, status, reasons };
}

