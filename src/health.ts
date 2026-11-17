import { Health } from "@capgo/capacitor-health";
import { db, getHealthState, getSettings, saveDays, saveItems, setHealthState, updateSettings } from "./db";
import { makeT, type MessageKey } from "./i18n";
import { addDays } from "./lib/date";
import { activeFromTotal, samsungTotal, dayRanges, type HcAggregate, type HcSample, type HcWorkout, isSamsung, type KcalRecord, latestSamsung, mapHealth, samsungDay, type StepDay, type StepRecord, workoutItem } from "./lib/healthMap";
import { applySamsung } from "./lib/samsung";
import type { DayEntry, DaysMap, Settings, SourceKey } from "./lib/types";
import { SOURCE_KEYS } from "./lib/types";
import { isNative } from "./native";

type HType = "steps" | "workouts" | "weight" | "bloodPressure" | "sleep" | "restingHeartRate" | "heartRate" | "calories" | "totalCalories" | "basalCalories" | "distance";
const TYPES: Record<SourceKey, HType[]> = {
  steps: ["steps", "distance"], exercise: ["workouts", "heartRate", "calories", "totalCalories", "basalCalories"], weight: ["weight"], bp: ["bloodPressure"], sleep: ["sleep", "restingHeartRate"],
};
const ALL: HType[] = SOURCE_KEYS.flatMap((k) => TYPES[k]);
/** Regular pulls look a week back; a full pull covers what Health Connect allows without history access. */
const RECENT_DAYS = 7;
const FULL_DAYS = 30;
export const HISTORY_DAYS = 365;
const wanted = (s: Settings) => SOURCE_KEYS.filter((k) => s.sources[k]).flatMap((k) => TYPES[k]);

export async function healthAvailable(): Promise<{ ok: boolean; reason?: string }> {
  if (!isNative) return { ok: false };
  try { const a = await Health.isAvailable(); return { ok: a.available, reason: a.reason }; } catch (e) { return { ok: false, reason: (e as Error).message }; }
}

/**
 * Opens the Health Connect permission sheet. Asks for every type, so the
 * per-metric switches can be changed later without asking again.
 */
export async function connectHealth(): Promise<"ok" | "denied" | "unavailable"> {
  if (!(await healthAvailable()).ok) return "unavailable";
  // History access lets us read past the 30 days Health Connect allows by default.
  const status = await Health.requestAuthorization({ read: ALL, write: [], requestHistoryAccess: true });
  if (!status.readAuthorized.length) return "denied";
  await setHealthState({ on: true, history: !!status.historyAccessAuthorized });
  await updateSettings({ healthLinked: true });
  await pullHealth(status.historyAccessAuthorized ? HISTORY_DAYS : FULL_DAYS);
  return "ok";
}

export async function disconnectHealth() {
  await setHealthState({ on: false });
  await updateSettings({ healthLinked: false });
}

export interface TypeReport { type: HType; granted: boolean; count: number; last?: string; sources: string[]; error?: string }

const range = (days: number) => ({ startDate: addDays(new Date(), -days).toISOString(), endDate: new Date().toISOString() });

/** Health Connect's merged total for one day; it follows the app priority set in Health Connect. */
async function aggregateDay(start: Date, end: Date, dataType: "steps" | "calories" | "distance" = "steps"): Promise<number> {
  const x = await Health.queryAggregated({ dataType, startDate: start.toISOString(), endDate: end.toISOString(), bucket: "day", aggregation: "sum" });
  return x.samples.reduce((a, b) => a + (b.value || 0), 0);
}

/**
 * Per-day totals for calories or distance (midnight to midnight), from Samsung's own records
 * like steps. Health Connect's merged total is only the fallback: for active calories it came
 * back empty on the owner's phone although Samsung had written 135 records.
 */
