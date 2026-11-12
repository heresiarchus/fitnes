import { describe, expect, it } from "vitest";
import { makeBackup, parseBackup } from "./backup";
import { daysToCsv } from "./csv";
import { buildReport } from "./report";
import { makeT } from "../i18n";
import type { DayEntry } from "./types";

const legacy = {
  date: "2026-11-10", weight: 136.2, weightCond: "ранок", steps: 5000, walkMin: 15, walkIntensity: "помірна",
  strength: [{ id: "chair", name: "Вставання зі стільця", sets: 1, reps: 15 }, { name: "Планка", reps: 3 }, { id: "bogus", reps: 5 }],
  bp: { m1: { sys: 130, dia: 85, pulse: null } }, pain: { foot: 2 }, flags: ["foot", "nope"], updatedAt: "2026-11-10T08:00:00Z",
};

describe("backup import", () => {
  it("maps the earlier page format", () => {
    const { days } = parseBackup(JSON.stringify([legacy]));
    expect(days[0]).toEqual({
      date: "2026-11-10", updatedAt: "2026-11-10T08:00:00Z", weight: 136.2, weightCond: "morning", steps: 5000,
      walkMin: 15, walkIntensity: "moderate",
      strength: [{ id: "chair", sets: 1, reps: 15 }, { name: "Планка", sets: 1, reps: 3 }],
      bp: { m1: { sys: 130, dia: 85, pulse: null } }, pain: { foot: 2 }, flags: ["foot"],
    });
  });
  it("accepts a date-keyed map", () => {
    const { days } = parseBackup(JSON.stringify({ "2026-11-12": { steps: 100 }, junk: 1 }));
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe("2026-11-12");
  });
  it("round-trips its own backup", () => {
    const d: DayEntry = { date: "2026-11-11", updatedAt: "x", steps: 1, note: "a", feel: 4, positive: "ok", dayType: "duty", partnerHere: false, sleepMin: 400, habitLog: [{ habitId: "a", status: "min" }] };
    const settings = { phase: "2" as const, startDate: "2026-11-10", stepGoal: 6000, lang: "uk" as const, theme: "auto" as const, updatedAt: "t", sources: { steps: true, exercise: false, weight: false, bp: true, sleep: true }, bpMark: { sys: 135, dia: 85 }, reminders: { weigh: { on: true, time: "08:00" }, evening: { on: false, time: "21:00" }, bp: { on: false, time: "20:00" }, review: { on: true, time: "22:20" } }, habits: [], hideWeight: false, healthLinked: true, remindersV: 2 };
    const parsed = parseBackup(JSON.stringify(makeBackup([d], settings)));
    expect(parsed.days).toEqual([d]);
    expect(parsed.settings).toEqual(settings);
  });
  it("rejects files without records", () => {
    expect(() => parseBackup("{}")).toThrow();
    expect(() => parseBackup("not json")).toThrow();
  });
});

describe("exports", () => {
  const { days } = parseBackup(JSON.stringify([legacy]));
  it("builds CSV with BOM and quoting", () => {
    const csv = daysToCsv([{ ...days[0], note: 'say "hi", ok' }], makeT("uk"));
    expect(csv.startsWith("﻿date,weight")).toBe(true);
    expect(csv).toContain("Вставання зі стільця 1x15; Планка 1x3");
    expect(csv).toContain('"say ""hi"", ok"');
  });
  it("builds a text report in both languages", () => {
    const map = { [days[0].date]: days[0] };
    const dates = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];
    const prev = dates.map((x) => x.replace("2026-11-1", "2026-11-0"));
    const ukR = buildReport(map, dates, prev, "1", makeT("uk"), "uk");
    expect(ukR).toContain("Журнал руху й ваги, 09.11–15.11 (фаза 1)");
    expect(ukR).toContain("Вага ранкова, середня: 136,2 кг (1 замірів)");
    expect(ukR).toContain("Сигнали: 10.11 стопа гірше");
    const enR = buildReport(map, dates, prev, "1", makeT("en"), "en");
    expect(enR).toContain("Morning weight, average: 136.2 kg");
    expect(enR).toContain("Sit-to-stand 1×15");
  });
});
