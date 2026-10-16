# 沖縄スキンダイビング専用「海中うねり（底揺れ）予報」開発仕様書 (SPEC.md 完全版)

## 1. プロジェクト概要
既存の波浪予報（Windy等）は沖合の粗いメッシュ数値をそのまま表示するため、リーフ（サンゴ礁）や岬に囲まれた沖縄のスキンダイビングポイントの実態と合わない。
本アプリは **Open-Meteo Marine API** の「うねり（Swell）の波高・周期・向き」を取得し、**全35箇所のポイント固有の地形（開口方位・インリーフ/アウトリーフ特性）** と **特定水深における水粒子の水平軌道幅（底揺れ・サージ）** を掛け合わせて、スキンダイバー目線の「水中の振られ幅（cm）」を算出する。

## 2. 技術スタックと構成
- **Framework:** Next.js (App Router), TypeScript, Tailwind CSS
- **Icons:** Lucide React
- **API:** Open-Meteo Marine API（APIキー不要、1時間キャッシュ `next: { revalidate: 3600 }` 必須）

---

## 3. 【重要】バグ防止のための絶対ルール（Claudeへの制約事項）
実装時は以下の5つの仕様・バグ回避策を**厳守**すること。

1. **角度計算の360度/0度ラップアラウンド対策**
   - 北向きのポイント（例: 350°〜30°）を判定する際、単純な大小比較を使うと0°をまたぐ判定でバグが起きる。必ず下記の `getAngleDiff(a, b)` 関数を使用すること。
2. **波の向きの定義**
   - Open-Meteoの `swell_wave_direction` は「波がやってくる方角（北=0°, 東=90°, 南=180°, 西=270°）」である。ポイントの `openDirection` と角度差が小さいほど直撃する（180度反転させないこと）。
3. **ゼロ除算・Nullガード**
   - `swell_wave_period` が `0` や `null` の場合、物理式の分母が0になり `NaN` が発生する。`period <= 1` または `height <= 0.05` の場合は即座に振幅 `0` を返すこと。
4. **【超重要】35箇所の一括API取得（レートリミット回避）**
   - 35箇所を `Promise.all` で35回個別fetchすると Open-Meteo の瞬間レートリミット（Too Many Requests）で落ちる。
   - 必ず全ポイントの緯度・経度をカンマ区切り（`latitude=26.08,26.12,...&longitude=127.70,127.76,...`）に連結し、**1回のAPIリクエストで一括取得**すること（複数座標を渡すとレスポンスは配列 `[...]` で返る）。
5. **動的データと静的カルテの分離**
   - リアルタイム数値計算は「うねり・波浪」に限定し、カレント（潮流）や濁り傾向・特徴は各ポイントの固定テキスト（`note`）としてカード内に表示すること。

---

## 4. 全35ポイント マスターデータ (`src/data/points.ts`)
以下の35箇所のデータを省略せず、そのまま実装すること。