async function readDailyTotals(dataType: "calories" | "distance", days: number): Promise<HcAggregate[]> {
  const ranges = dayRanges(new Date(), days);
  const out: HcAggregate[] = [];
  for (let i = 0; i < ranges.length; i += 4) {
    const batch = ranges.slice(i, i + 4);
    const res = await Promise.all(batch.map(async (r) => {
      const recs = (await Health.readSamples({ dataType, startDate: r.start.toISOString(), endDate: r.end.toISOString(), limit: 5000 })).samples as StepRecord[];
      return samsungTotal(recs) ?? (await aggregateDay(r.start, r.end, dataType));
    }));
    res.forEach((v, j) => out.push({ startDate: batch[j].start.toISOString(), value: v }));
  }
  return out;
}

/**
 * Step totals and active minutes per calendar day, midnight to midnight, from Samsung
 * Health's own records (phone and watch merged minute by minute), so another app higher in
 * Health Connect's priority list can't replace the watch's count. Health Connect's merged
 * total is the fallback for days Samsung Health wrote nothing.
 */
async function readDailySteps(days: number): Promise<{ steps: HcAggregate[]; activeMin: HcAggregate[] }> {
  const ranges = dayRanges(new Date(), days);
  const steps: HcAggregate[] = [], activeMin: HcAggregate[] = [];
  for (let i = 0; i < ranges.length; i += 4) {
    const batch = ranges.slice(i, i + 4);
    const res = await Promise.all(batch.map(async (r) => {
      const recs = (await Health.readSamples({ dataType: "steps", startDate: r.start.toISOString(), endDate: r.end.toISOString(), limit: 5000 })).samples as StepRecord[];
      return samsungDay(recs) ?? { steps: await aggregateDay(r.start, r.end), activeMin: 0, byDevice: {} };
    }));
    res.forEach((v, j) => {
      steps.push({ startDate: batch[j].start.toISOString(), value: v.steps });
      activeMin.push({ startDate: batch[j].start.toISOString(), value: v.activeMin });
    });
  }
  return { steps, activeMin };
}

/** Samsung's latest BMR (kcal a day), when it has one. */
async function latestBmr(): Promise<number | null> {
  const s = (await Health.readSamples({ dataType: "basalCalories", ...range(365), limit: 200 })).samples as { value: number; startDate: string; sourceName?: string }[];
  const own = s.filter((x) => x.value > 0).sort((a, b) => a.startDate.localeCompare(b.startDate));
  return (own.filter((x) => isSamsung(x.sourceName)).at(-1) ?? own.at(-1))?.value ?? null;
}

/** Active calories for days where Samsung wrote none: its total calories minus the resting part. */
async function estimateActiveKcal(days: number, have: HcAggregate[] | undefined, bmr: number | null): Promise<HcAggregate[]> {
  const got = new Map((have ?? []).map((a) => [a.startDate.slice(0, 10), a.value]));
  const out: HcAggregate[] = [];
  for (const r of dayRanges(new Date(), days)) {
    if ((got.get(r.start.toISOString().slice(0, 10)) ?? 0) > 0) continue;
    const recs = (await Health.readSamples({ dataType: "totalCalories", startDate: r.start.toISOString(), endDate: r.end.toISOString(), limit: 5000 })).samples as KcalRecord[];
    const v = activeFromTotal(recs, bmr, r.start);
    if (v != null && v > 0) out.push({ startDate: r.start.toISOString(), value: v });
  }
  return out;
}

/**
 * A plain-text report of what Health Connect holds for today, to paste to Claude: who writes
 * steps and calories, how long their records are, a few raw records and what the app makes of
 * them. Only today's numbers; nothing leaves the phone unless the person pastes it.
 */
