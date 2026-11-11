import { describe, expect, it } from "vitest";
import { DEFAULT_HABITS } from "./habits";
import { buildSheets, isScriptUrl } from "./sheets";
import type { DayEntry, Item } from "./types";

const u = "2026-11-11T10:00:00.000Z";
const days: DayEntry[] = [
  { date: "2026-11-11", updatedAt: u, weight: 136.2, weightCond: "morning", weightTime: "07:40", steps: 5200, feel: 4, positive: "прогулявся",
    partnerHere: false, nightEpisode: true, strength: [{ id: "chair", sets: 1, reps: 15 }, { name: "Планка", sets: 1, reps: 3, kg: 0 }],
    bp: { m1: { sys: 132, dia: 84, pulse: null } }, bpEpisodes: [{ time: "03:10", sys: 150, dia: 95, pulse: 110 }],
    habitLog: [{ habitId: "eat_before_pc", status: "no", reasonIfNo: "пізно", extra: { atPc: "з упаковки" } }] },
  { date: "2026-11-10", updatedAt: u, noWeight: true },
  { date: "2026-11-09", updatedAt: u, deleted: true },
];
const items: Item[] = [
  { id: "d1", kind: "diary", date: "2026-11-11", event: "секрет", share: false, createdAt: u, updatedAt: u },
  { id: "d2", kind: "diary", date: "2026-11-11", event: "можна", feeling: "добре", share: true, createdAt: u, updatedAt: u },
  { id: "t1", kind: "task", title: "Терапевт", dueDate: "2026-11-20", updatedAt: u },
  { id: "t2", kind: "task", title: "x", updatedAt: u, deleted: true },
];

describe("buildSheets", () => {
  const p = buildSheets(days, items, DEFAULT_HABITS, new Date(u));
  it("writes days oldest first, skips deleted, leaves empty cells empty", () => {
    const t = p.sheets["Дні"];
    expect(t.rows.map((r) => r[0])).toEqual(["2026-11-10", "2026-11-11"]);
    const row = Object.fromEntries(t.header.map((h, i) => [h, t.rows[1][i]]));
    expect(row).toMatchObject({ weight: 136.2, weightTime: "07:40", steps: 5200, feel: 4, positive: "", partnerHere: "no", nightEpisode: "yes", walkMin: "", dayType: "" });
    expect(t.rows[0][t.header.indexOf("noWeight")]).toBe("yes");
    expect(t.rows.every((r) => r.length === t.header.length)).toBe(true);
    expect(t.textCols).toContain(1);
  });
  it("splits strength, pressure and habits into their own sheets", () => {
    expect(p.sheets["Силова"].rows).toEqual([["2026-11-11", "chair", 1, 15, ""], ["2026-11-11", "Планка", 1, 3, 0]]);
    expect(p.sheets["Тиск"].rows).toEqual([["2026-11-11", "m1", "", 132, 84, "", ""], ["2026-11-11", "", "03:10", 150, 95, 110, "yes"]]);
    const h = p.sheets["Звички"];
    expect(h.header).toEqual(["date", "habitId", "status", "detail", "reasonIfNo", "kind", "minutes", "what", "atPc"]);
    expect(h.rows).toEqual([["2026-11-11", "eat_before_pc", "no", "", "пізно", "", "", "", "з упаковки"]]);
  });
  it("shares diary text only when allowed, but counts every entry", () => {
    expect(p.sheets["Щоденник"].rows.map((r) => r[2])).toEqual(["можна"]);
    expect(p.sheets["Щоденник-лічильник"].rows).toEqual([["2026-11-11", 2]]);
    expect(JSON.stringify(p)).not.toContain("секрет");
    expect(p.sheets["Справи"].rows).toHaveLength(1);
    expect(JSON.stringify(p)).not.toContain("прогулявся");
    const shared: Item[] = [...items, { id: "dd-2026-11-11", kind: "diary", date: "2026-11-11", event: "прогулявся", share: true, createdAt: u, updatedAt: u }];
    const t = buildSheets(days, shared, DEFAULT_HABITS, new Date(u)).sheets["Дні"];
    expect(t.rows[1][t.header.indexOf("positive")]).toBe("прогулявся");
  });
  it("recognises an Apps Script web-app address", () => {
    expect(isScriptUrl(" https://script.google.com/macros/s/AKfycb_x-1/exec ")).toBe(true);
    expect(isScriptUrl("https://script.google.com/macros/s/AKfycb/dev")).toBe(false);
    expect(isScriptUrl("https://example.com/exec")).toBe(false);
  });
});
