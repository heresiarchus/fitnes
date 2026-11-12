import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../db";
import { dueItems, eveningDay } from "./due";
import { samsungSteps } from "./healthMap";

const s = DEFAULT_SETTINGS; // evening check 23:20, every 5 min until 01:00
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m);
const kinds = (r: ReturnType<typeof dueItems>) => r?.items.map((x) => (x.kind === "habit" ? x.habit.id : x.kind));

describe("evening check", () => {
  it("runs from 23:20 past midnight, still about the evening's day", () => {
    expect(eveningDay(s, at(12, 21, 0))).toBeNull();
    expect(eveningDay(s, at(12, 23, 20))).toBe("2026-11-12");
    expect(eveningDay(s, at(13, 0, 40))).toBe("2026-11-12");
    expect(eveningDay(s, at(13, 9, 0))).toBeNull();
  });
  it("asks for weight, rating and every unmarked habit", () => {
    expect(dueItems(s, {}, at(12, 18))).toBeNull();
    expect(kinds(dueItems(s, {}, at(12, 23, 25)))).toEqual(["weight", "feel", "move_before_pc", "eat_before_pc"]);
    const pressure = { ...s, reminders: { ...s.reminders, bp: { on: true, time: "" } } };
    expect(kinds(dueItems(pressure, {}, at(13, 0, 30)))).toContain("bp");
  });
  it("is done once everything is answered", () => {
    const day = { date: "2026-11-12", updatedAt: "x", noWeight: true as const, feel: 4,
      habitLog: [{ habitId: "move_before_pc", status: "min" as const }, { habitId: "eat_before_pc", status: "rest" as const }] };
    expect(dueItems(s, { "2026-11-12": day }, at(13, 0, 10))).toBeNull();
    expect(dueItems(s, { "2026-11-12": { ...day, weight: 130, noWeight: undefined } }, at(12, 23, 30))).toBeNull();
  });
});

describe("Samsung Health step total", () => {
  const rec = (st: string, e: string, v: number, src = "com.sec.android.app.shealth") => ({ startDate: `2026-11-12T${st}:00Z`, endDate: `2026-11-12T${e}:00Z`, value: v, sourceName: src });
  it("sums Samsung records and ignores other apps", () => {
    expect(samsungSteps([rec("08:00", "09:00", 1200), rec("10:00", "11:00", 2300), rec("08:00", "12:00", 2054, "com.google.android.apps.fitness")])).toBe(3500);
  });
  it("does not double count overlapping phone and watch records", () => {
    expect(samsungSteps([rec("08:00", "09:00", 1200), rec("08:30", "09:00", 900), rec("10:00", "11:00", 100)])).toBe(1300);
  });
  it("returns null when Samsung Health wrote nothing", () => {
    expect(samsungSteps([rec("08:00", "09:00", 500, "com.google.android.apps.fitness")])).toBeNull();
  });
});
