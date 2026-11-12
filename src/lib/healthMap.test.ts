import { describe, expect, it } from "vitest";
import { dayRanges, mapHealth, sleepByDay, workoutItem } from "./healthMap";
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
    expect(data.sleep).toEqual({ "2026-11-11": { minutes: 400, start: "23:40", end: "06:50", napMin: 0 } });
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

describe("calendar day ranges for step totals", () => {
  it("runs from local midnight to midnight, the last day ending now", () => {
    const now = new Date(2026, 10, 12, 9, 37);
    const r = dayRanges(now, 3);
    expect(r.map((x) => x.date)).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(r[0].start).toEqual(new Date(2026, 10, 10, 0, 0));
    expect(r[1].end).toEqual(new Date(2026, 10, 12, 0, 0));
    expect(r[2].end).toEqual(now);
    // Each day is labelled by its own date, never by the previous one.
    for (const x of r) expect(x.start.getHours()).toBe(0);
  });
  it("keeps whole days across a month boundary", () => {
    const r = dayRanges(new Date(2026, 11, 1, 12, 0), 2);
    expect(r.map((x) => x.date)).toEqual(["2026-11-30", "2026-12-01"]);
  });
});

describe("night sleep apart from naps", () => {
  const ses = (s: string, e: string, m: number) => ({ value: m, startDate: new Date(s).toISOString(), endDate: new Date(e).toISOString() });
  it("takes the longest night session and counts a daytime nap separately", () => {
    const r = sleepByDay([
      ses("2025-11-15T04:10", "2025-11-15T10:40", 380),
      ses("2025-11-15T19:16", "2025-11-15T20:31", 75),
    ]);
    expect(r["2025-11-15"]).toEqual({ minutes: 380, start: "04:10", end: "10:40", napMin: 75 });
  });
  it("joins pieces of one night split by short wake-ups", () => {
    const r = sleepByDay([
      ses("2025-11-13T23:40", "2025-11-14T02:00", 140),
      ses("2025-11-14T02:20", "2025-11-14T07:00", 280),
      { value: 20, sleepState: "awake", startDate: new Date("2025-11-14T02:00").toISOString(), endDate: new Date("2025-11-14T02:20").toISOString() },
    ]);
    expect(r["2025-11-14"]).toEqual({ minutes: 420, start: "23:40", end: "07:00", napMin: 0 });
  });
});

describe("workout records", () => {
  it("keeps type, times, distance and pulse", () => {
    const w = workoutItem({ workoutType: "walking", duration: 1500, startDate: new Date(2026, 10, 12, 18, 5).toISOString(), endDate: new Date(2026, 10, 12, 18, 30).toISOString(), totalDistance: 2140, platformId: "abc", sourceName: "com.sec.android.app.shealth" }, [95, 110, 102, 0], new Date(0));
    expect(w).toMatchObject({ id: "wo-abc", kind: "workout", date: "2026-11-12", type: "walking", start: "18:05", end: "18:30", durationMin: 25, distanceKm: 2.14, avgHr: 102, maxHr: 110 });
  });
});
