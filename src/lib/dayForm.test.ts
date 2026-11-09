import { describe, expect, it } from "vitest";
import { fromFormState, toFormState } from "./dayForm";
import type { DayEntry } from "./types";

const now = new Date("2026-11-10T08:00:00Z");

describe("day form conversion", () => {
  it("returns null for an empty form", () => {
    expect(fromFormState("2026-11-10", toFormState(undefined, "light"), now)).toBeNull();
  });

  it("parses comma decimals, defaults sets and clamps pain", () => {
    const f = toFormState(undefined, "light");
    f.weight = "136,2";
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
