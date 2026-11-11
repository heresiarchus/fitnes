import { describe, expect, it } from "vitest";
import { planReminders } from "./reminders";
import { DEFAULT_HABITS } from "./habits";
import type { Reminders } from "./types";

const r: Reminders = { weigh: { on: true, time: "08:00" }, evening: { on: true, time: "21:00" }, bp: { on: false, time: "20:00" }, review: { on: false, time: "22:20" } };
const u = "t";

describe("planReminders", () => {
  it("skips past times and disabled reminders", () => {
    const now = new Date(2026, 10, 11, 9, 30);
    const plan = planReminders(r, {}, now, 2);
    expect(plan.map((p) => [p.kind, p.at.getDate(), p.at.getHours()])).toEqual([["evening", 11, 21], ["weigh", 12, 8], ["evening", 12, 21]]);
    expect(new Set(plan.map((p) => p.id)).size).toBe(3);
  });
  it("drops today's reminder once the data is logged, keeps tomorrow's", () => {
    const now = new Date(2026, 10, 11, 7, 0);
    const days = { "2026-11-11": { date: "2026-11-11", updatedAt: u, noWeight: true as const, ok: true as const } };
    const plan = planReminders(r, days, now, 2);
    expect(plan.map((p) => [p.kind, p.at.getDate()])).toEqual([["weigh", 12], ["evening", 12]]);
  });
  it("handles the pressure reminder and bad times", () => {
    const now = new Date(2026, 10, 11, 7, 0);
    const cfg: Reminders = { weigh: { on: true, time: "oops" }, evening: { on: false, time: "21:00" }, bp: { on: true, time: "20:15" }, review: { on: false, time: "22:20" } };
    const days = { "2026-11-11": { date: "2026-11-11", updatedAt: u, bp: { e1: { sys: 120, dia: 80, pulse: null } } } };
    expect(planReminders(cfg, {}, now, 1).map((p) => [p.kind, p.at.getMinutes()])).toEqual([["bp", 15]]);
    expect(planReminders(cfg, days, now, 1)).toEqual([]);
  });
});

describe("habit and review reminders", () => {
  const off: Reminders = { weigh: { on: false, time: "08:00" }, evening: { on: false, time: "21:00" }, bp: { on: false, time: "20:00" }, review: { on: true, time: "22:20" } };
  const habit = DEFAULT_HABITS[0];
  it("repeats inside the window until the habit is marked", () => {
    const now = new Date(2026, 10, 11, 19, 30); // Wednesday
    const plan = planReminders({ ...off, review: { on: false, time: "22:20" } }, {}, now, 1, [habit]);
    expect(plan.map((p) => `${p.at.getHours()}:${p.at.getMinutes()}`)).toEqual(["19:50", "20:15", "20:40", "21:5", "21:30"]);
    expect(plan[0].minOnly).toBe(true);
    const marked = { "2026-11-11": { date: "2026-11-11", updatedAt: u, habitLog: [{ habitId: habit.id, status: "rest" as const }] } };
    expect(planReminders({ ...off, review: { on: false, time: "22:20" } }, marked, now, 1, [habit])).toEqual([]);
  });
  it("does not remind before the habit starts and offers the full version after a recent mark", () => {
    expect(planReminders({ ...off, review: { on: false, time: "22:20" } }, {}, new Date(2026, 10, 10, 12, 0), 1, [habit])).toEqual([]);
    const days = { "2026-11-11": { date: "2026-11-11", updatedAt: u, habitLog: [{ habitId: habit.id, status: "done" as const }] } };
    expect(planReminders({ ...off, review: { on: false, time: "22:20" } }, days, new Date(2026, 10, 12, 12, 0), 1, [habit])[0].minOnly).toBe(false);
  });
  it("schedules the weekly review on Sunday only", () => {
    const plan = planReminders(off, {}, new Date(2026, 10, 11, 12, 0), 7);
    expect(plan.map((p) => [p.kind, p.at.getDay(), p.at.getHours(), p.at.getMinutes()])).toEqual([["review", 0, 22, 20]]);
  });
});
