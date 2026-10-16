import { DivePoint } from "@/data/points";

export interface SwellEvaluation {
  effectiveSwellHeight: number; // 地形・リーフ補正後の実効うねり高 (m)
  bottomSurgeCm: number;        // 指定水深での体の振られ幅 (cm)
  exposureRatio: number;        // うねりの直撃率 (0.1 〜 1.0)
  status: "calm" | "moderate" | "caution" | "danger";
  label: string;
  advice: string;
}

export function getAngleDiff(angle1: number, angle2: number): number {
  const diff = Math.abs(angle1 - angle2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export function calculateUnderwaterSurge(
  rawSwellHeight: number | null,
  rawSwellPeriod: number | null,
  rawSwellDir: number | null,
  point: DivePoint,
  isLowTide: boolean = false
): SwellEvaluation {
  if (
    !rawSwellHeight ||
    !rawSwellPeriod ||
    rawSwellDir === null ||
    rawSwellHeight <= 0.05 ||
    rawSwellPeriod <= 1
  ) {
    return {
      effectiveSwellHeight: 0,
      bottomSurgeCm: 0,
      exposureRatio: 0,
      status: "calm",
      label: "ベタ凪（底揺れなし）",
      advice: "水中は完全に安定しています。透明度も期待できます。"
    };
  }

  const angleDiff = getAngleDiff(rawSwellDir, point.openDirection);
  let exposureRatio = 1.0;

  if (angleDiff <= point.openAngleWidth) {
    const normalized = angleDiff / point.openAngleWidth;
    exposureRatio = 1.0 - normalized * 0.4;
  } else if (angleDiff <= point.openAngleWidth + 45) {
    const overAngle = angleDiff - point.openAngleWidth;
    exposureRatio = 0.6 - (overAngle / 45) * 0.45;
  } else {
    exposureRatio = 0.1;
  }

  let protection = point.reefProtection;
  if (point.hasOuterReef && isLowTide) {
    protection = Math.min(0.92, protection + 0.25);
  }

  const effectiveSwellHeight = rawSwellHeight * exposureRatio * (1 - protection);

  const g = 9.81;
  const L0 = (g * Math.pow(rawSwellPeriod, 2)) / (2 * Math.PI);
  const L = L0 * Math.tanh((2 * Math.PI * Math.max(point.targetDepth, 2)) / L0);
  const k = (2 * Math.PI) / Math.max(L, 1);

  const periodBoost = rawSwellPeriod >= 8 ? 1 + (rawSwellPeriod - 8) * 0.08 : 1.0;
  const surgeMeters = effectiveSwellHeight * Math.exp(-k * point.targetDepth) * periodBoost;
  const bottomSurgeCm = Math.round(surgeMeters * 100);

  let status: SwellEvaluation["status"] = "calm";
  let label = "穏やか（快適）";
  let advice = "底揺れはほぼありません。スキンダイビングに最適なコンディションです。";

  if (bottomSurgeCm >= 65) {
    status = "danger";
    label = "潜水危険（強い底揺れ）";
    advice = `水深${point.targetDepth}mで体が約${bottomSurgeCm}cm振られます。岩場への接触危険・激しい砂巻き上げあり。`;
  } else if (bottomSurgeCm >= 35) {
    status = "caution";
    label = "底揺れ注意（中級者以上）";
    advice = `水深${point.targetDepth}mで約${bottomSurgeCm}cmの揺れ。浅場のクレバスやリーフエッジの接近に注意。`;
  } else if (bottomSurgeCm >= 15) {
    status = "moderate";
    label = "やや揺れあり（潜水可能）";
    advice = `水深${point.targetDepth}mで${bottomSurgeCm}cm程度の軽い揺れを感じますが、問題なく潜れます。`;
  }

  return {
    effectiveSwellHeight: Number(effectiveSwellHeight.toFixed(2)),
    bottomSurgeCm,
    exposureRatio: Number(exposureRatio.toFixed(2)),
    status,
    label,
    advice
  };
}
