import { iso } from "./date";
import { emptySamsung, type SamsungData } from "./samsung";

/** Shapes returned by the health plugin (only the fields used here). */
export interface HcAggregate { startDate: string; value: number }
export interface HcWorkout { workoutType: string; duration: number; startDate: string; endDate?: string; totalDistance?: number; totalEnergyBurned?: number; sourceName?: string; platformId?: string }
export interface HcSample { value: number; startDate: string; endDate: string; systolic?: number; diastolic?: number; sleepState?: string }

const WALK = new Set(["walking", "hiking", "runningTreadmill", "wheelchairWalkPace", "stairClimbing", "stairs"]);
const CARDIO: Record<string, string> = {
  running: "run", cycling: "cycle", handCycling: "cycle", bikingStationary: "bike",
  swimming: "pool", swimmingPool: "pool", swimmingOpenWater: "pool",
  elliptical: "elliptical", rowing: "rower", rowingMachine: "rower",
};
const hm = (d: Date) => d.toTimeString().slice(0, 5);

/**
 * Converts Health Connect readings into the same structure the Samsung export
 * import uses, so both paths update days through one function.
 * Timestamps are ISO instants; days and hours are taken in the phone's time zone.
 */
export function mapHealth(input: {
  steps?: HcAggregate[]; workouts?: HcWorkout[]; weight?: HcSample[]; bp?: HcSample[]; sleep?: HcSample[]; restingHr?: HcSample[];
  activeKcal?: HcAggregate[]; distance?: HcAggregate[]; activeMin?: HcAggregate[];
}): SamsungData {
  const out = emptySamsung();
  out.sleep = {};
  out.restingHr = {};
  for (const s of input.steps ?? []) {
    const n = Math.round(s.value);
    if (n > 0) out.steps[iso(new Date(s.startDate))] = n;
  }
  if (input.steps) out.kinds.push("steps");
  for (const w of input.workouts ?? []) {
    const minutes = w.duration / 60;
    if (!(minutes > 0)) continue;
    // Strength sessions are logged by hand with sets and reps; don't count them as cardio.
    if (/strength|weightlifting|calisthenics|plank|crunch|lunge|deadlift|press|curl|raise/i.test(w.workoutType)) continue;
    out.exercise.push({ date: iso(new Date(w.startDate)), minutes, walk: WALK.has(w.workoutType), cardio: CARDIO[w.workoutType] });
  }
  if (input.workouts) out.kinds.push("exercise");
  for (const s of input.weight ?? []) {
    const d = new Date(s.startDate);
    if (s.value > 0) out.weight.push({ date: iso(d), hour: d.getHours(), time: d.getTime(), weight: Math.round(s.value * 100) / 100 });
  }
  if (input.weight) out.kinds.push("weight");
  for (const s of input.bp ?? []) {
    const d = new Date(s.startDate);
    if (s.systolic && s.diastolic) out.bp.push({ date: iso(d), hour: d.getHours(), time: d.getTime(), sys: Math.round(s.systolic), dia: Math.round(s.diastolic), pulse: null });
  }
  if (input.bp) out.kinds.push("bp");
  Object.assign(out.sleep, sleepByDay(input.sleep ?? []));
  out.activeKcal = {};
  out.distanceKm = {};
  out.activeMin = {};
  for (const s of input.activeMin ?? []) if (s.value > 0) out.activeMin[iso(new Date(s.startDate))] = Math.round(s.value);
  for (const s of input.activeKcal ?? []) if (s.value > 0) out.activeKcal[iso(new Date(s.startDate))] = Math.round(s.value);
  for (const s of input.distance ?? []) if (s.value > 0) out.distanceKm[iso(new Date(s.startDate))] = Math.round(s.value / 10) / 100;
  for (const s of input.restingHr ?? []) {
    if (s.value > 0) out.restingHr[iso(new Date(s.startDate))] = Math.round(s.value);
  }
  return out;
}

/**
 * Calendar days in the phone's time zone, newest last: [local midnight, next local midnight),
 * the last one ending now. Built from calendar dates, so 23- and 25-hour days around
 * daylight-saving changes stay exact.
 */
