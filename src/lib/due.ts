import { addDays, iso } from "./date";
import { activeHabits, markOf } from "./habits";
import type { DayEntry, DaysMap, Habit, Settings } from "./types";

export type DueItem =
  | { kind: "weight" }
  | { kind: "feel" }
  | { kind: "bp" }
  | { kind: "habit"; habit: Habit };

export const hm = (s: string | undefined) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? ""); return m ? +m[1] * 60 + +m[2] : null; };

/** The screen stays up for yesterday's evening until early morning, then gives up. */
const LAST_CALL = 6 * 60;

/**
 * Which day the evening check is about right now, or null outside its time.
 * The check starts at the evening time and runs past midnight (for 23:20–01:00,
 * at 00:30 it is still about yesterday).
 */
export function eveningDay(s: Settings, now: Date): string | null {
  const ev = s.reminders.evening;
  const start = hm(ev.time);
  if (!ev.on || start == null) return null;
  const t = now.getHours() * 60 + now.getMinutes();
  if (t >= start) return iso(now);
  if (t < LAST_CALL && start > LAST_CALL) return iso(addDays(now, -1));
  return null;
}

/** Everything the evening check asks for that the day still lacks. */
export function eveningMissing(s: Settings, day: DayEntry | undefined, date: string): DueItem[] {
  const out: DueItem[] = [];
  if (day?.weight == null && !day?.noWeight) out.push({ kind: "weight" });
  if (day?.feel == null && !day?.ok && !day?.flags?.length) out.push({ kind: "feel" });
  if (s.reminders.bp.on && !(day?.bp?.e1 || day?.bp?.e2)) out.push({ kind: "bp" });
  for (const h of activeHabits(s.habits, date)) if (!markOf(day, h.id)) out.push({ kind: "habit", habit: h });
  return out;
}

/** What the reminder screen asks for right now, and for which day. */
export function dueItems(s: Settings, days: DaysMap, now: Date): { date: string; items: DueItem[] } | null {
  const date = eveningDay(s, now);
  if (!date) return null;
  const items = eveningMissing(s, days[date], date);
  return items.length ? { date, items } : null;
}
