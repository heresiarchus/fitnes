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
