import { addDays, iso, parseIso } from "./date";
import type { DayEntry, DaysMap, Habit, HabitMark } from "./types";

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
      { key: "what", label: "Що їв", options: ["набір A", "набір B", "набір C", "інше"] },
      { key: "atPc", label: "За комп'ютером", options: ["нічого", "відкладена порція", "з упаковки"] },
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
