import { describe, expect, it } from "vitest";
import { fromFormState, missingRequired, toFormState } from "./dayForm";
import { DEFAULT_HABITS } from "./habits";
import type { DayEntry } from "./types";

const now = new Date("2026-11-10T08:00:00Z");

describe("day form conversion", () => {
  it("returns null for an empty form", () => {
    expect(fromFormState("2026-11-10", toFormState(undefined, "light"), now)).toBeNull();
  });

  it("parses comma decimals, defaults sets and clamps pain", () => {
    const f = toFormState(undefined, "light");
    f.weight = "136,2";
    f.weightChoice = "yes";
    f.ex.chair = { sets: "", reps: "15", kg: "" };
    f.ex.bridge = { sets: "2", reps: "", kg: "5" }; // no reps → skipped
    f.custom = [{ key: 1, name: " Планка ", sets: "1", reps: "3", kg: "" }, { key: 2, name: "", sets: "1", reps: "5", kg: "" }];
    f.pain.back = "14";
    f.flags = ["foot", "chest"];
    const d = fromFormState("2026-11-10", f, now)!;
    expect(d.weight).toBe(136.2);
    expect(d.weightCond).toBe("morning");
    expect(d.strength).toEqual([{ id: "chair", sets: 1, reps: 15 }, { name: "Планка", sets: 1, reps: 3 }]);
    expect(d.pain).toEqual({ back: 10 });
    expect(d.flags).toEqual(["chest", "foot"]);
    expect(d.updatedAt).toBe(now.toISOString());
  });

  it("does not save a weight that was only prefilled", () => {
    const f = toFormState(undefined, "light", 130.5);
    expect(f.weight).toBe("130.5");
    expect(f.weightChoice).toBe("pending");
    expect(missingRequired(f)).toEqual(["weight", "feeling"]);
    f.steps = "100";
    expect(fromFormState("2026-11-11", f, now)?.weight).toBeUndefined();
    f.weightChoice = "yes";
    f.feel = "4";
    f.positive = " прогулявся ";
    expect(missingRequired(f)).toEqual([]);
    const saved = fromFormState("2026-11-11", f, now)!;
    expect(saved.weight).toBe(130.5);
    expect(saved.feel).toBe(4);
    expect(saved.positive).toBe("прогулявся");
    f.weightChoice = "no";
    const skipped = fromFormState("2026-11-11", f, now)!;
    expect(skipped.weight).toBeUndefined();
    expect(skipped.noWeight).toBe(true);
    expect(toFormState(skipped, "light", 130.5).weightChoice).toBe("no");
  });

  it("round-trips an entry", () => {
    const entry: DayEntry = {
      date: "2026-11-11", updatedAt: now.toISOString(), weight: 135.5, weightCond: "other", steps: 8000,
      walkMin: 30, walkIntensity: "moderate", cardioMin: 20, cardioWhat: "басейн",
      strength: [{ id: "press", sets: 2, reps: 12, kg: 7.5 }, { name: "Планка", sets: 1, reps: 3 }],
      bp: { m1: { sys: 130, dia: 85, pulse: 70 } }, pain: { foot: 3 }, flags: ["dizzy"], note: "добре",
    };
    expect(fromFormState(entry.date, toFormState(entry, "light"), now)).toEqual(entry);
  });
});

describe("habits and context in the day form", () => {
  const habits = DEFAULT_HABITS.slice(0, 2);
  const labels = { walk: "ходьба", strength: "силова", min: "хв", auto: "авто" };
  it("saves marks, context and keeps fields the form does not edit", () => {
    const keep: DayEntry = { date: "2026-11-11", updatedAt: "x", bpEpisodes: [{ time: "03:10", sys: 150, dia: 95, pulse: 110 }], habitLog: [{ habitId: "old", status: "done" }] };
    const f = toFormState(keep, "light", null, habits);
    f.habits.eat_before_pc = { status: "no", detail: "", reason: " пізно прийшов ", extra: { what: "інше", atPc: "" }, value: "" };
    f.dayType = "duty"; f.partnerHere = "no"; f.nightEpisode = "yes"; f.episodeNote = "о третій"; f.energyAm = "2"; f.energyPm = "9";
    const d = fromFormState("2026-11-11", f, now, { habits, keep, labels })!;
    expect(d.habitLog).toEqual([{ habitId: "eat_before_pc", status: "no", reasonIfNo: "пізно прийшов", extra: { what: "інше" } }, { habitId: "old", status: "done" }]);
    expect(d).toMatchObject({ dayType: "duty", partnerHere: false, nightEpisode: true, episodeNote: "о третій", energyAm: 2, bpEpisodes: keep.bpEpisodes });
    expect(d.energyPm).toBeUndefined();
    expect(toFormState(d, "light", null, habits).habits.eat_before_pc.reason).toBe("пізно прийшов");
  });
  it("marks the movement habit from a logged walk without asking", () => {
    const f = toFormState(undefined, "light", null, habits);
    f.walk = "20";
    const d = fromFormState("2026-11-11", f, now, { habits, labels })!;
    expect(d.habitLog).toEqual([{ habitId: "move_before_pc", status: "done", detail: "ходьба 20 хв (авто)" }]);
    f.habits.move_before_pc.status = "min";
    expect(fromFormState("2026-11-11", f, now, { habits, labels })!.habitLog![0]).toEqual({ habitId: "move_before_pc", status: "min" });
  });
});

describe("saving the form never erases pulled data", () => {
  it("keeps sleep always and watch metrics when they come from the watch", () => {
    const keep: DayEntry = { date: "2026-11-12", updatedAt: "x", steps: 8000, walkMin: 25, walkIntensity: "light", sleepMin: 410, restingHr: 60, weight: 130.2, weightCond: "morning" };
    const f = toFormState({ ...keep, steps: 100 }, "light");
    f.feel = "3";
    const d = fromFormState("2026-11-12", f, now, { keep, watch: ["steps", "exercise", "weight"] })!;
    expect(d).toMatchObject({ steps: 8000, walkMin: 25, sleepMin: 410, restingHr: 60, weight: 130.2, feel: 3 });
    const manual = fromFormState("2026-11-12", f, now, { keep })!;
    expect(manual.steps).toBe(100);
    expect(manual.sleepMin).toBe(410);
  });
  it("treats a watch weight as answered", () => {
    const f = toFormState(undefined, "light");
    expect(missingRequired(f, true)).toEqual(["feeling"]);
  });
});
