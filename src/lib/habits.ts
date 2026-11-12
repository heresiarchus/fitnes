import { addDays, iso, parseIso } from "./date";
import type { DayEntry, DaysMap, Habit, HabitMark, HabitMeasure, HabitStatus } from "./types";

export const EAT_WHAT = ["гаряча страва", "бутерброд / перекус", "фрукти / йогурт", "інше"];
export const EAT_AT_PC = ["ні", "так, порцію в тарілці", "так, з пачки"];

/** Starter catalogue. The user edits it in settings; nothing here is fixed in code paths. */
export const DEFAULT_HABITS: Habit[] = [
  {
    id: "move_before_pc", title: "10–15 хвилин руху до комп'ютера", minVersion: "одна вправа",
    enabled: true, activeFrom: "2026-11-11", remind: { from: "19:00", until: "21:30", everyMin: 25 }, autoFrom: "movement",
    fields: [
      { key: "kind", label: "Що", options: ["ходьба", "силова", "вправи"] },
      { key: "minutes", label: "Хвилин", options: ["5", "10", "15", "20+"] },
    ],
  },
  {
    id: "eat_before_pc", title: "Їжа до комп'ютера", minVersion: "поїсти хоч щось до того, як сісти",
    enabled: true, activeFrom: "2026-11-11", remind: { from: "19:00", until: "21:30", everyMin: 25 },
    fields: [
      { key: "what", label: "Що їв", options: EAT_WHAT },
      { key: "atPc", label: "Їв за комп'ютером", options: EAT_AT_PC },
    ],
  },
  { id: "bed_2330", title: "У ліжку о 23:30", minVersion: "лягти до опівночі", enabled: false, remind: null },
  { id: "games_after_done", title: "Ігри після позначки", minVersion: "спершу одна позначка", enabled: false, remind: null },
  { id: "walk_to_work", title: "Пішки на службу", minVersion: "частину дороги пішки", enabled: false, remind: null },
];

export function activeHabits(habits: Habit[], date: string): Habit[] {
  return habits.filter((h) => h.enabled && (!h.activeFrom || h.activeFrom <= date) && (!h.activeTo || date <= h.activeTo));
}

export function markOf(d: DayEntry | undefined, habitId: string): HabitMark | undefined {
  return d?.habitLog?.find((m) => m.habitId === habitId);
}

/** Returns the day with one habit mark set (or removed when `mark` is null). */
export function withMark(d: DayEntry, habitId: string, mark: Omit<HabitMark, "habitId"> | null, now = new Date()): DayEntry {
  const rest = (d.habitLog ?? []).filter((m) => m.habitId !== habitId);
  const habitLog = mark ? [...rest, { habitId, ...mark }] : rest;
  const out: DayEntry = { ...d, updatedAt: now.toISOString() };
  if (habitLog.length) out.habitLog = habitLog; else delete out.habitLog;
  return out;
}

/** Text for a habit that takes its answer from the day's logged movement, or null. */
export function movementDetail(d: Pick<DayEntry, "walkMin" | "strength" | "cardioMin">, labels: { walk: string; strength: string; min: string }): string | null {
  const parts: string[] = [];
  if (d.strength?.length) parts.push(labels.strength);
  const minutes = (d.walkMin ?? 0) + (d.cardioMin ?? 0);
  if (minutes > 0) parts.push(`${labels.walk} ${minutes} ${labels.min}`);
  return parts.length ? parts.join(", ") : null;
}

/** How many days in a row before `date` have no mark for the habit (capped at `cap`). */
export function daysWithoutMark(days: DaysMap, habitId: string, date: string, cap = 7): number {
  let n = 0;
  for (let i = 1; i <= cap; i++) {
    if (markOf(days[iso(addDays(parseIso(date), -i))], habitId)) break;
    n += 1;
  }
  return n;
}

/** Replaces the unclear first-draft options ("набір A/B/C") in settings saved by older versions. */
export function migrateHabits(habits: Habit[]): Habit[] {
  return habits.map((h) => {
    if (!h.fields?.some((f) => f.options.some((o) => /^набір [ABC]$/.test(o)))) return h;
    return { ...h, fields: h.fields.map((f) => (f.key === "what" ? { ...f, options: EAT_WHAT } : f.key === "atPc" ? { ...f, label: "Їв за комп'ютером", options: EAT_AT_PC } : f)) };
  });
}

/** Turns a measured answer into the common status, so reports and reminders treat all habits alike. */
export function statusFromValue(m: HabitMeasure, value: number | string): HabitStatus {
  if (m.type === "yesno") return value === "yes" ? "done" : "no";
  if (m.type === "choice" || m.type === "scale") return "done";
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "no";
  if (m.target != null && m.target > 0) return n >= m.target ? "done" : "min";
  return "done";
}

/** Sensible defaults when the user switches a habit to an answer type. */
export function defaultMeasure(type: HabitMeasure["type"]): HabitMeasure {
  switch (type) {
    case "count": return { type, unit: "раз", min: 0, max: 100, step: 1 };
    case "slider": return { type, unit: "хв", min: 0, max: 60, step: 5 };
    case "drum": return { type, unit: "км", min: 0, max: 20, step: 0.5 };
    case "scale": return { type, max: 5 };
    case "choice": return { type, options: ["варіант 1", "варіант 2"] };
    default: return { type };
  }
}