export function dayRanges(now: Date, days: number): { date: string; start: Date; end: Date }[] {
  const out: { date: string; start: Date; end: Date }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
    out.push({ date: iso(start), start, end: next.getTime() > now.getTime() ? now : next });
  }
  return out;
}

export interface StepRecord { startDate: string; endDate: string; value: number; sourceName?: string; deviceType?: string }

export const isSamsung = (source: string | undefined) => !!source && /shealth|samsung/i.test(source);

/** Steps per minute from which a minute counts as active (a slow walk is ~60–90, brisk ≥ 100). */
export const ACTIVE_SPM = 60;

export interface StepDay {
  steps: number;
  /** Minutes with at least ACTIVE_SPM steps (Health Connect has no "active time"; this rebuilds it from steps). */
  activeMin: number;
  /** Steps per recording device, for the diagnostics. */
  byDevice: Record<string, number>;
}

/**
 * Samsung Health's step total for one day, the way Samsung itself counts it: phone and
 * watch each count on their own, and for every minute the device that counted more wins.
 * Each record's steps are spread evenly over its minutes, so records that are shifted by a
 * few seconds between devices (which made slices count twice before) land in the same minute.
 * Exact duplicate records are dropped. Returns null when Samsung Health wrote nothing that day.
 */
export function samsungDay(records: StepRecord[]): StepDay | null {
  const own = records.filter((r) => isSamsung(r.sourceName) && r.value > 0);
  if (!own.length) return null;
  const seen = new Set<string>();
  const perDevice = new Map<string, Map<number, number>>();
  const byDevice: Record<string, number> = {};
  for (const r of own) {
    const dev = r.deviceType ?? "unknown";
    const key = `${dev}|${r.startDate}|${r.endDate}|${r.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    byDevice[dev] = (byDevice[dev] ?? 0) + r.value;
    const s = Date.parse(r.startDate), e0 = Date.parse(r.endDate), e = e0 > s ? e0 : s + 60_000;
    const minutes = perDevice.get(dev) ?? new Map<number, number>();
    for (let m = Math.floor(s / 60_000); m * 60_000 < e; m++) {
      const overlap = Math.min(e, (m + 1) * 60_000) - Math.max(s, m * 60_000);
      if (overlap > 0) minutes.set(m, (minutes.get(m) ?? 0) + (r.value * overlap) / (e - s));
    }
    perDevice.set(dev, minutes);
  }
  const best = new Map<number, number>();
  perDevice.forEach((minutes) => minutes.forEach((v, m) => best.set(m, Math.max(best.get(m) ?? 0, v))));
  let steps = 0, activeMin = 0;
  best.forEach((v) => { steps += v; if (v >= ACTIVE_SPM) activeMin++; });
  Object.keys(byDevice).forEach((k) => (byDevice[k] = Math.round(byDevice[k])));
  return { steps: Math.round(steps), activeMin, byDevice };
}

export interface KcalRecord { startDate: string; endDate: string; value: number; sourceName?: string }

/**
 * Active calories rebuilt from Samsung's total calories, for when Samsung writes no active
 * ones: the total minus the resting part. The resting rate is Samsung's BMR when it has
 * one, else the day's own night rate (01:00–05:00, from short records only), which is
 * mostly resting. Null when neither is available.
 */
export function activeFromTotal(records: KcalRecord[], bmrPerDay: number | null, dayStart: Date): number | null {
  const seen = new Set<string>();
  const own = records.filter((r) => {
    const k = `${r.startDate}|${r.endDate}|${r.value}`;
    if (!isSamsung(r.sourceName) || r.value <= 0 || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map((r) => ({ s: Date.parse(r.startDate), e: Math.max(Date.parse(r.endDate), Date.parse(r.startDate) + 60_000), v: r.value }));
  if (!own.length) return null;
  const t0 = dayStart.getTime(), dayEnd = t0 + 1440 * 60_000;
  const total = own.reduce((a, r) => a + r.v, 0);
  const lastEnd = Math.min(dayEnd, Math.max(...own.map((r) => r.e)));
  let perMin = bmrPerDay && bmrPerDay > 0 ? bmrPerDay / 1440 : null;
  if (perMin == null) {
    const ws = t0 + 60 * 60_000, we = t0 + 300 * 60_000;
    let kcal = 0, covered = 0;
    for (const r of own) {
      if (r.e - r.s > 60 * 60_000) continue; // a long record says nothing about the night alone
      const o = Math.min(we, r.e) - Math.max(ws, r.s);
      if (o > 0) { kcal += (r.v * o) / (r.e - r.s); covered += o / 60_000; }
    }
    if (covered >= 120) perMin = kcal / covered;
  }
  if (perMin == null) return null;
  return Math.max(0, Math.round(total - perMin * ((lastEnd - t0) / 60_000)));
}

/** The day's step total (see samsungDay). */
export const samsungSteps = (records: StepRecord[]): number | null => samsungDay(records)?.steps ?? null;

/** End of the latest Samsung step record: how fresh Samsung Health's data in Health Connect is. */
export function latestSamsung(records: StepRecord[]): string | null {
  const ends = records.filter((r) => isSamsung(r.sourceName) && r.value > 0).map((r) => r.endDate).sort();
  return ends.at(-1) ?? null;
}

export interface SleepDay { minutes: number; start: string; end: string; /** Daytime sleep on the same day, minutes. */ napMin: number }

/**
 * Night sleep per wake-up date, kept apart from daytime naps.
 * Sleep records closer than 45 minutes form one session. A day's main sleep is its
 * longest session that ends before 15:00 (or simply the longest one); other sessions
 * ending that day count as naps. Awake and in-bed stages are not sleep.
 */
export function sleepByDay(samples: HcSample[]): Record<string, SleepDay> {
  const parts = samples
    .filter((s) => s.sleepState !== "awake" && s.sleepState !== "inBed" && s.value > 0)
    .map((s) => ({ s: Date.parse(s.startDate), e: Date.parse(s.endDate), m: s.value }))
    .sort((a, b) => a.s - b.s);
  const sessions: { s: number; e: number; m: number }[] = [];
  for (const p of parts) {
    const last = sessions[sessions.length - 1];
    if (last && p.s - last.e <= 45 * 60000) { last.e = Math.max(last.e, p.e); last.m += p.m; }
    else sessions.push({ ...p });
  }
  const byDay = new Map<string, typeof sessions>();
  for (const x of sessions) {
    const d = iso(new Date(x.e));
    byDay.set(d, [...(byDay.get(d) ?? []), x]);
  }
  const out: Record<string, SleepDay> = {};
  for (const [date, list] of byDay) {
    const night = list.filter((x) => new Date(x.e).getHours() < 15);
    const main = (night.length ? night : list).reduce((a, b) => (b.m > a.m ? b : a));
    out[date] = {
      minutes: Math.round(main.m), start: hm(new Date(main.s)), end: hm(new Date(main.e)),
      napMin: Math.round(list.filter((x) => x !== main).reduce((a, b) => a + b.m, 0)),
    };
  }
  return out;
}

/** A workout as stored by the app; pulse is filled in from heart-rate samples during it. */
export function workoutItem(w: HcWorkout, hr: number[], now = new Date()) {
  const start = new Date(w.startDate);
  const end = w.endDate ? new Date(w.endDate) : new Date(start.getTime() + w.duration * 1000);
  const item = {
    id: "wo-" + (w.platformId ?? `${w.startDate}-${w.workoutType}`),
    kind: "workout" as const,
    date: iso(start), type: w.workoutType, start: hm(start), end: hm(end),
    durationMin: Math.round(w.duration / 60),
    updatedAt: now.toISOString(),
  } as { id: string; kind: "workout"; date: string; type: string; start: string; end: string; durationMin: number; updatedAt: string; distanceKm?: number; avgHr?: number; maxHr?: number; kcal?: number; source?: string };
  if (w.totalDistance) item.distanceKm = Math.round(w.totalDistance / 10) / 100;
  if (w.totalEnergyBurned) item.kcal = Math.round(w.totalEnergyBurned);
  if (w.sourceName) item.source = w.sourceName;
  const beats = hr.filter((v) => v > 30 && v < 230);
  if (beats.length) {
    item.avgHr = Math.round(beats.reduce((a, b) => a + b, 0) / beats.length);
    item.maxHr = Math.round(Math.max(...beats));
  }
  return item;
}
