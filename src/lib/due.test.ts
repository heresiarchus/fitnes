import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../db";
import { dueItems, eveningDay } from "./due";
import { activeFromTotal, samsungDay, samsungSteps, type StepRecord } from "./healthMap";

const SH = "com.sec.android.app.shealth";

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
  it("takes the busier device each minute where phone and watch overlap", () => {
    const w = (a: string, b: string, n: number) => ({ ...rec(a, b, n), deviceType: "watch" });
    const ph = (a: string, b: string, n: number) => ({ ...rec(a, b, n), deviceType: "phone" });
    // The phone counted 1 200 over the hour, the watch 900 in its last half hour: 600 + 900, plus 100 later.
    expect(samsungSteps([ph("08:00", "09:00", 1200), w("08:30", "09:00", 900), ph("10:00", "11:00", 100)])).toBe(1600);
  });
  it("does not count records shifted by seconds twice", () => {
    // Watch and phone write the same 30-minute walk minute by minute, the phone 30 s later and a bit lower.
    const at = (min: number, sec: number) => `2026-11-12T10:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}Z`;
    const recs: StepRecord[] = [];
    for (let m = 0; m < 30; m++) {
      recs.push({ startDate: at(m, 0), endDate: at(m + 1, 0), value: 100, sourceName: SH, deviceType: "watch" });
      recs.push({ startDate: at(m, 30), endDate: at(m + 1, 30), value: 90, sourceName: SH, deviceType: "phone" });
    }
    const day = samsungDay(recs)!;
    expect(day.steps).toBeGreaterThanOrEqual(3000);
    expect(day.steps).toBeLessThanOrEqual(3045);
    expect(day.activeMin).toBe(30);
    expect(day.byDevice).toEqual({ watch: 3000, phone: 2700 });
  });
  it("drops exact duplicates and counts active minutes", () => {
    const r = { ...rec("12:00", "12:10", 950), deviceType: "watch" };
    expect(samsungDay([r, { ...r }, { ...rec("13:00", "14:00", 300), deviceType: "watch" }])).toMatchObject({ steps: 1250, activeMin: 10 });
  });
  it("returns null when Samsung Health wrote nothing", () => {
    expect(samsungSteps([rec("08:00", "09:00", 500, "com.google.android.apps.fitness")])).toBeNull();
  });
});

describe("active calories from Samsung's total", () => {
  const day = new Date("2026-11-12T00:00:00Z");
  const kc = (st: string, e: string, v: number) => ({ startDate: `2026-11-12T${st}:00Z`, endDate: `2026-11-12T${e}:00Z`, value: v, sourceName: SH });
  it("subtracts Samsung's BMR for the hours covered", () => {
    // 12 hours recorded, 1 500 kcal in total, BMR 2 400 a day → 1 200 resting, 300 active.
    expect(activeFromTotal([kc("00:00", "12:00", 1500)], 2400, day)).toBe(300);
  });
  it("uses the night's own rate when there is no BMR", () => {
    const night = Array.from({ length: 12 }, (_, i) => kc(`0${1 + Math.floor(i / 3)}:${String((i % 3) * 20).padStart(2, "0")}`, `0${1 + Math.floor((i + 1) / 3)}:${String(((i + 1) % 3) * 20).padStart(2, "0")}`, 30));
    // 90 kcal an hour at night; by 05:00 that's all resting, so nothing active yet.
    expect(activeFromTotal(night, null, day)).toBe(0);
    expect(activeFromTotal([kc("00:00", "23:59", 3000)], null, day)).toBeNull();
  });
});
