import { Health } from "@capgo/capacitor-health";
import { db, getHealthState, getSettings, saveDays, setHealthState, updateSettings } from "./db";
import { makeT, type MessageKey } from "./i18n";
import { addDays } from "./lib/date";
import { type HcAggregate, type HcSample, type HcWorkout, mapHealth } from "./lib/healthMap";
import { applySamsung } from "./lib/samsung";
import type { DayEntry, DaysMap, Settings, SourceKey } from "./lib/types";
import { SOURCE_KEYS } from "./lib/types";
import { isNative } from "./native";

type HType = "steps" | "workouts" | "weight" | "bloodPressure" | "sleep" | "restingHeartRate";
const TYPES: Record<SourceKey, HType[]> = {
  steps: ["steps"], exercise: ["workouts"], weight: ["weight"], bp: ["bloodPressure"], sleep: ["sleep", "restingHeartRate"],
};
const ALL: HType[] = SOURCE_KEYS.flatMap((k) => TYPES[k]);
const DAYS_BACK = 30;
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
  const status = await Health.requestAuthorization({ read: ALL, write: [] });
  if (!status.readAuthorized.length) return "denied";
  await setHealthState({ on: true });
  await updateSettings({ healthLinked: true });
  await pullHealth();
  return "ok";
}

export async function disconnectHealth() {
  await setHealthState({ on: false });
  await updateSettings({ healthLinked: false });
}

export interface TypeReport { type: HType; granted: boolean; count: number; last?: string; sources: string[]; error?: string }

const range = () => ({ startDate: addDays(new Date(), -DAYS_BACK).toISOString(), endDate: new Date().toISOString() });

async function readType(type: HType): Promise<{ samples?: HcSample[]; steps?: HcAggregate[]; workouts?: HcWorkout[]; raw: { startDate: string; sourceName?: string }[] }> {
  const r = range();
  if (type === "workouts") {
    const w = (await Health.queryWorkouts({ ...r, limit: 500, ascending: true })).workouts;
    return { workouts: w as HcWorkout[], raw: w };
  }
  if (type === "steps") {
    // Per-day totals from Health Connect, which removes phone/watch duplicates itself.
    const agg = (await Health.queryAggregated({ dataType: "steps", ...r, bucket: "day", aggregation: "sum" })).samples;
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
        const { raw } = await readType(type);
        rep.count = raw.length;
        rep.last = raw.map((x) => x.startDate).sort().pop();
        rep.sources = [...new Set(raw.map((x) => x.sourceName).filter((x): x is string => !!x))];
        if (type === "steps") {
          // Aggregates carry no source; read a few raw records to see who writes steps.
          const s = (await Health.readSamples({ dataType: "steps", ...range(), limit: 200 })).samples;
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

/** Reads the last 30 days and updates days. Returns how many days changed. */
export function pullHealth(): Promise<number> {
  running ??= run().finally(() => { running = null; });
  return running;
}

async function run(): Promise<number> {
  const state = await getHealthState();
  if (!isNative || !state?.on) return 0;
  const settings = await getSettings();
  const errors: string[] = [];
  try {
    const granted = new Set((await Health.checkAuthorization({ read: ALL, write: [] })).readAuthorized as string[]);
    const want = new Set(wanted(settings));
    const got: Parameters<typeof mapHealth>[0] = {};
    // Each type separately: one failing type must not block the others.
    for (const type of ALL) {
      if (!want.has(type) || !granted.has(type)) continue;
      try {
        const r = await readType(type);
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
    await setHealthState({ on: true, lastPullAt: new Date().toISOString(), lastCount: changes.length, ...(errors.length ? { lastError: errors.join("; ") } : {}) });
    if (!settings.healthLinked) await updateSettings({ healthLinked: true });
    return changes.length;
  } catch (e) {
    await setHealthState({ on: true, lastPullAt: state.lastPullAt, lastError: (e as Error).message || "error" });
    return 0;
  }
}

/** Pulls on start, whenever the app comes back to the screen, and every 30 minutes while open. */
export function startAutoHealth() {
  if (!isNative) return;
  void pullHealth();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void pullHealth(); });
  setInterval(() => void pullHealth(), 30 * 60 * 1000);
}

export const openHealthSettings = () => Health.openHealthConnectSettings();