export async function healthReport(): Promise<string> {
  const r = dayRanges(new Date(), 1)[0];
  const at = (x: string) => new Date(x).toTimeString().slice(0, 5);
  const mins = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 60000);
  const lines: string[] = [`Fitnes · Health Connect report · ${new Date().toISOString().slice(0, 16)}`];
  const granted = new Set((await Health.checkAuthorization({ read: ALL, write: [] })).readAuthorized as string[]);
  lines.push(`Permissions: ${ALL.map((t) => `${t}${granted.has(t) ? "+" : "-"}`).join(" ")}`);
  const read = async (dataType: HType) => {
    try { return (await Health.readSamples({ dataType, startDate: r.start.toISOString(), endDate: r.end.toISOString(), limit: 5000 })).samples as (StepRecord & { deviceType?: string })[]; } catch (e) { lines.push(`${dataType}: error ${(e as Error).message}`); return []; }
  };
  const describe = (name: string, recs: (StepRecord & { deviceType?: string })[]) => {
    const groups = new Map<string, typeof recs>();
    recs.forEach((x) => { const k = `${x.sourceName ?? "?"} / ${x.deviceType ?? "?"}`; groups.set(k, [...(groups.get(k) ?? []), x]); });
    lines.push(`${name}: ${recs.length} records`);
    groups.forEach((g, k) => {
      const d = g.map((x) => mins(x.startDate, x.endDate));
      lines.push(`  ${k}: n=${g.length} sum=${Math.round(g.reduce((a, b) => a + b.value, 0))} dur=${Math.min(...d)}–${Math.max(...d)} min`);
    });
    [...recs].sort((a, b) => b.endDate.localeCompare(a.endDate)).slice(0, 8).forEach((x) =>
      lines.push(`    ${at(x.startDate)}–${at(x.endDate)} (${mins(x.startDate, x.endDate)} min) ${Math.round(x.value)} ${x.deviceType ?? "?"} ${x.sourceName ?? "?"}`));
  };
  const steps = granted.has("steps") ? await read("steps") : [];
  describe("Steps", steps);
  const day = samsungDay(steps);
  let merged = 0;
  try { merged = await aggregateDay(r.start, r.end); } catch { /* shown as 0 */ }
  lines.push(`  App: steps=${day?.steps ?? "—"} dayTotal=${day?.dayTotal ?? "—"} activeMin=${day?.activeMin ?? "—"} byDevice=${JSON.stringify(day?.byDevice ?? {})} · HC merged=${merged}`);
  if (granted.has("calories")) describe("Active calories", await read("calories"));
  const total = granted.has("totalCalories") ? await read("totalCalories") : [];
  if (granted.has("totalCalories")) describe("Total calories", total);
  let bmr: number | null = null;
  if (granted.has("basalCalories")) { try { bmr = await latestBmr(); } catch { /* none */ } }
  lines.push(`  BMR=${bmr ?? "—"} · active estimate=${activeFromTotal(total as KcalRecord[], bmr, r.start) ?? "—"}`);
  if (granted.has("distance")) describe("Distance (m)", await read("distance"));
  try {
    const w = (await Health.queryWorkouts({ startDate: r.start.toISOString(), endDate: r.end.toISOString(), limit: 50, ascending: true })).workouts as HcWorkout[];
    lines.push(`Workouts: ${w.map((x) => `${x.workoutType} ${at(x.startDate)} ${Math.round(x.duration / 60)} min`).join("; ") || "none"}`);
  } catch { /* none */ }
  return lines.join("\n");
}

/** Today in detail, for the diagnostics: steps per device, active minutes, calories every way. */
export async function todayHealth(): Promise<{ day: StepDay | null; merged: number; kcal: { active: number; total: number | null; bmr: number | null; estimate: number | null } }> {
  const r = dayRanges(new Date(), 1)[0];
  const recs = (await Health.readSamples({ dataType: "steps", startDate: r.start.toISOString(), endDate: r.end.toISOString(), limit: 5000 })).samples as StepRecord[];
  const safe = async <T,>(f: () => Promise<T>, d: T) => { try { return await f(); } catch { return d; } };
  const active = await safe(async () => samsungTotal((await Health.readSamples({ dataType: "calories", startDate: r.start.toISOString(), endDate: r.end.toISOString(), limit: 5000 })).samples as StepRecord[]) ?? 0, 0);
  const totalRecs = await safe(async () => (await Health.readSamples({ dataType: "totalCalories", startDate: r.start.toISOString(), endDate: r.end.toISOString(), limit: 5000 })).samples as KcalRecord[], [] as KcalRecord[]);
  const bmr = await safe(latestBmr, null);
  const own = totalRecs.filter((x) => isSamsung(x.sourceName));
  return {
    day: samsungDay(recs), merged: await aggregateDay(r.start, r.end),
    kcal: { active, total: own.length ? Math.round(own.reduce((a, b) => a + b.value, 0)) : null, bmr, estimate: activeFromTotal(totalRecs, bmr, r.start) },
  };
}

