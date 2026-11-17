import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../db";
import { datesBetween } from "./analytics";
import { weeklySummary } from "./weekly";
import type { DaysMap } from "./types";

const monday = new Date(2026, 10, 16);
const mk = (from: string, to: string, f: (i: number, d: string) => object): DaysMap =>
  Object.fromEntries(datesBetween(from, to).map((d, i) => [d, { date: d, updatedAt: "", ...f(i, d) }]));

describe("Monday summary", () => {
  it("compares last week with the one before and spots a step drop", () => {
    const days = { ...mk("2026-10-05", "2026-11-08", () => ({ steps: 8000 })), ...mk("2026-11-09", "2026-11-15", () => ({ steps: 5000, sleepMin: 300 })) };
    const s = weeklySummary(days, DEFAULT_SETTINGS, monday);
    expect(s.week).toEqual(["2026-11-09", "2026-11-15"]);
    const steps = s.facts.find((f) => f.k === "steps")!;
    expect(steps).toMatchObject({ avg: 5000 });
    expect(s.facts.some((f) => f.k === "sig.stepsDrop")).toBe(true);
    expect(s.facts.some((f) => f.k === "sig.shortSleep")).toBe(true);
  });
  it("suggests a higher step goal after two good weeks", () => {
    const days = mk("2026-10-26", "2026-11-15", () => ({ steps: 9000 }));
    const s = weeklySummary(days, DEFAULT_SETTINGS, monday);
    expect(s.facts.find((f) => f.k === "goalUp")).toMatchObject({ met: 14 });
  });
  it("points out a weight jump with possible causes", () => {
    const days = mk("2026-10-20", "2026-11-15", (_, d) => ({ weight: d === "2026-11-15" ? 132.5 : 131 }));
    const s = weeklySummary(days, DEFAULT_SETTINGS, monday);
    expect(s.facts.find((f) => f.k === "jump")).toMatchObject({ date: "2026-11-15", causes: ["weekend"] });
  });
});
