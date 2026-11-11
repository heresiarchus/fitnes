import { describe, expect, it } from "vitest";
import { mapHealth } from "./healthMap";
import { applySamsung } from "./samsung";

const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

describe("Health Connect mapping", () => {
  const data = mapHealth({
    steps: [{ startDate: at(2026, 11, 11, 0), value: 6412.4 }, { startDate: at(2026, 11, 12, 0), value: 0 }],
    workouts: [
      { workoutType: "walking", duration: 1260, startDate: at(2026, 11, 11, 8) },
      { workoutType: "walking", duration: 900, startDate: at(2026, 11, 11, 19) },
      { workoutType: "bikingStationary", duration: 1800, startDate: at(2026, 11, 11, 20) },
      { workoutType: "traditionalStrengthTraining", duration: 1200, startDate: at(2026, 11, 11, 21) },
    ],
    weight: [{ value: 136.24, startDate: at(2026, 11, 11, 7, 30), endDate: at(2026, 11, 11, 7, 30) }],
    bp: [{ value: 0, systolic: 131.6, diastolic: 84.2, startDate: at(2026, 11, 11, 20, 5), endDate: at(2026, 11, 11, 20, 5) }],
    sleep: [
      { value: 400, startDate: at(2026, 11, 10, 23, 40), endDate: at(2026, 11, 11, 6, 50) },
      { value: 20, sleepState: "awake", startDate: at(2026, 11, 11, 3, 0), endDate: at(2026, 11, 11, 3, 20) },
    ],
    restingHr: [{ value: 61.7, startDate: at(2026, 11, 11, 0), endDate: at(2026, 11, 11, 0) }],
  });

  it("puts readings on the local day and keeps walking apart from cardio", () => {
    expect(data.steps).toEqual({ "2026-11-11": 6412 });
    expect(data.exercise).toEqual([
      { date: "2026-11-11", minutes: 21, walk: true, cardio: undefined },
      { date: "2026-11-11", minutes: 15, walk: true, cardio: undefined },
      { date: "2026-11-11", minutes: 30, walk: false, cardio: "bike" },
    ]);
    expect(data.sleep).toEqual({ "2026-11-11": { minutes: 400, start: "23:40", end: "06:50" } });
    expect(data.restingHr).toEqual({ "2026-11-11": 62 });
  });

  it("updates a day through the shared apply step, honouring source switches", () => {
    const all = { steps: true, exercise: true, weight: true, bp: true, sleep: true };
    const r = applySamsung({}, data, all, (k) => k, new Date(at(2026, 11, 11, 22)));
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({
      date: "2026-11-11", steps: 6412, walkMin: 36, cardioMin: 30, cardioWhat: "bike", weight: 136.2, weightCond: "morning",
      bp: { e1: { sys: 132, dia: 84, pulse: null } }, sleepMin: 400, sleepStart: "23:40", sleepEnd: "06:50", restingHr: 62,
    });
    const manual = applySamsung({}, data, { ...all, weight: false, bp: false, sleep: false }, (k) => k).changes[0];
    expect(manual.weight).toBeUndefined();
    expect(manual.sleepMin).toBeUndefined();
    // A second pull of the same data changes nothing.
    expect(applySamsung({ "2026-11-11": r.changes[0] }, data, all, (k) => k).changes).toEqual([]);
  });
});
