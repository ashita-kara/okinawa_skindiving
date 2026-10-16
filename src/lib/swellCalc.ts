import { DivePoint } from "@/data/points";

/** 潮位入力（その時刻の推計潮位と、1時間前からの変化量） */
export interface TideInput {
  tideCm: number | null;
  /** 1時間前との潮位差 (cm/h)。マイナス=下げ潮 */
  deltaCm: number | null;
}

export interface CurrentAlert {
  type: "ebb" | "surge";
  title: string;
  message: string;
}

export interface SwellEvaluation {
  effectiveSwellHeight: number; // 地形・リーフ補正後の実効うねり高 (m)
  bottomSurgeCm: number;        // 指定水深での体の振られ幅 (cm)
  exposureRatio: number;        // うねりの直撃率 (0.1 〜 1.0)
  status: "calm" | "moderate" | "caution" | "danger";
  label: string;
  advice: string;
  /** 干潮でアウターリーフの自動遮蔽が効いているか */
  reefShielded: boolean;
  tideCm: number | null;
  /** 離岸流（リーフカレント）注意報。該当なしなら空配列 */
  currentAlerts: CurrentAlert[];
}

export const EBB_ALERT: CurrentAlert = {
  type: "ebb",
  title: "引き潮離岸流に注意",
  message:
    "現在、潮が速く引いています。プール内は穏やかでも、プール間の移動やリーフの切れ目（水路）で沖へ向かう強い流れが発生しやすい状態です。",
};

export const SURGE_ALERT: CurrentAlert = {
  type: "surge",
  title: "満潮・うねり離岸流に注意",
  message:
    "満潮付近で外洋のうねりがリーフを越えて流入しています。インリーフからアウトリーフの境界や水路で強い引き波・離岸流が発生しやすい状態です。",
};

export function getAngleDiff(angle1: number, angle2: number): number {
  const diff = Math.abs(angle1 - angle2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** うねりの直撃率 (0.1〜1.0)。開口方位との角度差から算出 */
export function getExposureRatio(swellDir: number, point: DivePoint): number {
  const angleDiff = getAngleDiff(swellDir, point.openDirection);
  if (angleDiff <= point.openAngleWidth) {
    const normalized = angleDiff / point.openAngleWidth;
    return 1.0 - normalized * 0.4;
  }
  if (angleDiff <= point.openAngleWidth + 45) {
    const overAngle = angleDiff - point.openAngleWidth;
    return 0.6 - (overAngle / 45) * 0.45;
  }
  return 0.1;
}

/** 潮位がリーフ閾値以下なら、アウターリーフの遮蔽補正を自動適用 */
export function isReefShielded(point: DivePoint, tideCm: number | null): boolean {
  return (
    point.hasOuterReef &&
    point.reefThresholdCm !== undefined &&
    tideCm !== null &&
    tideCm <= point.reefThresholdCm
  );
}

/**
 * 離岸流（リーフカレント）注意報。
 * リーフ型ポイント（reefThresholdCm 設定あり）のみ対象。
 * ※流速の断定はせず「発生しやすい状態」の注意喚起に留める。
 */
export function getCurrentAlerts(
  point: DivePoint,
  tide: TideInput | undefined,
  incidentSwellHeight: number
): CurrentAlert[] {
  if (point.reefThresholdCm === undefined || !tide || tide.tideCm === null) return [];
  const alerts: CurrentAlert[] = [];
  // A: 下げ潮が速く、潮位が中位帯
  if (tide.deltaCm !== null && tide.deltaCm <= -15 && tide.tideCm >= 50 && tide.tideCm <= 140) {
    alerts.push(EBB_ALERT);
  }
  // B: 満潮付近 + リーフ減衰前の入射うねりが大きい
  if (tide.tideCm >= 110 && incidentSwellHeight >= 0.5) {
    alerts.push(SURGE_ALERT);
  }
  return alerts;
}

export function calculateUnderwaterSurge(
  rawSwellHeight: number | null,
  rawSwellPeriod: number | null,
  rawSwellDir: number | null,
  point: DivePoint,
  tide?: TideInput
): SwellEvaluation {
  const tideCm = tide?.tideCm ?? null;
  const reefShielded = isReefShielded(point, tideCm);

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
      advice: "水中は完全に安定しています。透明度も期待できます。",
      reefShielded,
      tideCm,
      currentAlerts: getCurrentAlerts(point, tide, 0),
    };
  }

  const exposureRatio = getExposureRatio(rawSwellDir, point);

  let protection = point.reefProtection;
  if (reefShielded) {
    protection = Math.min(0.92, protection + 0.25);
  }

  const incidentSwellHeight = rawSwellHeight * exposureRatio; // リーフ減衰前の入射うねり
  const effectiveSwellHeight = incidentSwellHeight * (1 - protection);

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
    advice,
    reefShielded,
    tideCm,
    currentAlerts: getCurrentAlerts(point, tide, incidentSwellHeight),
  };
}

/**
 * 波乗り高さ（フェイス波高の目安）。
 * 開口方位で補正した入射うねりから、Komar-Gaughan式で砕波高を推定する。
 * Hb = 0.39 * g^0.2 * (T * H0^2)^0.4
 */
export function estimateSurfFace(
  rawSwellHeight: number | null,
  rawSwellPeriod: number | null,
  rawSwellDir: number | null,
  point: DivePoint
): { meters: number; label: string } | null {
  if (!rawSwellHeight || !rawSwellPeriod || rawSwellDir === null || rawSwellPeriod <= 1) return null;
  const h0 = rawSwellHeight * getExposureRatio(rawSwellDir, point);
  const hb = 0.39 * Math.pow(9.81, 0.2) * Math.pow(rawSwellPeriod * h0 * h0, 0.4);
  const m = Number(hb.toFixed(1));
  const label =
    hb < 0.3 ? "フラット" :
    hb < 0.45 ? "ヒザ" :
    hb < 0.65 ? "モモ" :
    hb < 0.85 ? "コシ" :
    hb < 1.0 ? "ハラ" :
    hb < 1.25 ? "ムネ" :
    hb < 1.45 ? "カタ" :
    hb < 1.8 ? "アタマ" : "頭上";
  return { meters: m, label };
}