async function readType(type: HType, days: number): Promise<{ samples?: HcSample[]; steps?: HcAggregate[]; activeMin?: HcAggregate[]; workouts?: HcWorkout[]; raw: { startDate: string; sourceName?: string }[] }> {
  const r = range(days);
  if (type === "workouts") {
    const w = (await Health.queryWorkouts({ ...r, limit: 500, ascending: true })).workouts;
    return { workouts: w as HcWorkout[], raw: w };
  }
  if (type === "calories" || type === "distance") {
    const agg = await readDailyTotals(type, days);
    return { steps: agg, raw: agg.filter((a) => a.value > 0) };
  }
  if (type === "steps") {
    // Health Connect removes phone/watch duplicates itself when aggregating.
    const agg = await readDailySteps(days);
    return { steps: agg.steps, activeMin: agg.activeMin, raw: agg.steps.filter((a) => a.value > 0) };
  }
  const s = (await Health.readSamples({ dataType: type, ...r, limit: 2000, ascending: true })).samples;
  return { samples: s as HcSample[], raw: s };
}

/** What Health Connect actually returns for each type over the last 30 days. */
export async function diagnoseHealth(): Promise<TypeReport[]> {
  if (!isNative) return [];
  const granted = new Set((await Health.checkAuthorization({ read: ALL, write: [] })).readAuthorized as string[]);
  const out: TypeReport[] = [];
  for (const type of ALL) {
    const rep: TypeReport = { type, granted: granted.has(type), count: 0, sources: [] };
    if (rep.granted) {
      try {
        const { raw } = await readType(type, FULL_DAYS);
        rep.count = raw.length;
        rep.last = raw.map((x) => x.startDate).sort().pop();
        rep.sources = [...new Set(raw.map((x) => x.sourceName).filter((x): x is string => !!x))];
        if (type === "steps") {
          // Aggregates carry no source; read a few raw records to see who writes steps.
          const s = (await Health.readSamples({ dataType: "steps", ...range(FULL_DAYS), limit: 200 })).samples;
          rep.sources = [...new Set(s.map((x) => x.sourceName).filter((x): x is string => !!x))];
        }
      } catch (e) {
        rep.error = (e as Error).message || "error";
      }
    }
    out.push(rep);
  }
  return out;
}

let running: Promise<number> | null = null;

/**
 * Reads recent days and updates the log; once a day (and on demand) a full 30 days.
 * Returns how many days changed.
 */
export function pullHealth(days?: number): Promise<number> {
  running ??= run(days).finally(() => { running = null; });
  return running;
}

