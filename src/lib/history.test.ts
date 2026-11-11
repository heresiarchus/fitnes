import { describe, expect, it } from "vitest";
import { daysWithoutMark, withMark } from "./habits";
import { monthlyWeights, parseHistory } from "./history";

const now = new Date("2026-11-11T10:00:00Z");

describe("history import", () => {
  it("imports weights, prefers the scales on duplicate days, never overwrites", () => {
    const csv = "date,kg,origin\n2024-09-04,122.6,ваги OKOK\n2024-09-04,123.25,власні записи\n2026-11-09,136.8,\"зі слів, увечері\"\n2019-02-04,115.5,власні записи\nbad,1,x\n";
    const existing = { "2019-02-04": { date: "2019-02-04", updatedAt: "x", weight: 116 } };
    const r = parseHistory(csv, existing, now);
    expect(r.kind).toBe("weight");
    expect(r.days.map((d) => [d.date, d.weight, d.weightCond, d.weightOrigin])).toEqual([
      ["2024-09-04", 122.6, "other", "ваги OKOK"], ["2026-11-09", 136.8, "other", "зі слів, увечері"],
    ]);
  });
  it("imports monthly activity and skips months without a tracker", () => {
    const csv = "month,tracker,run_km,walk_km,bike_km,runs\n2021-09,Zepp,3.0,0.0,0.0,1\n2021-10,,,,,\n2022-05,Samsung Health,0.0,30.9,0.0,0\n";
    const r = parseHistory(csv, {}, now);
    expect(r.months.map((m) => [m.id, m.walkKm, m.runKm, m.runs])).toEqual([["hm-2021-09", 0, 3, 1], ["hm-2022-05", 30.9, 0, 0]]);
    expect(() => parseHistory("a,b\n1,2", {}, now)).toThrow();
  });
  it("averages weights per month", () => {
    const days = { a: { date: "2024-06-13", updatedAt: "x", weight: 130 }, b: { date: "2024-06-15", updatedAt: "x", weight: 129 }, c: { date: "2024-07-02", updatedAt: "x", weight: 126.8 }, d: { date: "2024-07-03", updatedAt: "x" } };
    expect(monthlyWeights(days)).toEqual([{ month: "2024-06", kg: 129.5, n: 2 }, { month: "2024-07", kg: 126.8, n: 1 }]);
  });
});

describe("habit marks", () => {
  it("sets, replaces and removes a mark", () => {
    let d = withMark({ date: "2026-11-11", updatedAt: "x" }, "a", { status: "done" }, now);
    d = withMark(d, "b", { status: "rest" }, now);
    d = withMark(d, "a", { status: "min", detail: "одна вправа" }, now);
    expect(d.habitLog).toEqual([{ habitId: "b", status: "rest" }, { habitId: "a", status: "min", detail: "одна вправа" }]);
    expect(withMark(withMark(d, "a", null, now), "b", null, now).habitLog).toBeUndefined();
  });
  it("counts days in a row without a mark", () => {
    const days = { "2026-11-08": { date: "2026-11-08", updatedAt: "x", habitLog: [{ habitId: "a", status: "no" as const }] } };
    expect(daysWithoutMark(days, "a", "2026-11-11", 3)).toBe(2);
    expect(daysWithoutMark({}, "a", "2026-11-11", 3)).toBe(3);
  });
});
