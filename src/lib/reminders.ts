import { addDays, iso } from "./date";
import { eveningMissing, hm } from "./due";
import type { DayEntry, DaysMap, Settings } from "./types";

export interface PlannedReminder {
  id: number;
  kind: "evening" | "review";
  at: Date;
  /** The day the evening check is about (repeats after midnight still belong to it). */
  date: string;
}

/** Kept for the home widget and older callers: weight answer and day rating. */
export function missingToday(d: DayEntry | undefined): ("weight" | "feel")[] {
  const out: ("weight" | "feel")[] = [];
  if (d?.weight == null && !d?.noWeight) out.push("weight");
  if (d?.feel == null && !d?.ok && !d?.flags?.length) out.push("feel");
  return out;
}

const atMinutes = (day: Date, minutes: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes, 0);

/** Evening repeats use ids 5000+ so delivered ones can be cleared once that day is complete. */
export const EVENING_ID = 5000;
const REVIEW_ID = 300;

/**
 * Notifications for the next `daysAhead` evenings. The evening check repeats from
 * its time every `every` minutes until `until` (which may be after midnight).
 * Evenings that are already complete get nothing. The weekly review fires on Sundays.
 */
export function planReminders(s: Settings, days: DaysMap, now: Date, daysAhead: number): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  const ev = s.reminders.evening;
  const start = hm(ev.time), end = hm(ev.until ?? ev.time);
  const every = Math.max(1, ev.every ?? 30);
  if (ev.on && start != null && end != null) {
    const stop = end >= start ? end : end + 24 * 60; // crosses midnight
    for (let i = -1; i < daysAhead; i++) {
      const day = addDays(now, i);
      const date = iso(day);
      if (!eveningMissing(s, days[date], date).length) continue;
      for (let m = start, rep = 0; m <= stop && rep < 40; m += every, rep++) {
        const at = atMinutes(day, m);
        if (at.getTime() > now.getTime()) out.push({ id: EVENING_ID + (i + 1) * 40 + rep, kind: "evening", at, date });
      }
    }
  }
  const rv = s.reminders.review;
  const rt = hm(rv.time);
  if (rv.on && rt != null) {
    for (let i = 0; i < Math.max(daysAhead, 7); i++) {
      const day = addDays(now, i);
      const at = atMinutes(day, rt);
      if (day.getDay() === 0 && at.getTime() > now.getTime()) out.push({ id: REVIEW_ID + i, kind: "review", at, date: iso(day) });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}
