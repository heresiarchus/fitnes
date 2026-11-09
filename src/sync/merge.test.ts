import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../db";
import { decodeBase64, encodeBase64 } from "./github";
import { merge, parseSyncFile, serializeSyncFile } from "./merge";
import type { DayEntry } from "../lib/types";

const d = (date: string, updatedAt: string, extra: Partial<DayEntry> = {}): DayEntry => ({ date, updatedAt, ...extra });

describe("merge", () => {
  it("takes the newer record per day and reports what to write where", () => {
    const local = [d("2026-11-10", "2026-11-10T08:00Z", { steps: 1 }), d("2026-11-11", "2026-11-11T08:00Z", { steps: 2 })];
    const remote = [d("2026-11-10", "2026-11-10T09:00Z", { steps: 10 }), d("2026-11-11", "2026-11-11T07:00Z", { steps: 20 }), d("2026-11-12", "2026-11-12T07:00Z", { steps: 30 })];
    const m = merge(local, remote, null, null);
    expect(m.days.map((x) => x.steps)).toEqual([10, 2, 30]);
    expect(m.toLocal.map((x) => x.date)).toEqual(["2026-11-10", "2026-11-12"]);
    expect(m.remoteChanged).toBe(true);
  });
  it("propagates deletions as tombstones", () => {
    const m = merge([d("2026-11-10", "2026-11-10T09:00Z", { deleted: true })], [d("2026-11-10", "2026-11-10T08:00Z", { steps: 5 })], null, null);
    expect(m.days).toEqual([d("2026-11-10", "2026-11-10T09:00Z", { deleted: true })]);
    expect(m.toLocal).toEqual([]);
    expect(m.remoteChanged).toBe(true);
  });
  it("is a no-op when both sides match", () => {
    const same = [d("2026-11-10", "t1", { steps: 5 })];
    const s = { ...DEFAULT_SETTINGS, updatedAt: "t" };
    const m = merge(same, same, s, s);
    expect(m.remoteChanged).toBe(false);
    expect(m.toLocal).toEqual([]);
    expect(m.settingsToLocal).toBeNull();
  });
  it("merges settings by timestamp", () => {
    const local = { ...DEFAULT_SETTINGS, phase: "1" as const, updatedAt: "2026-11-01" };
    const remote = { ...DEFAULT_SETTINGS, phase: "2" as const, updatedAt: "2026-11-05" };
    expect(merge([], [], local, remote).settingsToLocal?.phase).toBe("2");
    expect(merge([], [], remote, local).remoteChanged).toBe(true);
  });
});

describe("sync file", () => {
  it("serialises one day per line and parses back", () => {
    const days = [d("2026-11-10", "t", { note: "привіт" }), d("2026-11-11", "t", { deleted: true })];
    const text = serializeSyncFile(days, DEFAULT_SETTINGS, new Date("2026-11-11T00:00:00Z"));
    expect(text.split("\n").filter((l) => l.includes('"date"'))).toHaveLength(2);
    const f = parseSyncFile(text);
    expect(f.days).toEqual(days);
    expect(f.settings).toEqual(DEFAULT_SETTINGS);
    expect(parseSyncFile(serializeSyncFile([], null)).days).toEqual([]);
  });
  it("rejects other JSON", () => {
    expect(() => parseSyncFile('{"days":[]}')).toThrow();
  });
  it("base64 round-trips Cyrillic", () => {
    const s = "Вага 136,2 кг — ок ✓";
    expect(decodeBase64(encodeBase64(s))).toBe(s);
  });
});
