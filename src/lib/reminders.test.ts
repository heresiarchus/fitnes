import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../db";
import { missingToday, planReminders } from "./reminders";

const s = { ...DEFAULT_SETTINGS, reminders: { ...DEFAULT_SETTINGS.reminders, review: { on: false, time: "22:20" } } };
const hhmm = (d: Date) => `${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

describe("evening notifications", () => {
  it("repeat every 5 minutes from 23:20 until 01:00 the next night", () => {
    const plan = planReminders(s, {}, new Date(2026, 10, 12, 12, 0), 1);
    const times = plan.map((p) => hhmm(p.at));
    expect(times[0]).toBe("12 23:20");
    expect(times[1]).toBe("12 23:25");
    expect(times[times.length - 1]).toBe("13 01:00");
    expect(times).toHaveLength(21);
    expect(new Set(plan.map((p) => p.id)).size).toBe(plan.length);
    expect(plan.every((p) => p.date === "2026-11-12")).toBe(true);
  });
  it("after midnight continues for yesterday and stops once that day is complete", () => {
    const now = new Date(2026, 10, 13, 0, 30);
    expect(planReminders(s, {}, now, 1).filter((p) => p.date === "2026-11-12").map((p) => hhmm(p.at))[0]).toBe("13 00:35");
    const done = { "2026-11-12": { date: "2026-11-12", updatedAt: "x", noWeight: true as const, feel: 3,
      habitLog: [{ habitId: "move_before_pc", status: "done" as const }, { habitId: "eat_before_pc", status: "no" as const }] } };
    expect(planReminders(s, done, now, 1).filter((p) => p.date === "2026-11-12")).toEqual([]);
  });
  it("schedules the Sunday review", () => {
    const withReview = { ...s, reminders: { ...s.reminders, evening: { ...s.reminders.evening, on: false }, review: { on: true, time: "22:20" } } };
    expect(planReminders(withReview, {}, new Date(2026, 10, 11, 12, 0), 7).map((p) => [p.kind, p.at.getDay(), hhmm(p.at)])).toEqual([["review", 0, "15 22:20"]]);
  });
  it("reports the missing basics", () => {
    expect(missingToday(undefined)).toEqual(["weight", "feel"]);
    expect(missingToday({ date: "d", updatedAt: "x", weight: 130, feel: 3 })).toEqual([]);
  });
});
