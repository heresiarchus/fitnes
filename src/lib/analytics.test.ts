import { describe, expect, it } from "vitest";
import { bmi, bmiClass, bpClass, bpWeek, byWeekday, change, datesBetween, diffMeans, dropSignal, forecast, group, record, rolling, series, sleepView, slope, spearman, stepZones, streaks, trendLine, weightView } from "./analytics";
import type { DaysMap } from "./types";

const d = (date: string, x: object) => ({ date, updatedAt: "", ...x });
const range = datesBetween("2026-11-02", "2026-11-15"); // Mon … Sun, two weeks

describe("series and basics", () => {
  it("keeps missing days as null and adds walking and cardio minutes", () => {
    const days: DaysMap = { "2026-11-02": d("2026-11-02", { walkMin: 20, cardioMin: 10 }), "2026-11-04": d("2026-11-04", { steps: 5000 }) };
    expect(series(days, "active", range.slice(0, 3))).toEqual([30, null, null]);
    expect(series(days, "steps", range.slice(0, 3))).toEqual([null, null, 5000]);
  });
  it("finds a slope per day and a rolling mean", () => {
    expect(slope([1, 2, null, 4, 5])!.perDay).toBeCloseTo(1);
    expect(rolling([1, 2, 3, null, 5], 3)).toEqual([null, null, 2, null, null]);
    expect(change(110, 100)).toBeCloseTo(10);
  });
  it("smooths weight and carries the trend over gaps", () => {
    expect(trendLine([100, null, 110], 0.5)).toEqual([100, 100, 105]);
  });
});

describe("streaks and records", () => {
  const dates = datesBetween("2026-11-10", "2026-11-16");
  const v = [8000, 9000, 3000, 7000, 7100, 7200, null];
  it("counts the current streak up to yesterday while today is open", () => {
    const s = streaks(dates, v, (x) => x >= 7000, "2026-11-16");
    expect(s.current).toBe(3);
    expect(s.longest).toEqual({ length: 3, start: "2026-11-13", end: "2026-11-15" });
  });
  it("finds the best day", () => expect(record(dates, v)).toEqual({ v: 9000, date: "2026-11-11" }));
});

describe("grouping", () => {
  it("splits by weekday and averages weeks per day", () => {
    const v = range.map((_, i) => (i % 7 === 0 ? 10 : 0));
    expect(byWeekday(range, v)[0]).toBe(10);
    const weeks = group(range, v, "week", "sum");
    expect(weeks.map((w) => w.key)).toEqual(["2026-11-02", "2026-11-09"]);
    expect(weeks[0].v).toBeCloseTo(10 / 7);
  });
});

describe("links", () => {
  it("needs enough days and reports a clear monotonic link", () => {
    const a = Array.from({ length: 30 }, (_, i) => i);
    const b = a.map((x) => x * 2 + (x % 3));
    expect(spearman(a.slice(0, 10), b.slice(0, 10))).toBeNull();
    const r = spearman(a, b)!;
    expect(r.rho).toBeGreaterThan(0.9);
    expect(r.sure).toBe(true);
  });
  it("only calls a difference when the interval excludes zero", () => {
    expect(diffMeans([7, 7.5, 8, 7.2, 7.8, 7.6], [6, 6.2, 5.8, 6.1, 6.3, 5.9])!.sure).toBe(true);
    expect(diffMeans([7, 5, 9, 6, 8, 7], [7, 6, 8, 5, 9, 7])!.sure).toBe(false);
  });
});

describe("steps", () => {
  it("shares days by zone and spots a 20% drop", () => {
    expect(stepZones([4000, 6000, 8000, 12000])).toEqual([0.25, 0.25, 0.25, 0.25]);
    const v = [...Array(28).fill(8000), ...Array(7).fill(5000)];
    expect(dropSignal(v)!.pct).toBeCloseTo(-37.5);
    expect(dropSignal(Array(35).fill(8000))).toBeNull();
  });
});

describe("weight", () => {
  it("measures the pace and a plateau", () => {
    const down = Array.from({ length: 40 }, (_, i) => 136 - i * 0.1);
    const w = weightView(down);
    expect(w.kgWeek28!).toBeLessThan(-0.3);
    expect(w.plateau).toBe(false);
    expect(weightView(Array(40).fill(130)).plateau).toBe(true);
  });
  it("forecasts the target date from the pace", () => {
    const down = Array.from({ length: 60 }, (_, i) => 136 - i * 0.1);
    const f = forecast(down, 120, new Date(2026, 10, 16))!;
    expect(f.date > "2026-11-16").toBe(true);
    expect(f.early <= f.date && f.date <= f.late).toBe(true);
    expect(forecast(Array(40).fill(130), 120)).toBeNull();
  });
  it("computes BMI classes", () => {
    expect(bmi(135, 180)).toBeCloseTo(41.7, 1);
    expect(bmiClass(41.7)).toBe("ob3");
    expect(bmiClass(22)).toBe("normal");
  });
});

describe("sleep and pressure", () => {
  it("measures bedtime spread, weekend shift and sleep debt", () => {
    const days: DaysMap = {};
    range.forEach((date, i) => {
      const weekend = i % 7 >= 5;
      days[date] = d(date, { sleepStart: weekend ? "01:00" : "23:00", sleepEnd: weekend ? "08:00" : "06:00", sleepMin: 420 - (i === 13 ? 120 : 0) });
    });
    const s = sleepView(days, range);
    expect(s.jetlagMin).toBe(105); // mid-sleep 2 h later at weekends, one short Sunday night pulls it back 15 min
    expect(s.debt7).toBe(2);
    expect(s.bedSd).toBeGreaterThan(0);
  });
  it("averages the home week without its first day and classifies by ESC 2024", () => {
    const days: DaysMap = {};
    datesBetween("2026-11-09", "2026-11-15").forEach((date, i) => {
      days[date] = d(date, { bp: { m1: { sys: i === 0 ? 180 : 130, dia: 80, pulse: 70 } } });
    });
    const w = bpWeek(days, "2026-11-15");
    expect(w.morning).toEqual({ sys: 130, dia: 80, n: 6 });
    expect(bpClass(130, 80)).toBe("elevated");
    expect(bpClass(118, 68)).toBe("ok");
    expect(bpClass(142, 85)).toBe("high");
  });
});
