import { addDays, iso } from "./date";
import type { DaysMap, ReminderKind, Reminders } from "./types";
import { REMINDER_KINDS } from "./types";

export interface PlannedReminder { id: number; kind: ReminderKind; at: Date }

/** Whether today's entry already contains what the reminder asks for. */
export function isDone(kind: ReminderKind, days: DaysMap, date: string): boolean {
  const d = days[date];
  if (!d) return false;
  if (kind === "weigh") return d.weight != null || !!d.noWeight;
  if (kind === "evening") return !!d.ok || !!d.flags?.length;
  return !!(d.bp?.e1 || d.bp?.e2);
}

/**
 * Reminders for the next `daysAhead` days. Skips times already in the past
 * and, for today, reminders whose data is already logged.
 * Ids are stable per kind and day offset, so a new plan replaces the old one.
 */
export function planReminders(r: Reminders, days: DaysMap, now: Date, daysAhead: number): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  const today = iso(now);
  REMINDER_KINDS.forEach((kind, k) => {
    const cfg = r[kind];
    const m = /^(\d{1,2}):(\d{2})$/.exec(cfg?.time ?? "");
    if (!cfg?.on || !m) return;
    for (let i = 0; i < daysAhead; i++) {
      const day = addDays(now, i);
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), +m[1], +m[2], 0);
      if (at.getTime() <= now.getTime()) continue;
      if (i === 0 && isDone(kind, days, today)) continue;
      out.push({ id: (k + 1) * 100 + i, kind, at });
    }
  });
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}
