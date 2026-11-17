/**
 * Statistics behind the metric screens and the "Детальніше" pages. Pure functions over the
 * day map, so they are testable and the screens stay thin. Conventions:
 * - a missing day is null ("no data"), never zero;
 * - trends are least-squares slopes over the present days;
 * - links between metrics need enough paired days and are reported only when the rank
 *   correlation is clearly away from zero (|t| ≥ 2); a link is never presented as a cause.
 */
import { addDays, iso, mondayOf, parseIso } from "./date";
import { bpSummary, morningWeight } from "./stats";
import type { DayEntry, DaysMap, WorkoutItem } from "./types";

export type MetricId = "steps" | "active" | "kcal" | "distance" | "weight" | "sleep" | "pulse" | "bpSys" | "bpDia" | "feel" | "energyAm" | "energyPm";
export const METRICS: MetricId[] = ["steps", "active", "kcal", "distance", "weight", "sleep", "pulse", "bpSys", "bpDia", "feel", "energyAm", "energyPm"];

const bp = (d: DayEntry | undefined) => { const s = bpSummary(d); return s.morning ?? s.evening; };

/** One number per day for each metric; null when the day has no such data. */
export const VALUE: Record<MetricId, (d: DayEntry | undefined) => number | null> = {
  steps: (d) => d?.steps ?? null,
  active: (d) => (d?.walkMin != null || d?.cardioMin != null ? (d.walkMin ?? 0) + (d.cardioMin ?? 0) : null),
  kcal: (d) => d?.activeKcal ?? null,
  distance: (d) => d?.distanceKm ?? null,
  weight: (d) => morningWeight(d),
  sleep: (d) => (d?.sleepMin != null ? d.sleepMin / 60 : null),
  pulse: (d) => d?.restingHr ?? null,
  bpSys: (d) => bp(d)?.sys ?? null,
  bpDia: (d) => bp(d)?.dia ?? null,
  feel: (d) => d?.feel ?? null,
  energyAm: (d) => d?.energyAm ?? null,
  energyPm: (d) => d?.energyPm ?? null,
};

export type Vals = (number | null)[];
export const series = (days: DaysMap, m: MetricId, dates: string[]): Vals => dates.map((d) => VALUE[m](days[d]));
export const present = (v: Vals): number[] => v.filter((x): x is number => x != null && Number.isFinite(x));

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null);
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function sd(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1));
}

/** Dates from `start` to `end` inclusive. */
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = parseIso(start); iso(d) <= end; d = addDays(d, 1)) out.push(iso(d));
  return out;
}

/** Least-squares slope per day over the present values, with its standard error. */
export function slope(v: Vals): { perDay: number; se: number; n: number } | null {
  const pts = v.map((y, x) => [x, y] as const).filter((p): p is readonly [number, number] => p[1] != null);
  const n = pts.length;
  if (n < 4) return null;
  const mx = mean(pts.map((p) => p[0]))!, my = mean(pts.map((p) => p[1]))!;
  const sxx = sum(pts.map(([x]) => (x - mx) ** 2));
  if (!sxx) return null;
  const b = sum(pts.map(([x, y]) => (x - mx) * (y - my))) / sxx;
  const res = sum(pts.map(([x, y]) => (y - (my + b * (x - mx))) ** 2));
  return { perDay: b, se: Math.sqrt(res / Math.max(1, n - 2) / sxx), n };
}

/** Rolling mean over `window` days (needs at least 3 present values in the window). */
export function rolling(v: Vals, window = 7): Vals {
  return v.map((_, i) => {
    const w = present(v.slice(Math.max(0, i - window + 1), i + 1));
    return w.length >= Math.min(3, window) ? mean(w) : null;
  });
}

/**
 * Trend weight: an exponential moving average that carries over missing days, so water and salt
 * swings don't move it much (the idea of the Hacker's Diet trend line).
 */
export function trendLine(v: Vals, alpha = 0.1): Vals {
  let t: number | null = null;
  return v.map((x) => {
    if (x != null) t = t == null ? x : t + alpha * (x - t);
    return t;
  });
}

