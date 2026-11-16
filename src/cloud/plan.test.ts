import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../db";
import { planSync, type Row } from "./plan";

const day = (date: string, updatedAt: string, extra = {}) => ({ date, updatedAt, ...extra });
const row = (kind: Row["kind"], id: string, data: Row["data"]): Row => ({ kind, id, data, updated_at: data.updatedAt, server_at: "s" });

describe("account sync plan", () => {
  it("first sync on a device: takes the server's days, pushes only local ones it lacks", () => {
    const local = { days: [day("2026-11-15", "t5", { steps: 1 }), day("2026-11-16", "t6", { steps: 2 })], items: [], settings: null, secrets: {} };
    const remote = [row("day", "2026-11-15", day("2026-11-15", "t9", { steps: 9 })), row("day", "2026-11-14", day("2026-11-14", "t4"))];
    const p = planSync(local, remote, {});
    expect(p.days.map((d) => d.date)).toEqual(["2026-11-15", "2026-11-14"]);
    expect(p.push.map((r) => r.id)).toEqual(["2026-11-16"]);
    expect(p.synced["day:2026-11-15"]).toBe("t9");
  });
  it("doesn't push back what came from the server, pushes local edits", () => {
    const synced = { "day:2026-11-15": "t9" };
    const unchanged = planSync({ days: [day("2026-11-15", "t9")], items: [], settings: null, secrets: {} }, [], synced);
    expect(unchanged.push).toEqual([]);
    const edited = planSync({ days: [day("2026-11-15", "t10", { feel: 4 })], items: [], settings: null, secrets: {} }, [], synced);
    expect(edited.push.map((r) => [r.id, r.updated_at])).toEqual([["2026-11-15", "t10"]]);
  });
  it("carries settings, items, tombstones and connections", () => {
    const settings = { ...DEFAULT_SETTINGS, palette: "gold" as const, updatedAt: "t2" };
    const p = planSync(
      { days: [day("2026-11-01", "t3", { deleted: true })], items: [{ id: "task-1", kind: "task", title: "ЕКГ", updatedAt: "t1" }], settings: { ...DEFAULT_SETTINGS, updatedAt: "t1" }, secrets: {} },
      [row("settings", "main", settings), row("secret", "sheets", { url: "https://script.google.com/macros/s/x/exec", updatedAt: "t1" })],
      {},
    );
    expect(p.settings?.palette).toBe("gold");
    expect(p.secrets.sheets.url).toContain("script.google.com");
    expect(p.push.map((r) => `${r.kind}:${r.id}`)).toEqual(["day:2026-11-01", "item:task-1"]);
  });
});
