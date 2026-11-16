import Dexie, { type EntityTable } from "dexie";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { DEFAULT_GOALS } from "./lib/goals";
import { DEFAULT_HABITS, migrateHabits } from "./lib/habits";
import type { DayEntry, DaysMap, Item, Settings, SheetsConfig, SyncConfig } from "./lib/types";
import { connectionRecords, type Secret, stampLegacy } from "./cloud/plan";

interface SettingsRow extends Settings { key: "main" }
type MetaRow = { key: "sync"; value: SyncConfig } | { key: "sheets"; value: SheetsConfig } | { key: "health"; value: HealthState } | { key: "migrations"; value: string[] } | { key: "cloud"; value: CloudState };
export interface CloudState { userId: string; lastServerAt: string | null; synced: Record<string, string>; lastAt?: string }
export interface HealthState { on: boolean; history?: boolean; lastPullAt?: string; lastFullAt?: string; lastError?: string; lastCount?: number }

export const db = new Dexie("fitnes") as Dexie & {
  days: EntityTable<DayEntry, "date">;
  settings: EntityTable<SettingsRow, "key">;
  meta: EntityTable<MetaRow, "key">;
  items: EntityTable<Item, "id">;
};

db.version(1).stores({ days: "date", settings: "key" });
db.version(2).stores({ days: "date", settings: "key", meta: "key" });
db.version(3).stores({ days: "date", settings: "key", meta: "key", items: "id, kind" });

export const EPOCH = "1970-01-01T00:00:00.000Z";

export const DEFAULT_SETTINGS: Settings = {
  phase: "1",
  startDate: "2026-11-10",
  stepGoal: null,
  lang: "uk",
  theme: "auto",
  palette: "mint",
  healthLinked: false,
  remindersV: 3,
  sources: { steps: true, exercise: true, weight: false, bp: false, sleep: true },
  bpMark: { sys: 135, dia: 85 },
  reminders: {
    weigh: { on: false, time: "08:00" }, evening: { on: true, time: "23:20", until: "01:00", every: 5 },
    bp: { on: false, time: "20:00" }, review: { on: true, time: "22:20" },
  },
  habits: DEFAULT_HABITS,
  goals: DEFAULT_GOALS,
  hideWeight: false,
  updatedAt: EPOCH,
};

/** Fills in defaults, including nested ones, for settings saved by older versions. */
export function normalizeSettings(raw: Partial<Settings> | undefined): Settings {
  const r = { ...(raw ?? {}) };
  // v2: reminders only in the evening, and only for what is still missing.
  if (r.reminders && (r.remindersV ?? 0) < 2) r.reminders = { ...r.reminders, weigh: { ...r.reminders.weigh, on: false } };
  // v3: one evening check at 23:20, repeating every 5 minutes until 01:00; habits and pressure are part of it.
  if (r.reminders && (r.remindersV ?? 0) < 3) r.reminders = { ...r.reminders, evening: { ...r.reminders.evening, time: "23:20", until: "01:00", every: 5 } };
  return {
    ...DEFAULT_SETTINGS, ...r,
    sources: { ...DEFAULT_SETTINGS.sources, ...(r.sources ?? {}) },
    bpMark: { ...DEFAULT_SETTINGS.bpMark, ...(r.bpMark ?? {}) },
    reminders: {
      weigh: { ...DEFAULT_SETTINGS.reminders.weigh, ...(r.reminders?.weigh ?? {}) },
      evening: { ...DEFAULT_SETTINGS.reminders.evening, ...(r.reminders?.evening ?? {}) },
      bp: { ...DEFAULT_SETTINGS.reminders.bp, ...(r.reminders?.bp ?? {}) },
      review: { ...DEFAULT_SETTINGS.reminders.review, ...(r.reminders?.review ?? {}) },
    },
    remindersV: 3,
    // Goals: keep the user's targets, add metrics introduced later; the old steps goal seeds the steps target.
    goals: DEFAULT_GOALS.map((g) => r.goals?.find((x) => x.metric === g.metric) ?? (g.metric === "steps" && r.stepGoal ? { ...g, target: r.stepGoal } : g)),
    habits: migrateHabits(Array.isArray(r.habits) && r.habits.length ? r.habits : DEFAULT_HABITS),
  };
}

/** Fired after every user-made local change, so sync can push it. */
export const localChanges = new EventTarget();
const changed = () => localChanges.dispatchEvent(new Event("change"));

export function useSettings(): Settings {
  const row = useLiveQuery(() => db.settings.get("main"), []);
  return useMemo(() => {
    const { key: _key, ...rest } = row ?? ({} as Partial<SettingsRow>);
    return normalizeSettings(rest);
  }, [row]);
}

export async function getSettings(): Promise<Settings> {
  const row = await db.settings.get("main");
  const { key: _key, ...rest } = row ?? ({} as Partial<SettingsRow>);
  return normalizeSettings(rest);
}

export async function updateSettings(patch: Partial<Settings>) {
  await db.transaction("rw", db.settings, async () => {
    const cur = await db.settings.get("main");
    await db.settings.put({ ...normalizeSettings(cur), ...patch, updatedAt: new Date().toISOString(), key: "main" });
  });
  changed();
}

/** Writes settings that came from sync (keeps their timestamp, no change event). */
export async function putSyncedSettings(s: Settings) {
  await db.settings.put({ ...normalizeSettings(s), key: "main" });
}

/** All live (not deleted) days as a date-keyed map; undefined while loading. */
export function useDays(): DaysMap | undefined {
  return useLiveQuery(async () => {
    const map: DaysMap = {};
    await db.days.each((d) => { if (!d.deleted) map[d.date] = d; });
    return map;
  }, []);
}

