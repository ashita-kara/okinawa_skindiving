import { cacheLife } from "next/cache";
import { DIVE_POINTS } from "@/data/points";

export interface PointHourly {
  time: string[];
  waveHeight: (number | null)[];
  windWaveHeight: (number | null)[];
  swellHeight: (number | null)[];
  swellDirection: (number | null)[];
  swellPeriod: (number | null)[];
  /** 風速 (m/s, 地上10m) */
  windSpeed: (number | null)[];
  /** 最大瞬間風速 (m/s) */
  windGusts: (number | null)[];
  /** 風が吹いてくる方角 (0=北) */
  windDirection: (number | null)[];
}

export interface MarineResult {
  byPointId: Record<string, PointHourly>;
  fetchedAt: string;
  error?: string;
}

interface MarineLocation {
  hourly?: {
    time: string[];
    wave_height: (number | null)[];
    wind_wave_height: (number | null)[];
    swell_wave_height: (number | null)[];
    swell_wave_direction: (number | null)[];
    swell_wave_period: (number | null)[];
  };
}

interface WindLocation {
  hourly?: {
    time: string[];
    wind_speed_10m: (number | null)[];
    wind_gusts_10m: (number | null)[];
    wind_direction_10m: (number | null)[];
  };
}

const asList = <T,>(json: T | T[]) => (Array.isArray(json) ? json : [json]);

/**
 * 全ポイントを一括取得（レートリミット回避）
 * - 海況: Marine API に1回
 * - 風:   Forecast API に1回
 */
export async function fetchMarineData(): Promise<MarineResult> {
  "use cache";
  cacheLife("hours");

  const lats = DIVE_POINTS.map((p) => p.lat).join(",");
  const lons = DIVE_POINTS.map((p) => p.lon).join(",");
  const common = `latitude=${lats}&longitude=${lons}&timezone=Asia%2FTokyo&forecast_days=3`;

  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?${common}` +
    `&hourly=wave_height,wind_wave_height,swell_wave_height,swell_wave_direction,swell_wave_period`;
  const windUrl =
    `https://api.open-meteo.com/v1/forecast?${common}` +
    `&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m&wind_speed_unit=ms`;

  try {
    const [marineRes, windRes] = await Promise.all([
      fetch(marineUrl, { next: { revalidate: 3600 } }),
      fetch(windUrl, { next: { revalidate: 3600 } }),
    ]);
    if (!marineRes.ok) throw new Error(`Open-Meteo Marine HTTP ${marineRes.status}`);
    const marine = asList((await marineRes.json()) as MarineLocation | MarineLocation[]);
    // 風の取得失敗は致命的にしない（海況は表示を続ける）
    const wind = windRes.ok ? asList((await windRes.json()) as WindLocation | WindLocation[]) : [];

    const byPointId: Record<string, PointHourly> = {};
    DIVE_POINTS.forEach((p, i) => {
      const h = marine[i]?.hourly;
      if (!h) return;
      const w = wind[i]?.hourly;
      // 時刻キーで突き合わせ（両APIの時刻配列ずれ対策）
      const wIdx = new Map(w?.time.map((t, k) => [t, k]) ?? []);
      const pick = (arr?: (number | null)[]) =>
        h.time.map((t) => {
          const k = wIdx.get(t);
          return k === undefined || !arr ? null : arr[k] ?? null;
        });
      byPointId[p.id] = {
        time: h.time,
        waveHeight: h.wave_height,
        windWaveHeight: h.wind_wave_height,
        swellHeight: h.swell_wave_height,
        swellDirection: h.swell_wave_direction,
        swellPeriod: h.swell_wave_period,
        windSpeed: pick(w?.wind_speed_10m),
        windGusts: pick(w?.wind_gusts_10m),
        windDirection: pick(w?.wind_direction_10m),
      };
    });
    return {
      byPointId,
      fetchedAt: new Date().toISOString(),
      error: windRes.ok ? undefined : `風データ取得失敗 (HTTP ${windRes.status})`,
    };
  } catch (e) {
    return {
      byPointId: {},
      fetchedAt: new Date().toISOString(),
      error: e instanceof Error ? e.message : "unknown error",
    };
  }
}
