import { activeHabits, markOf } from "./habits";
import type { DayEntry, Habit, Settings } from "./types";
import { fromWatch } from "./types";

export type DueItem =
  | { kind: "weight" }
  | { kind: "feel" }
  | { kind: "bp" }
  | { kind: "habit"; habit: Habit };

const minutes = (hm: string | undefined) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hm ?? ""); return m ? +m[1] * 60 + +m[2] : null; };

/**
 * What the reminder screen should ask for right now: things whose reminder
 * time has passed today and that are still not logged. A weight that came
 * from the watch counts as logged.
 */
export function dueItems(s: Settings, today: DayEntry | undefined, now: Date): DueItem[] {
  const t = now.getHours() * 60 + now.getMinutes();
  const out: DueItem[] = [];
  const evening = minutes(s.reminders.evening.time);
  if (s.reminders.evening.on && evening != null && t >= evening) {
    if (today?.weight == null && !today?.noWeight) out.push({ kind: "weight" });
    if (today?.feel == null && !today?.ok && !today?.flags?.length) out.push({ kind: "feel" });
  }
  const weigh = minutes(s.reminders.weigh.time);
  if (s.reminders.weigh.on && weigh != null && t >= weigh && !out.some((x) => x.kind === "weight")
    && today?.weight == null && !today?.noWeight && !fromWatch(s, "weight")) out.push({ kind: "weight" });
  const bp = minutes(s.reminders.bp.time);
  if (s.reminders.bp.on && bp != null && t >= bp && !(today?.bp?.e1 || today?.bp?.e2)) out.push({ kind: "bp" });
  const date = today?.date ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  for (const h of activeHabits(s.habits, date)) {
    const from = minutes(h.remind?.from);
    if (from != null && t >= from && !markOf(today, h.id)) out.push({ kind: "habit", habit: h });
  }
  return out;
}