export async function liveDays(): Promise<DayEntry[]> {
  return (await db.days.toArray()).filter((d) => !d.deleted);
}

export async function saveDay(d: DayEntry) {
  await db.days.put(d);
  changed();
}

export async function saveDays(ds: DayEntry[]) {
  if (!ds.length) return;
  await db.days.bulkPut(ds);
  changed();
}

export async function deleteDay(date: string) {
  await db.days.put({ date, deleted: true, updatedAt: new Date().toISOString() });
  changed();
}

export async function deleteAllDays() {
  const now = new Date().toISOString();
  const all = await db.days.toArray();
  await db.days.bulkPut(all.filter((d) => !d.deleted).map((d) => ({ date: d.date, deleted: true as const, updatedAt: now })));
  changed();
}

const live = <T extends { deleted?: true }>(v: T | undefined) => (v && !v.deleted ? v : undefined);

export async function getSyncConfig(): Promise<SyncConfig | undefined> {
  return live((await db.meta.get("sync"))?.value as SyncConfig | undefined);
}

/**
 * Sets or removes the GitHub data connection. A user change gets a new timestamp so it
 * follows the account; `keepStamp` is for the app's own bookkeeping (last sync time).
 */
export async function setSyncConfig(value: SyncConfig | null, keepStamp = false) {
  const now = new Date().toISOString();
  if (value) await db.meta.put({ key: "sync", value: keepStamp ? value : { ...value, updatedAt: now } });
  else await db.meta.put({ key: "sync", value: { provider: "github", repo: "", token: "", path: "", deleted: true, updatedAt: now } });
  if (!keepStamp) changed();
}

export function useSyncConfig(): SyncConfig | null | undefined {
  return useLiveQuery(async () => live((await db.meta.get("sync"))?.value as SyncConfig | undefined) ?? null, []);
}

/** Live (not deleted) items of one kind; undefined while loading. */
export function useItems<K extends Item["kind"]>(kind: K): Extract<Item, { kind: K }>[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.items.where("kind").equals(kind).toArray();
    return all.filter((i) => !i.deleted) as Extract<Item, { kind: K }>[];
  }, [kind]);
}

export const newId = (prefix: string) => prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export async function saveItem(item: Item) {
  await db.items.put({ ...item, updatedAt: new Date().toISOString() });
  changed();
}

export async function saveItems(items: Item[]) {
  if (!items.length) return;
  await db.items.bulkPut(items);
  changed();
}

export async function deleteItem(item: Item) {
  // Keep a tombstone so the deletion reaches other devices.
  await db.items.put({ id: item.id, kind: item.kind, deleted: true, updatedAt: new Date().toISOString() } as Item);
  changed();
}

export async function getSheetsConfig(): Promise<SheetsConfig | undefined> {
  return live((await db.meta.get("sheets"))?.value as SheetsConfig | undefined);
}

export async function setSheetsConfig(value: SheetsConfig | null, keepStamp = false) {
  const now = new Date().toISOString();
  if (value) await db.meta.put({ key: "sheets", value: keepStamp ? value : { ...value, updatedAt: now } });
  else await db.meta.put({ key: "sheets", value: { url: "", deleted: true, updatedAt: now } });
  if (!keepStamp) changed();
}

export function useSheetsConfig(): SheetsConfig | null | undefined {
  return useLiveQuery(async () => live((await db.meta.get("sheets"))?.value as SheetsConfig | undefined) ?? null, []);
}

/** Stored connection records (including removals), for account sync. */
export async function getSecrets(): Promise<Record<string, Secret>> {
  let sync = (await db.meta.get("sync"))?.value as SyncConfig | undefined;
  let sheets = (await db.meta.get("sheets"))?.value as SheetsConfig | undefined;
  const stamped = stampLegacy(sync, sheets);
  if (stamped?.sync) { sync = stamped.sync; await db.meta.put({ key: "sync", value: sync }); }
  if (stamped?.sheets) { sheets = stamped.sheets; await db.meta.put({ key: "sheets", value: sheets }); }
  return connectionRecords(sync, sheets);
}

/** Applies a connection record that came from the account. */
export async function putSecret(id: string, v: Secret) {
  if (id === "sync") await db.meta.put({ key: "sync", value: v.deleted ? { provider: "github", repo: "", token: "", path: "", deleted: true, updatedAt: v.updatedAt } : (v as unknown as SyncConfig) });
  if (id === "sheets") await db.meta.put({ key: "sheets", value: v.deleted ? { url: "", deleted: true, updatedAt: v.updatedAt } : (v as unknown as SheetsConfig) });
}

export async function getHealthState(): Promise<HealthState | undefined> {
  return (await db.meta.get("health"))?.value as HealthState | undefined;
}
export async function setHealthState(value: HealthState) {
  await db.meta.put({ key: "health", value });
}
export function useHealthState(): HealthState | null | undefined {
  return useLiveQuery(async () => ((await db.meta.get("health"))?.value as HealthState | undefined) ?? null, []);
}

/**
 * One-time data fixes, each run once per device.
 * pace-auto-1: walking pace used to be set to "light" automatically for watch walks;
 * it carried no information, so it is cleared everywhere (the user sets it by hand when it matters).
 */
export async function runMigrations() {
  const done = ((await db.meta.get("migrations"))?.value as string[] | undefined) ?? [];
  if (!done.includes("pace-auto-1")) {
    const now = new Date().toISOString();
    const fix = (await db.days.toArray()).filter((d) => !d.deleted && d.walkIntensity === "light").map((d) => {
      const { walkIntensity: _w, ...rest } = d;
      return { ...rest, updatedAt: now };
    });
    if (fix.length) await saveDays(fix);
    await db.meta.put({ key: "migrations", value: [...done, "pace-auto-1"] });
  }
}