async function run(daysArg?: number): Promise<number> {
  const state = await getHealthState();
  if (!isNative || !state?.on) return 0;
  const settings = await getSettings();
  const errors: string[] = [];
  const fullDue = !state.lastFullAt || Date.now() - Date.parse(state.lastFullAt) > 20 * 3600 * 1000;
  const span = daysArg ?? (fullDue ? FULL_DAYS : RECENT_DAYS);
  try {
    const granted = new Set((await Health.checkAuthorization({ read: ALL, write: [] })).readAuthorized as string[]);
    const want = new Set(wanted(settings));
    const got: Parameters<typeof mapHealth>[0] = {};
    // Each type separately: one failing type must not block the others.
    for (const type of ALL) {
      // Pulse is read per workout; total and resting calories only feed the active-calorie estimate below.
      if (!want.has(type) || !granted.has(type) || type === "heartRate" || type === "totalCalories" || type === "basalCalories") continue;
      try {
        const r = await readType(type, span);
        if (type === "steps") { got.steps = r.steps; got.activeMin = r.activeMin; }
        else if (type === "workouts") got.workouts = r.workouts;
        else if (type === "calories") got.activeKcal = r.steps;
        else if (type === "distance") got.distance = r.steps;
        else if (type === "weight") got.weight = r.samples;
        else if (type === "bloodPressure") got.bp = r.samples;
        else if (type === "sleep") got.sleep = r.samples;
        else got.restingHr = r.samples;
      } catch (e) {
        errors.push(`${type}: ${(e as Error).message || "error"}`);
      }
    }
    // Samsung often writes total calories but no active ones: rebuild active from the total.
    if (want.has("calories") && granted.has("totalCalories")) {
      try {
        const bmr = granted.has("basalCalories") ? await latestBmr() : null;
        const est = await estimateActiveKcal(span, got.activeKcal, bmr);
        if (est.length) got.activeKcal = [...(got.activeKcal ?? []).filter((a) => a.value > 0), ...est];
      } catch (e) {
        errors.push(`totalCalories: ${(e as Error).message || "error"}`);
      }
    }
    const days: DaysMap = {};
    await db.days.each((d: DayEntry) => { if (!d.deleted) days[d.date] = d; });
    const t = makeT(settings.lang);
    const { changes } = applySamsung(days, mapHealth(got), settings.sources, (k) => t(`cardio.${k}` as MessageKey));
    await saveDays(changes);
    if (got.workouts?.length) await saveWorkouts(got.workouts, granted.has("heartRate"), errors);
    const nowIso = new Date().toISOString();
    let lastDataAt = state.lastDataAt;
    if (granted.has("steps")) {
      try {
        const r = dayRanges(new Date(), 1)[0];
        lastDataAt = latestSamsung((await Health.readSamples({ dataType: "steps", startDate: r.start.toISOString(), endDate: r.end.toISOString(), limit: 5000 })).samples as StepRecord[]) ?? lastDataAt;
      } catch { /* freshness is a hint only */ }
    }
    await setHealthState({
      on: true, history: state.history, lastPullAt: nowIso, lastCount: changes.length, lastDataAt,
      lastFullAt: span >= FULL_DAYS ? nowIso : state.lastFullAt,
      ...(errors.length ? { lastError: errors.join("; ") } : {}),
    });
    if (!settings.healthLinked) await updateSettings({ healthLinked: true });
    return changes.length;
  } catch (e) {
    await setHealthState({ ...state, lastError: (e as Error).message || "error" });
    return 0;
  }
}

/** Stores new or changed watch workouts, with average and peak pulse during each. */
async function saveWorkouts(list: HcWorkout[], withHr: boolean, errors: string[]) {
  const known = new Map((await db.items.where("kind").equals("workout").toArray()).map((i) => [i.id, i]));
  const fresh = [];
  for (const w of list) {
    const base = workoutItem(w, []);
    const old = known.get(base.id) as (typeof base) | undefined;
    if (old && old.durationMin === base.durationMin && (old.avgHr != null || !withHr)) continue;
    let hr: number[] = [];
    if (withHr) {
      try {
        const end = w.endDate ?? new Date(Date.parse(w.startDate) + w.duration * 1000).toISOString();
        hr = ((await Health.readSamples({ dataType: "heartRate", startDate: w.startDate, endDate: end, limit: 2000 })).samples as HcSample[]).map((x) => x.value);
      } catch (e) { errors.push(`heartRate: ${(e as Error).message}`); }
    }
    fresh.push(workoutItem(w, hr));
  }
  await saveItems(fresh);
}

/** Pulls on start, whenever the app comes back to the screen, and every 10 minutes while open. */
export function startAutoHealth() {
  if (!isNative) return;
  void pullHealth();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void pullHealth(); });
  setInterval(() => void pullHealth(), 10 * 60 * 1000);
}

export const openHealthSettings = () => Health.openHealthConnectSettings();
