import { parseCsv } from "./samsung";
import type { DayEntry, DaysMap, MonthItem } from "./types";

export interface HistoryImport { days: DayEntry[]; months: MonthItem[]; kind: "weight" | "activity" }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const n = (v: string | undefined) => { const x = Number((v ?? "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };

/**
 * One-off import of history so charts don't start from the first day of use.
 * Accepts `date,kg,origin` (weights) or `month,tracker,run_km,walk_km,bike_km,runs` (monthly activity).
 * Weights never overwrite a weight that is already recorded for that day.
 */
export function parseHistory(text: string, existing: DaysMap, now = new Date()): HistoryImport {
  const rows = parseCsv(text);
  const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const stamp = now.toISOString();
  const col = (name: string) => head.indexOf(name);

  if (col("date") >= 0 && col("kg") >= 0) {
    const iD = col("date"), iK = col("kg"), iO = col("origin");
    const best = new Map<string, { kg: number; origin: string }>();
    for (const r of rows.slice(1)) {
      const date = (r[iD] ?? "").trim();
      const kg = n(r[iK]);
      if (!DATE_RE.test(date) || kg <= 0) continue;
      const origin = iO >= 0 ? (r[iO] ?? "").trim() : "";
      const cur = best.get(date);
      // When a day has two records, the one from the scales wins over a note.
      if (!cur || (/OKOK|ваги|scale/i.test(origin) && !/OKOK|ваги|scale/i.test(cur.origin))) best.set(date, { kg, origin });
    }
    const days: DayEntry[] = [];
    for (const [date, w] of best) {
      const d = existing[date];
      if (d?.weight != null) continue;
      const next: DayEntry = { ...(d ?? { date }), date, weight: Math.round(w.kg * 10) / 10, weightCond: "other", updatedAt: stamp };
      if (w.origin) next.weightOrigin = w.origin;
      delete next.noWeight;
      days.push(next);
    }
    return { days, months: [], kind: "weight" };
  }

  if (col("month") >= 0 && col("walk_km") >= 0) {
    const months: MonthItem[] = [];
    for (const r of rows.slice(1)) {
      const month = (r[col("month")] ?? "").trim();
      const tracker = (r[col("tracker")] ?? "").trim();
      if (!MONTH_RE.test(month) || !tracker) continue; // rows without a tracker mean "no data", not zero
      months.push({
        id: "hm-" + month, kind: "hmonth", month, tracker,
        runKm: n(r[col("run_km")]), walkKm: n(r[col("walk_km")]), bikeKm: n(r[col("bike_km")]), runs: Math.round(n(r[col("runs")])),
        updatedAt: stamp,
      });
    }
    return { days: [], months, kind: "activity" };
  }
  throw new Error("unknown history file");
}

/** Mean of all recorded weights per calendar month (any time of day), oldest first. */
export function monthlyWeights(days: DaysMap): { month: string; kg: number; n: number }[] {
  const acc = new Map<string, number[]>();
  for (const d of Object.values(days)) {
    if (d.weight == null) continue;
    const m = d.date.slice(0, 7);
    acc.set(m, [...(acc.get(m) ?? []), d.weight]);
  }
  return [...acc.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, kg: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10, n: v.length }));
}