export interface Streak { length: number; start: string | null; end: string | null }
/**
 * Days in a row where `ok(value)` holds. A missing day breaks a streak, except today
 * (the day isn't over): then the current streak counts up to yesterday.
 */
export function streaks(dates: string[], v: Vals, ok: (x: number) => boolean, today = iso(new Date())): { current: number; longest: Streak } {
  let longest: Streak = { length: 0, start: null, end: null };
  let run = 0, runStart: string | null = null;
  dates.forEach((d, i) => {
    const x = v[i];
    if (x != null && ok(x)) {
      if (!run) runStart = d;
      run++;
      if (run > longest.length) longest = { length: run, start: runStart, end: d };
    } else run = 0;
  });
  let current = 0;
  for (let i = dates.length - 1; i >= 0; i--) {
    const x = v[i];
    if (x != null && ok(x)) current++;
    else if (dates[i] === today && current === 0) continue;
    else break;
  }
  return { current, longest };
}

export function record(dates: string[], v: Vals, kind: "max" | "min" = "max"): { v: number; date: string } | null {
  let best: { v: number; date: string } | null = null;
  v.forEach((x, i) => {
    if (x == null) return;
    if (!best || (kind === "max" ? x > best.v : x < best.v)) best = { v: x, date: dates[i] };
  });
  return best;
}

/** Mean per weekday, Monday first. */
export function byWeekday(dates: string[], v: Vals): (number | null)[] {
  const b: number[][] = [[], [], [], [], [], [], []];
  dates.forEach((d, i) => { const x = v[i]; if (x != null) b[(parseIso(d).getDay() + 6) % 7].push(x); });
  return b.map(mean);
}

export type Grouping = "day" | "week" | "month";
export interface Bucket { key: string; start: string; end: string; v: number | null; n: number }
/** Buckets of days; `agg` sums (steps, minutes) or averages (weight, sleep). */
export function group(dates: string[], v: Vals, g: Grouping, agg: "mean" | "sum"): Bucket[] {
  const map = new Map<string, { start: string; end: string; xs: number[] }>();
  dates.forEach((d, i) => {
    const key = g === "day" ? d : g === "week" ? iso(mondayOf(parseIso(d))) : d.slice(0, 7);
    const b = map.get(key) ?? { start: d, end: d, xs: [] };
    b.end = d;
    if (v[i] != null) b.xs.push(v[i]!);
    map.set(key, b);
  });
  return [...map.entries()].map(([key, b]) => ({
    key, start: b.start, end: b.end, n: b.xs.length,
    // Weeks and months show the average per day, so a day without data doesn't read as a drop.
    v: !b.xs.length ? null : agg === "sum" && g === "day" ? sum(b.xs) : mean(b.xs),
  }));
}

/** Percent change; null when either side is missing or the base is zero. */
export const change = (cur: number | null, prev: number | null) => (cur == null || prev == null || prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100);

