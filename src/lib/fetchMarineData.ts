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
  /** 過去24時間の累積降水量 (mm) */
  past24hRainMm: (number | null)[];
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
    precipitation?: (number | null)[];
  };
}

const asList = <T,>(json: T | T[]) => (Array.isArray(json) ? json : [json]);

/** 一時的なOpen-Meteoのエラーや非JSONレスポンス("Unexpected...")に対するリトライ付きJSON取得 */
async function fetchJsonWithRetry<T>(url: string, label: string, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { next: { revalidate: 3600 } });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`${label} HTTP ${res.status}: ${text.slice(0, 80)}`);
      }
      const trimmed = text.trim();
      if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) {
        throw new Error(`${label} invalid body: ${trimmed.slice(0, 80)}`);
      }
      return JSON.parse(trimmed) as T;
    } catch (e) {
      lastErr = e;
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${label} fetch failed`);
}

/**
 * 全ポイントを一括取得（近接メッシュを統合してAPIコール数とURL長を削減）
 * - 海況: Marine API に1回
 * - 風:   Forecast API に1回
 */
async function fetchMarineDataCached(pointsSignature: string): Promise<MarineResult> {
  "use cache";
  cacheLife("hours");
  void pointsSignature;

  // 約2km四方(小数点第2位)で同一の座標を統合し、APIコール数とURL長を削減
  const meshKeys: string[] = [];
  const meshCoords: { lat: string; lon: string }[] = [];
  const pointToMeshIdx: number[] = [];
  const keyToIdx = new Map<string, number>();

  DIVE_POINTS.forEach((p) => {
    const latStr = p.lat.toFixed(3);
    const lonStr = p.lon.toFixed(3);
    const key = `${latStr},${lonStr}`;
    let idx = keyToIdx.get(key);
    if (idx === undefined) {
      idx = meshCoords.length;
      keyToIdx.set(key, idx);
      meshKeys.push(key);
      meshCoords.push({ lat: latStr, lon: lonStr });
    }
    pointToMeshIdx.push(idx);
  });

  const lats = meshCoords.map((c) => c.lat).join(",");
  const lons = meshCoords.map((c) => c.lon).join(",");
  const common = `latitude=${lats}&longitude=${lons}&timezone=Asia%2FTokyo&forecast_days=3`;

  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?${common}` +
    `&hourly=wave_height,wind_wave_height,swell_wave_height,swell_wave_direction,swell_wave_period`;
  const windUrl =
    `https://api.open-meteo.com/v1/forecast?${common}&past_days=1` +
    `&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation&wind_speed_unit=ms`;

  const marineRaw = await fetchJsonWithRetry<MarineLocation | MarineLocation[]>(
    marineUrl,
    "Open-Meteo Marine"
  );
  const marine = asList(marineRaw);

  // 風の取得失敗は致命的にしない（海況は表示を続ける）
  let wind: WindLocation[] = [];
  let windError: string | undefined;
  try {
    const windRaw = await fetchJsonWithRetry<WindLocation | WindLocation[]>(
      windUrl,
      "Open-Meteo Forecast",
      2
    );
    wind = asList(windRaw);
  } catch (e) {
    windError = e instanceof Error ? e.message : "風データ取得失敗";
  }

  const byPointId: Record<string, PointHourly> = {};
  DIVE_POINTS.forEach((p, pointIdx) => {
    const meshIdx = pointToMeshIdx[pointIdx];
    const h = marine[meshIdx]?.hourly;
    if (!h) return;
    const w = wind[meshIdx]?.hourly;
    const wIdx = new Map(w?.time.map((t, k) => [t, k]) ?? []);
    const pick = (arr?: (number | null)[]) =>
      h.time.map((t) => {
        const k = wIdx.get(t);
        return k === undefined || !arr ? null : arr[k] ?? null;
      });
    const past24hRainMm = h.time.map((t) => {
      const k = wIdx.get(t);
      if (k === undefined || !w?.precipitation) return null;
      const start = Math.max(0, k - 23);
      let sum = 0;
      for (let m = start; m <= k; m++) {
        sum += w.precipitation[m] ?? 0;
      }
      return Math.round(sum * 10) / 10;
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
      past24hRainMm,
    };
  });

  if (Object.keys(byPointId).length === 0) {
    throw new Error("海況データが空です");
  }

  return {
    byPointId,
    fetchedAt: new Date().toISOString(),
    error: windError,
  };
}

/**
 * エラー時に空データを1時間キャッシュしてしまわないよう、
 * "use cache" 関数の中で例外を投げさせ、外側でキャッチする。
 */
export async function fetchMarineData(): Promise<MarineResult> {
  const sig = DIVE_POINTS.map((p) => `${p.id}:${p.lat.toFixed(3)},${p.lon.toFixed(3)}`).join("|");
  try {
    return await fetchMarineDataCached(sig);
  } catch (e) {
    return {
      byPointId: {},
      fetchedAt: new Date().toISOString(),
      error: e instanceof Error ? e.message : "unknown error",
    };
  }
}
