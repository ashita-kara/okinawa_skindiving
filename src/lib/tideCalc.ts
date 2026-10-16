/**
 * 潮汐ユーティリティ（クライアント/サーバー共用の純粋関数）
 * 潮位データ: 気象庁「潮位表」那覇(NH) の天文潮位予測（潮位表基準面, cm）
 */

export type TideName = "大潮" | "中潮" | "小潮" | "長潮" | "若潮";

export interface TideEvent {
  time: string; // "HH:MM"
  cm: number;
}

export interface TideDay {
  date: string; // "YYYY-MM-DD"
  hourly: number[]; // 0〜23時の潮位(cm)
  highs: TideEvent[];
  lows: TideEvent[];
  moonAge: number; // 正午(JST)の月齢
  tideName: TideName;
}

export interface TideData {
  station: string;
  days: Record<string, TideDay>;
  error?: string;
}

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

/** "YYYY-MM-DD" → 曜日（タイムゾーン非依存） */
export function weekdayJa(date: string): string {
  return WEEK[new Date(date.slice(0, 10) + "T00:00:00Z").getUTCDay()];
}

/** 日付文字列に日数を加算 */
export function addDays(date: string, n: number): string {
  const d = new Date(date.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const SYNODIC = 29.530588861;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** k番目の新月のユリウス日（Meeus『Astronomical Algorithms』49章、誤差数分程度） */
function newMoonJd(k: number): number {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const M = rad(2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3);
  const Mp = rad(201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3);
  const F = rad(160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3);
  const Om = rad(124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3);
  const jde = 2451550.09766 + SYNODIC * k + 0.00015437 * T2 - 0.00000015 * T3;
  const corr =
    -0.4072 * Math.sin(Mp) +
    0.17241 * E * Math.sin(M) +
    0.01608 * Math.sin(2 * Mp) +
    0.01039 * Math.sin(2 * F) +
    0.00739 * E * Math.sin(Mp - M) -
    0.00514 * E * Math.sin(Mp + M) +
    0.00208 * E * E * Math.sin(2 * M) -
    0.00111 * Math.sin(Mp - 2 * F) -
    0.00057 * Math.sin(Mp + 2 * F) +
    0.00056 * E * Math.sin(2 * Mp + M) -
    0.00042 * Math.sin(3 * Mp) +
    0.00042 * E * Math.sin(M + 2 * F) +
    0.00038 * E * Math.sin(M - 2 * F) -
    0.00024 * E * Math.sin(2 * Mp - M) -
    0.00017 * Math.sin(Om);
  return jde + corr;
}

/** 指定ユリウス日の直前の新月のユリウス日 */
function lastNewMoonJd(jd: number): number {
  let k = Math.floor((jd - 2451550.09766) / SYNODIC);
  while (newMoonJd(k) > jd) k--;
  while (newMoonJd(k + 1) <= jd) k++;
  return newMoonJd(k);
}

const jdToJstDate = (jd: number) => new Date((jd - 2440587.5) * 86400000 + 9 * 3600_000).toISOString().slice(0, 10);

/** 正午(JST)の月齢 */
export function moonAgeAt(date: string): number {
  const jd = Date.parse(date + "T03:00:00Z") / 86400000 + 2440587.5;
  return jd - lastNewMoonJd(jd);
}

/** 旧暦日（日本時間で新月を含む日を1日とする） */
export function lunarDayAt(date: string): number {
  const endOfDayJd = Date.parse(date + "T14:59:59Z") / 86400000 + 2440587.5; // JST 23:59:59
  const nmDate = jdToJstDate(lastNewMoonJd(endOfDayJd));
  return Math.round((Date.parse(date) - Date.parse(nmDate)) / 86400000) + 1;
}

/** 旧暦日 → 潮名（慣用区分） */
export function tideNameFromLunarDay(d: number): TideName {
  if (d <= 3 || d >= 30) return "大潮";
  if (d <= 6) return "中潮";
  if (d <= 9) return "小潮";
  if (d === 10) return "長潮";
  if (d === 11) return "若潮";
  if (d <= 13) return "中潮";
  if (d <= 17) return "大潮";
  if (d <= 21) return "中潮";
  if (d <= 24) return "小潮";
  if (d === 25) return "長潮";
  if (d === 26) return "若潮";
  return "中潮";
}

export function moonEmoji(age: number): string {
  const icons = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
  return icons[Math.round((age / SYNODIC) * 8) % 8];
}

/**
 * 気象庁 潮位表テキスト(1日1行)を解析
 * 1-72: 毎時潮位(3桁×24) / 73-78: 年月日 / 79-80: 地点 / 81-108: 満潮(時刻4桁+潮位3桁)×4 / 109-136: 干潮×4
 */
export function parseJmaTideLine(line: string): TideDay | null {
  if (line.length < 136) return null;
  const num = (s: string) => parseInt(s.trim(), 10);
  const hourly: number[] = [];
  for (let h = 0; h < 24; h++) hourly.push(num(line.slice(h * 3, h * 3 + 3)));
  const yy = num(line.slice(72, 74));
  const mm = num(line.slice(74, 76));
  const dd = num(line.slice(76, 78));
  if ([yy, mm, dd, ...hourly].some((v) => Number.isNaN(v))) return null;
  const date = `${2000 + yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;

  const events = (start: number): TideEvent[] => {
    const out: TideEvent[] = [];
    for (let k = 0; k < 4; k++) {
      const seg = line.slice(start + k * 7, start + k * 7 + 7);
      if (seg.startsWith("9999") || seg.trim() === "") continue;
      const hh = num(seg.slice(0, 2));
      const mi = num(seg.slice(2, 4));
      const cm = num(seg.slice(4, 7));
      if ([hh, mi, cm].some((v) => Number.isNaN(v)) || cm === 999) continue;
      out.push({ time: `${String(hh).padStart(2, "0")}:${String(mi).padStart(2, "0")}`, cm });
    }
    return out;
  };

  const moonAge = moonAgeAt(date);
  return {
    date,
    hourly,
    highs: events(80),
    lows: events(108),
    moonAge: Number(moonAge.toFixed(1)),
    tideName: tideNameFromLunarDay(lunarDayAt(date)),
  };
}

/** 指定時刻("YYYY-MM-DDTHH:MM")の潮位(cm) */
export function getTideCm(tide: TideData | undefined, time: string | undefined): number | null {
  if (!tide || !time) return null;
  const day = tide.days[time.slice(0, 10)];
  const h = Number(time.slice(11, 13));
  return day && Number.isFinite(h) ? day.hourly[h] ?? null : null;
}

/** 指定時刻の潮位と、1時間前からの変化量(cm/h) */
export function getTideInput(tide: TideData | undefined, time: string | undefined) {
  const tideCm = getTideCm(tide, time);
  if (!time || tideCm === null) return { tideCm, deltaCm: null };
  const h = Number(time.slice(11, 13));
  const prevTime = h === 0 ? `${addDays(time, -1)}T23:00` : `${time.slice(0, 11)}${String(h - 1).padStart(2, "0")}:00`;
  const prev = getTideCm(tide, prevTime);
  return { tideCm, deltaCm: prev === null ? null : tideCm - prev };
}
