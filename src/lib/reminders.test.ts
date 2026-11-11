import { describe, expect, it } from "vitest";
import { planReminders } from "./reminders";
import type { Reminders } from "./types";

const r: Reminders = { weigh: { on: true, time: "08:00" }, evening: { on: true, time: "21:00" }, bp: { on: false, time: "20:00" } };
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
    const cfg: Reminders = { weigh: { on: true, time: "oops" }, evening: { on: false, time: "21:00" }, bp: { on: true, time: "20:15" } };
    const days = { "2026-11-11": { date: "2026-11-11", updatedAt: u, bp: { e1: { sys: 120, dia: 80, pulse: null } } } };
    expect(planReminders(cfg, {}, now, 1).map((p) => [p.kind, p.at.getMinutes()])).toEqual([["bp", 15]]);
    expect(planReminders(cfg, days, now, 1)).toEqual([]);
  });
});