```typescript
export type AreaCategory = "南部" | "中部" | "恩納村" | "名護・本部" | "国頭・北部" | "慶良間";

export interface DivePoint {
  id: string;
  name: string;
  subName?: string;
  area: AreaCategory;
  lat: number;
  lon: number;
  targetDepth: number;      // 基準水深(m)
  openDirection: number;    // 海が開けている方角 (0=北, 90=東, 180=南, 270=西)
  openAngleWidth: number;   // うねりが入る片側許容角
  reefProtection: number;   // リーフ減衰率 (0.0=外洋直結 〜 0.85=イノー内保護)
  hasOuterReef: boolean;    // 干潮時にうねりを遮断するアウターリーフの有無
  note: string;             // カレント・濁り・地形の固定アドバイス
}

export const DIVE_POINTS: DivePoint[] = [
  // ================= 南部（糸満・南城） =================
  {
    id: "odo-pool1",
    name: "大度海岸（ジョン万）",
    subName: "第1プール",
    area: "南部",
    lat: 26.088,
    lon: 127.709,
    targetDepth: 2.5,
    openDirection: 170,
    openAngleWidth: 65,
    reefProtection: 0.75,
    hasOuterReef: true,
    note: "最も浅くリーフに守られたエリア。干潮前後は外洋のうねりをほぼ完全にブロックする。"
  },
  {
    id: "odo-pool2",
    name: "大度海岸（ジョン万）",
    subName: "第2プール",
    area: "南部",
    lat: 26.088,
    lon: 127.709,
    targetDepth: 3.5,
    openDirection: 170,
    openAngleWidth: 70,
    reefProtection: 0.65,
    hasOuterReef: true,
    note: "熱帯魚が多いメインのイノー。満潮時で南うねりが強い日は水路から流れが入るので注意。"
  },
  {
    id: "odo-pool3",
    name: "大度海岸（ジョン万）",
    subName: "第3プール",
    area: "南部",
    lat: 26.088,
    lon: 127.709,
    targetDepth: 4.0,
    openDirection: 170,
    openAngleWidth: 70,
    reefProtection: 0.55,
    hasOuterReef: true,
    note: "沖のリーフ切れ目に近く、下げ潮時は沖向きのカレント（離岸流）が発生しやすい。"
  },
  {
    id: "odo-pool4",
    name: "大度海岸（ジョン万）",
    subName: "第4プール",
    area: "南部",
    lat: 26.088,
    lon: 127.709,
    targetDepth: 4.5,
    openDirection: 170,
    openAngleWidth: 75,
    reefProtection: 0.50,
    hasOuterReef: true,
    note: "外洋との水交換が良く透明度が高い分、うねりがある日は流れと揺れが入りやすい。"
  },
  {
    id: "odo-outer",
    name: "大度海岸（ジョン万）",
    subName: "アウトリーフ",
    area: "南部",
    lat: 26.086,
    lon: 127.709,
    targetDepth: 8.0,
    openDirection: 170,
    openAngleWidth: 85,
    reefProtection: 0.05,
    hasOuterReef: false,
    note: "【上級者向け】外洋のうねりが直撃するドロップオフ。ウミガメ遭遇率は高いがカレントと底揺れに厳重注意。"
  },
  {
    id: "oujima-in",
    name: "奥武島",
    subName: "インリーフ",
    area: "南部",
    lat: 26.128,
    lon: 127.773,
    targetDepth: 2.5,
    openDirection: 150,
    openAngleWidth: 65,
    reefProtection: 0.70,
    hasOuterReef: true,
    note: "北風に強い南部の定番ビーチ。インリーフは浅く穏やかで初心者や練習にも適する。"
  },
  {
    id: "oujima-out",
    name: "奥武島",
    subName: "アウトリーフ",
    area: "南部",
    lat: 26.126,
    lon: 127.774,
    targetDepth: 7.0,
    openDirection: 150,
    openAngleWidth: 80,
    reefProtection: 0.10,
    hasOuterReef: false,
    note: "南〜南東のうねりに敏感。リーフエッジ付近は潮通しと引き換えに波の押し引きが強まる。"
  },

  // ================= 中部（北谷・読谷） =================
  {
    id: "sunabe-cal",
    name: "砂辺（宮城海岸）",
    subName: "カリフォルニアサイド",
    area: "中部",
    lat: 26.326,
    lon: 127.744,
    targetDepth: 5.0,
    openDirection: 270,
    openAngleWidth: 75,
    reefProtection: 0.25,
    hasOuterReef: false,
    note: "東風の日にベタ凪になる。比謝川が近いため大雨の翌日は赤土・排水による濁りに注意。"
  },
  {
    id: "sunabe-water",
    name: "砂辺（宮城海岸）",
    subName: "浄水場前（No.1）",
    area: "中部",
    lat: 26.332,
    lon: 127.744,
    targetDepth: 6.0,
    openDirection: 275,
    openAngleWidth: 75,
    reefProtection: 0.20,
    hasOuterReef: false,
    note: "ソフトコーラル（お花畑）の群生地。西〜北西うねりが入ると階段エントリー口で波が立つ。"
  },
  {
    id: "senaha",
    name: "瀬名波（残波岬南）",
    area: "中部",
    lat: 26.432,
    lon: 127.716,
    targetDepth: 4.0,
    openDirection: 250,
    openAngleWidth: 70,
    reefProtection: 0.45,
    hasOuterReef: true,
    note: "リーフエッジまで距離があり浅場は守られているが、干潮時は水深が浅くなりすぎる点に注意。"
  },

  // ================= 恩納村 =================
  {
    id: "maeda",
    name: "真栄田岬",
    area: "恩納村",
    lat: 26.443,
    lon: 127.771,
    targetDepth: 6.0,
    openDirection: 15,
    openAngleWidth: 75,
    reefProtection: 0.10,
    hasOuterReef: false,
    note: "北〜北東うねりに極めて敏感。少しでも周期の長い北うねりが入ると階段口で強い引き波が発生。"
  },
  {
    id: "yamada",
    name: "山田ポイント（谷川）",
    area: "恩納村",
    lat: 26.440,
    lon: 127.782,
    targetDepth: 5.0,
    openDirection: 350,
    openAngleWidth: 65,
    reefProtection: 0.40,
    hasOuterReef: true,
    note: "真栄田岬のすぐ隣だが遠浅のリーフに守られており、真栄田よりうねりが一段階抑えられる。"
  },
  {
    id: "apogama",
    name: "アポガマ（万座毛北）",
    area: "恩納村",
    lat: 26.506,
    lon: 127.850,
    targetDepth: 7.0,
    openDirection: 315,
    openAngleWidth: 75,
    reefProtection: 0.15,
    hasOuterReef: false,
    note: "地形とドロップオフが魅力。北西うねりが入ると岩場のエントリー・エキジットが危険になる。"
  },
  {
    id: "diamond-beach",
    name: "ダイヤモンドビーチ",
    area: "恩納村",
    lat: 26.512,
    lon: 127.868,
    targetDepth: 3.5,
    openDirection: 330,
    openAngleWidth: 65,
    reefProtection: 0.55,
    hasOuterReef: true,
    note: "インリーフの砂地とサンゴが美しい。干潮時はアウターリーフがうねりを軽減する。"
  },
  {
    id: "akatida-banta",
    name: "アカティーダバンタ",
    area: "恩納村",
    lat: 26.515,
    lon: 127.872,
    targetDepth: 4.0,
    openDirection: 330,
    openAngleWidth: 65,
    reefProtection: 0.50,
    hasOuterReef: true,
    note: "北西〜北うねりに注意。夏場の南風コンディションで透明度と穏やかさが抜群になる。"
  },
  {
    id: "kibogaoka",
    name: "希望ヶ丘（インブ）",
    area: "恩納村",
    lat: 26.533,
    lon: 127.915,
    targetDepth: 4.5,
    openDirection: 320,
    openAngleWidth: 65,
    reefProtection: 0.45,
    hasOuterReef: true,
    note: "沖のリーフパッチに魚影が濃い。北西のうねりが強い日は水路の流れに注意。"
  },

  // ================= 名護・本部 =================
  {
    id: "awa",
    name: "安和海岸展望駐車場（石切）",
    area: "名護・本部",
    lat: 26.616,
    lon: 127.940,
    targetDepth: 5.0,
    openDirection: 205,
    openAngleWidth: 55,
    reefProtection: 0.45,
    hasOuterReef: false,
    note: "本部半島が北風・北うねりを完全にブロックするため、冬場の北風強風時に極めて強い。"
  },
  {
    id: "shiokawa",
    name: "塩川港（崎本部ロードパーク）",
    area: "名護・本部",
    lat: 26.631,
    lon: 127.896,
    targetDepth: 5.0,
    openDirection: 215,
    openAngleWidth: 50,
    reefProtection: 0.50,
    hasOuterReef: false,
    note: "北うねりに強い名護湾奥の避難ポイント。南西うねりが入る日のみ底揺れと濁りが出る。"
  },
  {
    id: "gorilla-chop",
    name: "ゴリラチョップ（桟橋付近）",
    area: "名護・本部",
    lat: 26.638,
    lon: 127.881,
    targetDepth: 4.5,
    openDirection: 225,
    openAngleWidth: 45,
    reefProtection: 0.60,
    hasOuterReef: false,
    note: "冬の北風に圧倒的に強い定番スポット。砂地のため南西うねり時のみ巻き上げで濁る。"
  },
  {
    id: "anchi-hama",
    name: "アンチ浜（瀬底島大橋下）",
    area: "名護・本部",
    lat: 26.646,
    lon: 127.869,
    targetDepth: 5.0,
    openDirection: 190,
    openAngleWidth: 50,
    reefProtection: 0.45,
    hasOuterReef: false,
    note: "瀬底島と本部の間の海峡に面するため、うねりは弱くても大潮時の潮流（カレント）に注意。"
  },
  {
    id: "labyrinth",
    name: "ラビリンス（瀬底島西）",
    area: "名護・本部",
    lat: 26.644,
    lon: 127.854,
    targetDepth: 5.0,
    openDirection: 290,
    openAngleWidth: 70,
    reefProtection: 0.25,
    hasOuterReef: false,
    note: "地形（クレバス・洞窟）ポイント。西〜北西うねりが入ると水路内で強い底揺れ（サージ）が発生。"
  },
  {
    id: "bisezaki",
    name: "備瀬崎",
    area: "名護・本部",
    lat: 26.709,
    lon: 127.878,
    targetDepth: 3.0,
    openDirection: 310,
    openAngleWidth: 80,
    reefProtection: 0.50,
    hasOuterReef: true,
    note: "北西に突き出た岬。干潮時は穏やかだが、満潮からの下げ潮時は先端周辺で速い潮流が出る。"
  },
  {
    id: "minna",
    name: "水納島",
    area: "名護・本部",
    lat: 26.648,
    lon: 127.817,
    targetDepth: 6.0,
    openDirection: 20,
    openAngleWidth: 80,
    reefProtection: 0.20,
    hasOuterReef: false,
    note: "抜群の透明度を誇る離島。周囲が外洋に囲まれているため周期の長い北〜西うねりに敏感。"
  },

  // ================= 国頭・北部 =================
  {
    id: "hentona",
    name: "辺土名",
    area: "国頭・北部",
    lat: 26.746,
    lon: 128.177,
    targetDepth: 5.0,
    openDirection: 300,
    openAngleWidth: 75,
    reefProtection: 0.35,
    hasOuterReef: true,
    note: "東〜南東風の日に穏やかになるやんばる西海岸。冬場の北西季節風・うねりは直撃する。"
  },
  {
    id: "ginama",
    name: "宜名真（茅打バンタ下）",
    area: "国頭・北部",
    lat: 26.848,
    lon: 128.252,
    targetDepth: 6.0,
    openDirection: 300,
    openAngleWidth: 80,
    reefProtection: 0.15,
    hasOuterReef: false,
    note: "外洋に面したダイナミックな海域。北西のうねりが少しでもある日は底揺れが強く入る。"
  },
  {
    id: "futagami-iwa",
    name: "二神岩",
    area: "国頭・北部",
    lat: 26.858,
    lon: 128.256,
    targetDepth: 7.0,
    openDirection: 310,
    openAngleWidth: 85,
    reefProtection: 0.05,
    hasOuterReef: false,
    note: "辺戸岬手前の外洋直結スポット。リーフの遮蔽がほぼ無く、うねりと潮流の影響をダイレクトに受ける。"
  },
  {
    id: "hedo-misaki",
    name: "辺戸岬",
    area: "国頭・北部",
    lat: 26.872,
    lon: 128.266,
    targetDepth: 8.0,
    openDirection: 0,
    openAngleWidth: 110,
    reefProtection: 0.0,
    hasOuterReef: false,
    note: "【上級者限定】太平洋と東シナ海がぶつかる最北端。波浪・潮流ともに極めて強くベタ凪の日限定。"
  },
  {
    id: "chishi",
    name: "チシ展望台（安田・東海岸）",
    area: "国頭・北部",
    lat: 26.762,
    lon: 128.326,
    targetDepth: 5.0,
    openDirection: 75,
    openAngleWidth: 75,
    reefProtection: 0.30,
    hasOuterReef: true,
    note: "貴重な東海岸ポイント。西〜南西風の日に風裏となり穏やかだが、太平洋側の東うねりに注意。"
  },

  // ================= 慶良間（チービシ・阿嘉島） =================
  {
    id: "chibishi",
    name: "チービシ（ナガンヌ・神山・クエフ）",
    area: "慶良間",
    lat: 26.262,
    lon: 127.550,
    targetDepth: 6.0,
    openDirection: 180,
    openAngleWidth: 120,
    reefProtection: 0.25,
    hasOuterReef: false,
    note: "遮る陸地が少ない環礁エリア。アンカリング場所の選び方で風は避けられるが周期の長いうねりは回り込む。"
  },
  {
    id: "nishibama",
    name: "北浜ビーチ（ニシバマ / 阿嘉島）",
    area: "慶良間",
    lat: 26.195,
    lon: 127.288,
    targetDepth: 5.0,
    openDirection: 45,
    openAngleWidth: 70,
    reefProtection: 0.30,
    hasOuterReef: false,
    note: "北東向き。南〜南西風の夏場は最高のケラマブルーになるが、北東風・北うねりの日は波が立つ。"
  },
  {
    id: "hizushi",
    name: "ヒズシビーチ（阿嘉島）",
    area: "慶良間",
    lat: 26.185,
    lon: 127.275,
    targetDepth: 3.5,
    openDirection: 210,
    openAngleWidth: 60,
    reefProtection: 0.55,
    hasOuterReef: true,
    note: "南西向き。ニシバマが北風で荒れている日の完璧な風裏・避難ポイント。干潮時はかなり浅くなる。"
  },
  {
    id: "hijuishi",
    name: "ヒジュイシビーチ（阿嘉島・阿嘉ビーチ）",
    area: "慶良間",
    lat: 26.187,
    lon: 127.282,
    targetDepth: 4.0,
    openDirection: 150,
    openAngleWidth: 65,
    reefProtection: 0.45,
    hasOuterReef: true,
    note: "南東向きでウミガメの遭遇率が極めて高い。北〜北西の風・うねりに強い。"
  }
];
```

---

## 5. コア計算ロジック (`src/lib/swellCalc.ts`)
以下の物理・地形補正ロジックを正確に実装すること。

```typescript
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
```

---

## 6. 一括API取得とUI要件
1. **API一括取得 (`src/lib/fetchMarineData.ts`):**
   - `DIVE_POINTS` の全 `lat` と `lon` をカンマ区切りで結合し、`https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}&hourly=wave_height,swell_wave_height,swell_wave_direction,swell_wave_period&timezone=Asia%2FTokyo&forecast_days=3` を **1回の `fetch`（`revalidate: 3600`）で取得**すること。
2. **UIフィルターとカード表示 (`src/app/page.tsx`):**
   - 上部に**エリア別タブ**（「すべて」「南部」「中部」「恩納村」「名護・本部」「国頭・北部」「慶良間」）と、「日時スライダー（72時間）」「干潮モード（アウターリーフ遮断）ON/OFFトグル」を配置する。
   - 各カードにはポイント名（＋ `subName` のバッジ）、海中の振られ幅（`bottomSurgeCm` cm）、4段階ステータスバッジ、うねり向きとポイント開口向きの視覚インジケーター、および固定カルテ（`note`）を表示すること。