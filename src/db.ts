import Dexie, { type EntityTable } from "dexie";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import type { DayEntry, DaysMap, Settings, SyncConfig } from "./lib/types";

interface SettingsRow extends Settings { key: "main" }
interface MetaRow { key: "sync"; value: SyncConfig }

export const db = new Dexie("fitnes") as Dexie & {
  days: EntityTable<DayEntry, "date">;
  settings: EntityTable<SettingsRow, "key">;
  meta: EntityTable<MetaRow, "key">;
};

db.version(1).stores({ days: "date", settings: "key" });
db.version(2).stores({ days: "date", settings: "key", meta: "key" });

export const EPOCH = "1970-01-01T00:00:00.000Z";

export const DEFAULT_SETTINGS: Settings = {
  phase: "1",
  startDate: "2026-11-10",
  stepGoal: null,
  lang: "uk",
  theme: "auto",
  sources: { steps: true, exercise: true, weight: false, bp: false },
  bpMark: { sys: 135, dia: 85 },
  updatedAt: EPOCH,
};

/** Fills in defaults, including nested ones, for settings saved by older versions. */
export function normalizeSettings(raw: Partial<Settings> | undefined): Settings {
  const r = raw ?? {};
  return {
    ...DEFAULT_SETTINGS, ...r,
    sources: { ...DEFAULT_SETTINGS.sources, ...(r.sources ?? {}) },
    bpMark: { ...DEFAULT_SETTINGS.bpMark, ...(r.bpMark ?? {}) },
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

export async function getSyncConfig(): Promise<SyncConfig | undefined> {
  return (await db.meta.get("sync"))?.value;
}

export async function setSyncConfig(value: SyncConfig | null) {
  if (value) await db.meta.put({ key: "sync", value });
  else await db.meta.delete("sync");
}

export function useSyncConfig(): SyncConfig | null | undefined {
  return useLiveQuery(async () => (await db.meta.get("sync"))?.value ?? null, []);
}
