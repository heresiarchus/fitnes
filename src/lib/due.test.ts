import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../db";
import { dueItems } from "./due";
import { samsungSteps } from "./healthMap";

const s = { ...DEFAULT_SETTINGS, reminders: { ...DEFAULT_SETTINGS.reminders, evening: { on: true, time: "21:00" }, bp: { on: true, time: "20:00" } } };
const at = (h: number, m = 0) => new Date(2026, 10, 12, h, m);

describe("reminder screen", () => {
  it("asks nothing before the times have come", () => {
    expect(dueItems(s, undefined, at(9)).map((x) => x.kind)).toEqual([]);
  });
  it("asks for what is missing after the evening time, including habits whose window began", () => {
    const kinds = dueItems(s, undefined, at(21, 5)).map((x) => (x.kind === "habit" ? x.habit.id : x.kind));
    expect(kinds).toEqual(["weight", "feel", "bp", "move_before_pc", "eat_before_pc"]);
  });
  it("drops each item once it is logged", () => {
    const day = { date: "2026-11-12", updatedAt: "x", weight: 130, feel: 4, bp: { e1: { sys: 120, dia: 80, pulse: null } },
      habitLog: [{ habitId: "move_before_pc", status: "min" as const }, { habitId: "eat_before_pc", status: "rest" as const }] };
    expect(dueItems(s, day, at(22))).toEqual([]);
    expect(dueItems(s, { date: "2026-11-12", updatedAt: "x", noWeight: true }, at(21, 30)).map((x) => x.kind)).not.toContain("weight");
  });
});

describe("Samsung Health step total", () => {
  const rec = (s: string, e: string, v: number, src = "com.sec.android.app.shealth") => ({ startDate: `2026-11-12T${s}:00Z`, endDate: `2026-11-12T${e}:00Z`, value: v, sourceName: src });
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
