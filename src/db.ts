import Dexie, { type EntityTable } from "dexie";
import { useLiveQuery } from "dexie-react-hooks";
import type { DayEntry, DaysMap, Settings } from "./lib/types";

interface SettingsRow extends Settings { key: "main" }

export const db = new Dexie("fitnes") as Dexie & {
  days: EntityTable<DayEntry, "date">;
  settings: EntityTable<SettingsRow, "key">;
};

db.version(1).stores({
  days: "date",
  settings: "key",
});

export const DEFAULT_SETTINGS: Settings = {
  phase: "1",
  startDate: "2026-11-10",
  stepGoal: null,
  lang: "uk",
  theme: "auto",
};

export function useSettings(): Settings {
  const row = useLiveQuery(() => db.settings.get("main"), []);
  const { key: _key, ...rest } = row ?? ({} as Partial<SettingsRow>);
  return { ...DEFAULT_SETTINGS, ...rest };
}

export async function updateSettings(patch: Partial<Settings>) {
  await db.transaction("rw", db.settings, async () => {
    const cur = await db.settings.get("main");
    await db.settings.put({ ...DEFAULT_SETTINGS, ...cur, ...patch, key: "main" });
  });
}

/** All days as a date-keyed map; undefined while loading. */
export function useDays(): DaysMap | undefined {
  return useLiveQuery(async () => {
    const all = await db.days.toArray();
    const map: DaysMap = {};
    for (const d of all) map[d.date] = d;
    return map;
  }, []);
}
