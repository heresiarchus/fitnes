import { Health } from "@capgo/capacitor-health";
import { getHealthState, getSettings, saveDays, setHealthState } from "./db";
import { makeT, type MessageKey } from "./i18n";
import { addDays } from "./lib/date";
import { type HcSample, mapHealth } from "./lib/healthMap";
import { applySamsung } from "./lib/samsung";
import type { DayEntry, DaysMap, Settings, SourceKey } from "./lib/types";
import { db } from "./db";
import { isNative } from "./native";

type HType = "steps" | "workouts" | "weight" | "bloodPressure" | "sleep" | "restingHeartRate";
const TYPES: Record<SourceKey, HType[]> = {
  steps: ["steps"], exercise: ["workouts"], weight: ["weight"], bp: ["bloodPressure"], sleep: ["sleep", "restingHeartRate"],
};
const wanted = (s: Settings) => (Object.keys(TYPES) as SourceKey[]).filter((k) => s.sources[k]).flatMap((k) => TYPES[k]);

export async function healthAvailable(): Promise<boolean> {
  if (!isNative) return false;
  try { return (await Health.isAvailable()).available; } catch { return false; }
}

/** Opens the Health Connect permission sheet for the data the user chose to take from the watch. */
export async function connectHealth(): Promise<"ok" | "denied" | "unavailable"> {
  if (!(await healthAvailable())) return "unavailable";
  const settings = await getSettings();
  const read = wanted(settings);
  const status = await Health.requestAuthorization({ read, write: [] });
  if (!status.readAuthorized.length) return "denied";
  await setHealthState({ on: true });
  await pullHealth();
  return "ok";
}

export async function disconnectHealth() {
  await setHealthState({ on: false });
}

let running: Promise<number> | null = null;

/** Reads the last two weeks from Health Connect and updates days. Returns how many days changed. */
export function pullHealth(): Promise<number> {
  running ??= run().finally(() => { running = null; });
  return running;
}

async function run(): Promise<number> {
  const state = await getHealthState();
  if (!isNative || !state?.on) return 0;
  try {
    const settings = await getSettings();
    const granted = new Set((await Health.checkAuthorization({ read: wanted(settings), write: [] })).readAuthorized as string[]);
    const now = new Date();
    const startDate = addDays(now, -14).toISOString();
    const endDate = now.toISOString();
    const samples = async (dataType: HType): Promise<HcSample[] | undefined> =>
      granted.has(dataType) ? (await Health.readSamples({ dataType, startDate, endDate, limit: 2000, ascending: true })).samples as HcSample[] : undefined;

    const data = mapHealth({
      // Aggregated per day: Health Connect removes phone/watch duplicates itself.
      steps: granted.has("steps") ? (await Health.queryAggregated({ dataType: "steps", startDate, endDate, bucket: "day", aggregation: "sum" })).samples : undefined,
      workouts: granted.has("workouts") ? (await Health.queryWorkouts({ startDate, endDate, limit: 500, ascending: true })).workouts : undefined,
      weight: await samples("weight"),
      bp: await samples("bloodPressure"),
      sleep: await samples("sleep"),
      restingHr: await samples("restingHeartRate"),
    });

    const days: DaysMap = {};
    await db.days.each((d: DayEntry) => { if (!d.deleted) days[d.date] = d; });
    const t = makeT(settings.lang);
    const { changes } = applySamsung(days, data, settings.sources, (k) => t(`cardio.${k}` as MessageKey));
    await saveDays(changes);
    await setHealthState({ on: true, lastPullAt: new Date().toISOString(), lastCount: changes.length });
    return changes.length;
  } catch (e) {
    await setHealthState({ on: true, lastPullAt: state.lastPullAt, lastError: (e as Error).message || "error" });
    return 0;
  }
}

/** Pulls on start, whenever the app comes back to the screen, and hourly while open. */
export function startAutoHealth() {
  if (!isNative) return;
  void pullHealth();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void pullHealth(); });
  setInterval(() => void pullHealth(), 60 * 60 * 1000);
}

export const openHealthSettings = () => Health.openHealthConnectSettings();
