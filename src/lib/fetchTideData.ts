import { cacheLife } from "next/cache";
import { addDays, parseJmaTideLine, type TideData, type TideDay } from "@/lib/tideCalc";

const STATION_CODE = "NH"; // 気象庁 潮位表 地点記号: 那覇

/**
 * 那覇の天文潮位（気象庁 潮位表）を取得。
 * 範囲: 今月1日の前日 〜 翌月末（72時間予報 + 月間カレンダー用）
 * 年をまたぐ場合は両年のファイルを取得する。
 */
async function fetchTideDataCached(): Promise<TideData> {
  "use cache";
  cacheLife("days");

  const todayJst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const [y, m] = todayJst.split("-").map(Number);
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const start = addDays(monthStart, -1);
  const nextNextMonth = m >= 11 ? `${y + 1}-${String(m - 10).padStart(2, "0")}-01` : `${y}-${String(m + 2).padStart(2, "0")}-01`;
  const end = addDays(nextNextMonth, -1);

  const years = Array.from(new Set([start.slice(0, 4), end.slice(0, 4)]));

  const texts = await Promise.all(
    years.map(async (yr) => {
      const res = await fetch(
        `https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/${yr}/${STATION_CODE}.txt`,
        { next: { revalidate: 86400 } }
      );
      if (!res.ok) throw new Error(`気象庁潮位表 HTTP ${res.status}`);
      return res.text();
    })
  );

  const days: Record<string, TideDay> = {};
  for (const text of texts) {
    for (const line of text.split(/\r?\n/)) {
      const d = parseJmaTideLine(line);
      if (d && d.date >= start && d.date <= end) days[d.date] = d;
    }
  }
  if (Object.keys(days).length === 0) throw new Error("潮位データが空です");
  return { station: "那覇", days };
}

export async function fetchTideData(): Promise<TideData> {
  try {
    return await fetchTideDataCached();
  } catch (e) {
    return {
      station: "那覇",
      days: {},
      error: e instanceof Error ? e.message : "潮位データ取得失敗",
    };
  }
}
