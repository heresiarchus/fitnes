import { iso } from "./date";
import { emptySamsung, type SamsungData } from "./samsung";

/** Shapes returned by the health plugin (only the fields used here). */
export interface HcAggregate { startDate: string; value: number }
export interface HcWorkout { workoutType: string; duration: number; startDate: string }
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
    if (s.value > 0) out.weight.push({ date: iso(d), hour: d.getHours(), time: d.getTime(), weight: Math.round(s.value * 10) / 10 });
  }
  if (input.weight) out.kinds.push("weight");
  for (const s of input.bp ?? []) {
    const d = new Date(s.startDate);
    if (s.systolic && s.diastolic) out.bp.push({ date: iso(d), hour: d.getHours(), time: d.getTime(), sys: Math.round(s.systolic), dia: Math.round(s.diastolic), pulse: null });
  }
  if (input.bp) out.kinds.push("bp");
  for (const s of input.sleep ?? []) {
    if (s.sleepState === "awake" || s.sleepState === "inBed" || !(s.value > 0)) continue;
    const start = new Date(s.startDate), end = new Date(s.endDate);
    const date = iso(end); // a night belongs to the day you woke up
    const cur = out.sleep[date];
    out.sleep[date] = {
      minutes: (cur?.minutes ?? 0) + s.value,
      start: cur?.start && cur.start < hm(start) && iso(start) === date ? cur.start : cur?.start ?? hm(start),
      end: cur?.end && cur.end > hm(end) ? cur.end : hm(end),
    };
  }
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

export interface StepRecord { startDate: string; endDate: string; value: number; sourceName?: string }

export const isSamsung = (source: string | undefined) => !!source && /shealth|samsung/i.test(source);

/**
 * Samsung Health's own step total for one day. Overlapping records (the same
 * minutes counted by phone and watch) are merged keeping the larger count, so
 * nothing is counted twice. Returns null when Samsung Health wrote nothing that day.
 */
export function samsungSteps(records: StepRecord[]): number | null {
  const own = records.filter((r) => isSamsung(r.sourceName) && r.value > 0)
    .map((r) => ({ s: Date.parse(r.startDate), e: Date.parse(r.endDate), v: r.value }))
    .sort((a, b) => a.s - b.s || b.e - a.e);
  if (!own.length) return null;
  let total = 0;
  let cur = own[0];
  for (const r of own.slice(1)) {
    if (r.s < cur.e) {
      // Overlap: keep the cluster's larger count and extend it.
      cur = { s: cur.s, e: Math.max(cur.e, r.e), v: Math.max(cur.v, r.v) };
    } else {
      total += cur.v;
      cur = r;
    }
  }
  return Math.round(total + cur.v);
}
