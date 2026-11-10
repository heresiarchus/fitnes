import { describe, expect, it } from "vitest";
import { monthDates, weekDates } from "./date";
import { bpIsHigh, bpPeriod, bpSummary, nextBpSlot, lastStrengthFor, previousBp, previousWeight, previousWorkout, periodStats, rollingAvg, walkTarget, weightSeries } from "./stats";
import type { DaysMap } from "./types";

const u = "2026-01-01T00:00:00.000Z";
const days: DaysMap = {
  "2026-11-10": { date: "2026-11-10", updatedAt: u, weight: 136.2, weightCond: "morning", steps: 5000, walkMin: 15, walkIntensity: "light", strength: [{ id: "chair", sets: 1, reps: 15 }], pain: { foot: 2 } },
  "2026-11-11": { date: "2026-11-11", updatedAt: u, weight: 137, weightCond: "other", steps: 7000, walkMin: 20, walkIntensity: "moderate", cardioMin: 10, flags: ["foot"], pain: { foot: 4, back: 1 } },
  "2026-11-12": { date: "2026-11-12", updatedAt: u, weight: 135.8, steps: 6000, note: "ok" },
};

describe("dates", () => {
  it("weekDates starts on Monday", () => {
    const w = weekDates(0, new Date(2026, 10, 12)); // Thu 12 Nov 2026
    expect(w[0]).toBe("2026-11-09");
    expect(w[6]).toBe("2026-11-15");
    expect(weekDates(-1, new Date(2026, 10, 12))[0]).toBe("2026-11-02");
  });
  it("monthDates covers the whole month", () => {
    const m = monthDates(0, new Date(2026, 1, 10));
    expect(m).toHaveLength(28);
    expect(m[0]).toBe("2026-02-01");
    expect(monthDates(-2, new Date(2026, 0, 15))[0]).toBe("2025-11-01");
  });
});

describe("periodStats", () => {
  const s = periodStats(days, weekDates(0, new Date(2026, 10, 12)));
  it("only averages morning weights", () => {
    expect(s.weights).toEqual([136.2, 135.8]);
    expect(s.avgWeight).toBeCloseTo(136);
  });
  it("sums activity", () => {
    expect(s.logged).toBe(3);
    expect(s.totalSteps).toBe(18000);
    expect(s.walk).toBe(35);
    expect(s.walkMod).toBe(20);
    expect(s.walkLight).toBe(15);
    expect(s.cardio).toBe(10);
    expect(s.strengthDays).toBe(1);
  });
  it("tracks max pain, flags and notes", () => {
    expect(s.painMax).toEqual({ foot: 4, back: 1, shoulder: null });
    expect(s.flags).toEqual([{ date: "2026-11-11", flag: "foot" }]);
    expect(s.notes).toEqual([{ date: "2026-11-12", note: "ok" }]);
  });
});

describe("walkTarget", () => {
  it("ramps phase 1 weekly and caps at week 4", () => {
    expect(walkTarget("1", "2026-11-09", "2026-11-10")).toEqual([70, 105]);
    expect(walkTarget("1", "2026-11-16", "2026-11-10")).toEqual([105, 140]);
    expect(walkTarget("1", "2027-02-01", "2026-11-10")).toEqual([175, 210]);
    expect(walkTarget("1", "2026-10-01", "2026-11-10")).toEqual([70, 105]);
  });
  it("uses fixed targets in later phases", () => {
    expect(walkTarget("2", "2026-11-09", "2026-11-10")).toEqual([150, 150]);
    expect(walkTarget("3", "2026-11-09", "2026-11-10")).toEqual([225, 250]);
  });
});

describe("weight series", () => {
  it("computes a 7-day rolling average of morning weights", () => {
    expect(rollingAvg(days, "2026-11-12")).toBeCloseTo(136);
    expect(rollingAvg(days, "2026-11-01")).toBeNull();
    const pts = weightSeries(days, ["2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(pts.map((p) => p.i)).toEqual([0, 2]);
  });
});

describe("lastStrengthFor", () => {
  it("finds the previous session of an exercise", () => {
    expect(lastStrengthFor(days, "chair", "2026-11-12")?.reps).toBe(15);
    expect(lastStrengthFor(days, "chair", "2026-11-10")).toBeNull();
  });
});

describe("previous values for prefill", () => {
  it("finds the latest earlier weight, workout and blood pressure", () => {
    expect(previousWeight(days, "2026-11-12")).toEqual({ date: "2026-11-11", weight: 137 });
    expect(previousWeight(days, "2026-11-10")).toBeNull();
    expect(previousWorkout(days, "2026-11-13")?.date).toBe("2026-11-10");
    expect(previousBp(days, "2026-11-13")).toBeNull();
  });
});

describe("blood pressure", () => {
  const d = { date: "2026-11-10", updatedAt: u, bp: { m1: { sys: 132, dia: 84, pulse: 70 }, m2: { sys: 128, dia: 80, pulse: null }, e1: { sys: 140, dia: null, pulse: 60 } } };
  it("averages each sitting and ignores incomplete readings", () => {
    const s = bpSummary(d);
    expect(s.morning).toEqual({ sys: 130, dia: 82, pulse: 70 });
    expect(s.evening).toBeNull();
    expect(bpIsHigh(s.morning, { sys: 135, dia: 85 })).toBe(false);
    expect(bpIsHigh({ sys: 120, dia: 86, pulse: null }, { sys: 135, dia: 85 })).toBe(true);
  });
  it("summarises a period and picks the next free slot", () => {
    expect(bpPeriod({ [d.date]: d }, ["2026-11-09", "2026-11-10"])).toEqual({ morning: { sys: 130, dia: 82, pulse: 70 }, evening: null, daysWith: 1 });
    expect(nextBpSlot(d, 8)).toBeNull();
    expect(nextBpSlot(d, 20)).toBe("e2");
    expect(nextBpSlot(undefined, 9)).toBe("m1");
  });
});
