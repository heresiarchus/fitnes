import { Health } from "@capgo/capacitor-health";
import { db, getHealthState, getSettings, saveDays, saveItems, setHealthState, updateSettings } from "./db";
import { makeT, type MessageKey } from "./i18n";
import { addDays } from "./lib/date";
import { dayRanges, type HcAggregate, type HcSample, type HcWorkout, mapHealth, samsungSteps, type StepRecord, workoutItem } from "./lib/healthMap";
import { applySamsung } from "./lib/samsung";
import type { DayEntry, DaysMap, Settings, SourceKey } from "./lib/types";
import { SOURCE_KEYS } from "./lib/types";
import { isNative } from "./native";

type HType = "steps" | "workouts" | "weight" | "bloodPressure" | "sleep" | "restingHeartRate" | "heartRate";
const TYPES: Record<SourceKey, HType[]> = {
  steps: ["steps"], exercise: ["workouts", "heartRate"], weight: ["weight"], bp: ["bloodPressure"], sleep: ["sleep", "restingHeartRate"],
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
async function aggregateDay(start: Date, end: Date): Promise<number> {
  const x = await Health.queryAggregated({ dataType: "steps", startDate: start.toISOString(), endDate: end.toISOString(), bucket: "day", aggregation: "sum" });
  return x.samples.reduce((a, b) => a + (b.value || 0), 0);
}

/**
 * Step totals per calendar day, midnight to midnight. Samsung Health's own records
 * are used when present, so another app higher in Health Connect's priority list
 * (e.g. the phone's own counter) can't replace the watch's count. The merged total
 * is the fallback for days Samsung Health wrote nothing.
 */
async function readDailySteps(days: number): Promise<HcAggregate[]> {
  const ranges = dayRanges(new Date(), days);
  const out: HcAggregate[] = [];
  for (let i = 0; i < ranges.length; i += 4) {
    const batch = ranges.slice(i, i + 4);
    const res = await Promise.all(batch.map(async (r) => {
      const recs = (await Health.readSamples({ dataType: "steps", startDate: r.start.toISOString(), endDate: r.end.toISOString(), limit: 5000 })).samples as StepRecord[];
      return samsungSteps(recs) ?? (await aggregateDay(r.start, r.end));
    }));
    res.forEach((v, j) => out.push({ startDate: batch[j].start.toISOString(), value: v }));
  }
  return out;
}

/** Today's steps both ways, to compare with the watch. */
export async function todaySteps(): Promise<{ samsung: number | null; merged: number }> {
  const r = dayRanges(new Date(), 1)[0];
  const recs = (await Health.readSamples({ dataType: "steps", startDate: r.start.toISOString(), endDate: r.end.toISOString(), limit: 5000 })).samples as StepRecord[];
  return { samsung: samsungSteps(recs), merged: await aggregateDay(r.start, r.end) };
}

async function readType(type: HType, days: number): Promise<{ samples?: HcSample[]; steps?: HcAggregate[]; workouts?: HcWorkout[]; raw: { startDate: string; sourceName?: string }[] }> {
  const r = range(days);
  if (type === "workouts") {
    const w = (await Health.queryWorkouts({ ...r, limit: 500, ascending: true })).workouts;
    return { workouts: w as HcWorkout[], raw: w };
  }
  if (type === "steps") {
    // Health Connect removes phone/watch duplicates itself when aggregating.
    const agg = await readDailySteps(days);
    return { steps: agg, raw: agg.filter((a) => a.value > 0) };
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
      if (!want.has(type) || !granted.has(type) || type === "heartRate") continue; // pulse is read per workout
      try {
        const r = await readType(type, span);
        if (type === "steps") got.steps = r.steps;
        else if (type === "workouts") got.workouts = r.workouts;
        else if (type === "weight") got.weight = r.samples;
        else if (type === "bloodPressure") got.bp = r.samples;
        else if (type === "sleep") got.sleep = r.samples;
        else got.restingHr = r.samples;
      } catch (e) {
        errors.push(`${type}: ${(e as Error).message || "error"}`);
      }
    }
    const days: DaysMap = {};
    await db.days.each((d: DayEntry) => { if (!d.deleted) days[d.date] = d; });
    const t = makeT(settings.lang);
    const { changes } = applySamsung(days, mapHealth(got), settings.sources, (k) => t(`cardio.${k}` as MessageKey));
    await saveDays(changes);
    if (got.workouts?.length) await saveWorkouts(got.workouts, granted.has("heartRate"), errors);
    const nowIso = new Date().toISOString();
    await setHealthState({
      on: true, history: state.history, lastPullAt: nowIso, lastCount: changes.length,
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