/** Spearman rank correlation over days where both are present. */
export function spearman(a: Vals, b: Vals, minN = 21): { rho: number; n: number; sure: boolean } | null {
  const pairs = a.map((x, i) => [x, b[i]] as const).filter((p): p is readonly [number, number] => p[0] != null && p[1] != null);
  if (pairs.length < minN) return null;
  const rank = (xs: number[]) => {
    const idx = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(xs.length);
    for (let i = 0; i < idx.length;) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(pairs.map((p) => p[0])), rb = rank(pairs.map((p) => p[1]));
  const ma = mean(ra)!, mb = mean(rb)!;
  const cov = sum(ra.map((x, i) => (x - ma) * (rb[i] - mb)));
  const den = Math.sqrt(sum(ra.map((x) => (x - ma) ** 2)) * sum(rb.map((y) => (y - mb) ** 2)));
  if (!den) return null;
  const rho = cov / den, n = pairs.length;
  const t = Math.abs(rho) < 1 ? rho * Math.sqrt((n - 2) / (1 - rho * rho)) : Infinity;
  return { rho, n, sure: Math.abs(t) >= 2 };
}
export const linkStrength = (rho: number) => (Math.abs(rho) < 0.15 ? "none" : Math.abs(rho) < 0.3 ? "weak" : Math.abs(rho) < 0.5 ? "moderate" : "strong");

/** Difference of means (a − b) with an approximate 95% interval; `sure` when it excludes zero. */
export function diffMeans(a: number[], b: number[], minN = 5): { diff: number; lo: number; hi: number; sure: boolean; na: number; nb: number } | null {
  if (a.length < minN || b.length < minN) return null;
  const va = sd(a)! ** 2, vb = sd(b)! ** 2;
  const diff = mean(a)! - mean(b)!, half = 1.96 * Math.sqrt(va / a.length + vb / b.length);
  return { diff, lo: diff - half, hi: diff + half, sure: diff - half > 0 || diff + half < 0, na: a.length, nb: b.length };
}

/** Pairs "value on day d" with "value on day d + lag" of another metric. */
export function lagged(days: DaysMap, dates: string[], a: MetricId, b: MetricId, lag: number): [Vals, Vals] {
  return [series(days, a, dates), dates.map((d) => VALUE[b](days[iso(addDays(parseIso(d), lag))]))];
}

// —— Steps ——
export const STEP_ZONES = [5000, 7500, 10000];
/** Share of days in < 5 000, 5 000–7 499, 7 500–9 999 and ≥ 10 000 steps (Tudor-Locke). */
export function stepZones(v: Vals): number[] {
  const xs = present(v);
  const c = [0, 0, 0, 0];
  xs.forEach((x) => c[x < 5000 ? 0 : x < 7500 ? 1 : x < 10000 ? 2 : 3]++);
  return c.map((n) => (xs.length ? n / xs.length : 0));
}
/** A drop: the last 7 days' mean is at least 20% below the 28 days before them. */
export function dropSignal(v: Vals): { pct: number } | null {
  const last = mean(present(v.slice(-7))), base = mean(present(v.slice(-35, -7)));
  const pct = change(last, base);
  return pct != null && pct <= -20 && present(v.slice(-7)).length >= 4 ? { pct } : null;
}

// —— Weight ——
export interface WeightView { trend: Vals; kgWeek14: number | null; kgWeek28: number | null; pctWeek: number | null; plateau: boolean }
export function weightView(v: Vals): WeightView {
  const trend = trendLine(v);
  const s14 = slope(trend.slice(-14)), s28 = slope(trend.slice(-28));
  const last = present(trend).at(-1) ?? null;
  const t14 = present(trend.slice(-14));
  const plateau = t14.length >= 14 && Math.max(...t14) - Math.min(...t14) <= 0.2;
  return {
    trend,
    kgWeek14: s14 ? s14.perDay * 7 : null,
    kgWeek28: s28 ? s28.perDay * 7 : null,
    pctWeek: s28 && last ? (s28.perDay * 7 * 100) / last : null,
    plateau,
  };
}
/** Weight above the trend by weekday (kg): shows a weekend bump if there is one. */
export function weekRhythm(dates: string[], v: Vals): (number | null)[] {
  const t = trendLine(v);
  return byWeekday(dates, v.map((x, i) => (x != null && t[i] != null ? x - t[i]! : null)));
}
/** When the trend reaches `target` at the 28-day pace, with an earliest–latest range from the pace's uncertainty. */
export function forecast(v: Vals, target: number, today = new Date()): { date: string; early: string; late: string } | null {
  const t = trendLine(v), s = slope(t.slice(-28)), cur = present(t).at(-1);
  if (!s || cur == null) return null;
  const left = target - cur;
  const days = (rate: number) => (rate !== 0 && Math.sign(rate) === Math.sign(left) ? Math.ceil(left / rate) : null);
  const mid = days(s.perDay), fast = days(s.perDay + Math.sign(left) * s.se), slow = days(s.perDay - Math.sign(left) * s.se);
  if (mid == null || mid > 3650) return null;
  const at = (n: number | null) => iso(addDays(today, n ?? 3650));
  return { date: at(mid), early: at(fast ?? mid), late: at(slow != null && slow > 0 ? slow : null) };
}
export function bmi(kg: number, cm: number) { const m = cm / 100; return kg / (m * m); }
export const bmiClass = (b: number) => (b < 18.5 ? "under" : b < 25 ? "normal" : b < 30 ? "pre" : b < 35 ? "ob1" : b < 40 ? "ob2" : "ob3");
/** Energy gap from the weight pace (≈7 700 kcal per kg; early on part of the loss is water, so it's an estimate). */
export const kcalPerDay = (kgPerWeek: number) => (-kgPerWeek * 7700) / 7;
/** Net energy of walking ≈ 0.5 kcal per kg body weight per km (ACSM walking equation). */
export function walkKcal(extraSteps: number, kg: number, heightCm?: number) {
  const stride = heightCm ? (heightCm * 0.415) / 100 : 0.75;
  return 0.5 * kg * ((extraSteps * stride) / 1000);
}

// —— Sleep ——
const clock = (hhmm: string | undefined, from = 18) => {
  if (!hhmm) return null;
  const m = /T?(\d{2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  const min = +m[1] * 60 + +m[2];
  return (min - from * 60 + 1440) % 1440; // minutes after 18:00 (bedtime) or after `from`
};
export interface SleepView { bedSd: number | null; wakeSd: number | null; jetlagMin: number | null; debt7: number | null; bedTrendMinPerWeek: number | null }
export function sleepView(days: DaysMap, dates: string[]): SleepView {
  const bed = dates.map((d) => clock(days[d]?.sleepStart));
  const wake = dates.map((d) => clock(days[d]?.sleepEnd, 0));
  const mid = dates.map((d, i) => (bed[i] != null && days[d]?.sleepMin != null ? bed[i]! + days[d]!.sleepMin! / 2 : null));
  const wkend = (d: string) => [0, 6].includes(parseIso(d).getDay());
  const mw = mean(present(mid.filter((_, i) => wkend(dates[i])))), md = mean(present(mid.filter((_, i) => !wkend(dates[i]))));
  const last7 = present(series(days, "sleep", dates.slice(-7)));
  const bs = slope(bed);
  return {
    bedSd: sd(present(bed)), wakeSd: sd(present(wake)),
    jetlagMin: mw != null && md != null ? mw - md : null,
    debt7: last7.length >= 4 ? sum(last7.map((h) => Math.max(0, 7 - h))) : null,
    bedTrendMinPerWeek: bs && bs.n >= 14 ? bs.perDay * 7 : null,
  };
}

// —— Pressure ——
/** Home-protocol week: the last 7 days without the first, morning and evening averaged. */
export function bpWeek(days: DaysMap, end: string) {
  const dates = datesBetween(iso(addDays(parseIso(end), -5)), end);
  const ms = dates.map((d) => bpSummary(days[d]).morning).filter((x) => x != null);
  const es = dates.map((d) => bpSummary(days[d]).evening).filter((x) => x != null);
  const avg = (xs: { sys: number; dia: number }[]) => (xs.length ? { sys: Math.round(mean(xs.map((x) => x.sys))!), dia: Math.round(mean(xs.map((x) => x.dia))!), n: xs.length } : null);
  return { morning: avg(ms), evening: avg(es), all: avg([...ms, ...es]) };
}
/** ESC 2024 categories (office cut-offs; at home ≥135/85 already counts as high). */
export const bpClass = (sys: number, dia: number) => (sys >= 140 || dia >= 90 ? "high" : sys >= 120 || dia >= 70 ? "elevated" : "ok");

// —— Workouts ——
/** Metres per minute per heartbeat on walks: higher at the same effort means better fitness. */
export function walkEfficiency(ws: WorkoutItem[]): { date: string; v: number }[] {
  return ws.filter((w) => /walk|ходь/i.test(w.type) && w.distanceKm && w.durationMin >= 10 && w.avgHr)
    .map((w) => ({ date: w.date, v: (w.distanceKm! * 1000) / w.durationMin / w.avgHr! }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
