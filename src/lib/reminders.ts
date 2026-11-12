import { addDays, iso } from "./date";
import { activeHabits, daysWithoutMark, markOf } from "./habits";
import type { DayEntry, DaysMap, Habit, ReminderKind, Reminders } from "./types";
import { REMINDER_KINDS } from "./types";

export interface PlannedReminder {
  id: number;
  kind: ReminderKind | "habit";
  at: Date;
  habit?: Habit;
  /** After three days without a mark the reminder offers only the minimum. */
  minOnly?: boolean;
}

/** What the evening check would still ask for: the weight answer and the day's rating. */
export function missingToday(d: DayEntry | undefined): ("weight" | "feel")[] {
  const out: ("weight" | "feel")[] = [];
  if (d?.weight == null && !d?.noWeight) out.push("weight");
  if (d?.feel == null && !d?.ok && !d?.flags?.length) out.push("feel");
  return out;
}

/** Whether today's entry already contains what the reminder asks for. */
export function isDone(kind: ReminderKind, days: DaysMap, date: string): boolean {
  const d = days[date];
  if (kind === "review" || !d) return false;
  if (kind === "weigh") return d.weight != null || !!d.noWeight;
  if (kind === "evening") return missingToday(d).length === 0;
  return !!(d.bp?.e1 || d.bp?.e2);
}

const hm = (s: string | undefined) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? ""); return m ? +m[1] * 60 + +m[2] : null; };
const atMinutes = (day: Date, minutes: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60, 0);

/**
 * Reminders for the next `daysAhead` days. Skips times already in the past
 * and, for today, anything already logged. The weekly review fires on Sundays.
 * Habit reminders repeat inside their window until the habit is marked.
 * Ids are stable per kind and day offset, so a new plan replaces the old one.
 */
export function planReminders(r: Reminders, days: DaysMap, now: Date, daysAhead: number, habits: Habit[] = []): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  const today = iso(now);
  REMINDER_KINDS.forEach((kind, k) => {
    const cfg = r[kind];
    const t = hm(cfg?.time);
    if (!cfg?.on || t == null) return;
    for (let i = 0; i < daysAhead; i++) {
      const day = addDays(now, i);
      if (kind === "review" && day.getDay() !== 0) continue;
      if (i === 0 && isDone(kind, days, today)) continue;
      // The evening check repeats every 30 minutes until 23:30, like a medication reminder.
      const times = kind === "evening" ? Array.from({ length: 8 }, (_, n) => t + n * 30).filter((m) => m <= 23 * 60 + 30) : [t];
      times.forEach((m, rep) => {
        const at = atMinutes(day, m);
        // Evening repeats get their own id range (5000+) so delivered ones can be cleared once the day is complete.
        const id = kind === "evening" ? 5000 + i * 10 + rep : (k + 1) * 100 + i;
        if (at.getTime() > now.getTime()) out.push({ id, kind, at });
      });
    }
  });
  habits.forEach((habit, h) => {
    const from = hm(habit.remind?.from), until = hm(habit.remind?.until);
    const every = Math.max(10, habit.remind?.everyMin ?? 0);
    if (!habit.remind || from == null || until == null) return;
    const minOnly = daysWithoutMark(days, habit.id, today, 3) >= 3;
    for (let i = 0; i < Math.min(daysAhead, 7); i++) {
      const day = addDays(now, i);
      const date = iso(day);
      if (!activeHabits([habit], date).length) continue;
      if (i === 0 && markOf(days[today], habit.id)) continue;
      for (let t = from, rep = 0; t <= until && rep < 20; t += every, rep++) {
        const at = atMinutes(day, t);
        if (at.getTime() <= now.getTime()) continue;
        out.push({ id: 1000 * (h + 1) + i * 20 + rep, kind: "habit", at, habit, minOnly });
      }
    }
  });
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}
