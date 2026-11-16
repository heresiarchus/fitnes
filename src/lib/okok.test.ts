import { describe, expect, it } from "vitest";
import { ChipseaStream, decodeKg, parseScale, Settler, userSyncFrame } from "./okok";

function v20(weightRaw: number, flags: number) {
  const d = new Uint8Array(19);
  d[6] = flags; d[8] = weightRaw >> 8; d[9] = weightRaw & 0xff; d[10] = 0x12; d[11] = 0x34;
  let x = 0x20; for (let i = 0; i < 12; i++) x ^= d[i]; d[12] = x;
  return d;
}

describe("broadcast frames", () => {
  it("keeps hundredths (scales that step by 0.05)", () => {
    expect(parseScale({ 0x20ca: v20(13545, 0x05) })).toEqual({ kg: 135.45, final: true, variant: "V20" });
    const bad = v20(13545, 0x05); bad[12] ^= 0xff;
    expect(parseScale({ 0x20ca: bad })).toBeNull();
  });
  it("reads C0 with resolution and units", () => {
    const c0 = new Uint8Array(13); c0[0] = 0x34; c0[1] = 0xe9; c0[6] = 0x05; // 13545, 2 decimals, kg, stable
    expect(parseScale({ 0x12c0: c0 })).toEqual({ kg: 135.45, final: true, variant: "C0" });
    expect(decodeKg(0x0b, 0x38, 0x10)).toBeCloseTo(130.27, 2); // 287.2 lb
  });
  it("ignores unknown companies", () => {
    expect(parseScale({ 0x004c: new Uint8Array(10) })).toBeNull();
  });
});

describe("Chipsea-BLE connected scale", () => {
  it("reads live and locked single frames", () => {
    const s = new ChipseaStream();
    expect(s.feed(new Uint8Array([0xca, 0x10, 14, 1, 0x04, 0x34, 0xe9]))).toEqual({ kg: 135.45, final: false, variant: "GATT" });
    expect(s.feed(new Uint8Array([0xca, 0x10, 14, 1, 0x05, 0x34, 0xe9]))!.final).toBe(true);
  });
  it("reads v1.1 weight frames (subtype = lock flag)", () => {
    const s = new ChipseaStream();
    const f = new Uint8Array(12); f.set([0xca, 0x11, 10, 1, 0, 0x34, 0xee]); f[11] = 0x04;
    expect(s.feed(f)).toEqual({ kg: 135.5, final: true, variant: "GATT" });
  });
  it("reassembles multi-packet live frames", () => {
    const s = new ChipseaStream();
    const payload = new Uint8Array(23); payload[4] = 0x05; payload[10] = 0x34; payload[11] = 0xe9;
    const a = new Uint8Array([0xca, 0x11, 12 + 2, 18, 0x12, ...payload.slice(0, 12)]);
    const b = new Uint8Array([0xca, 0x11, 11 + 2, 18, 0x22, ...payload.slice(12)]);
    expect(s.feed(a)).toBeNull();
    expect(s.feed(b)).toEqual({ kg: 135.45, final: true, variant: "GATT" });
  });
  it("builds the user/time frame with its checksum", () => {
    const f = userSyncFrame(new Date(2026, 10, 16, 8, 30, 5));
    expect([...f.slice(0, 10)]).toEqual([0xca, 0x10, 14, 1, 26, 11, 16, 8, 30, 5]);
    let x = 0; for (let i = 1; i <= 16; i++) x ^= f[i];
    expect(f[17]).toBe(x);
  });
});

describe("settling", () => {
  it("waits while the number jumps, then fixes the steady value", () => {
    const s = new Settler();
    const r = (kg: number) => ({ kg, final: false, variant: "VF0" as const });
    let t = 0;
    for (const kg of [135.5, 135.2, 135.7, 135.4]) expect(s.push(r(kg), (t += 300))).toBeNull();
    expect(s.push(r(135.4), (t += 600))).toBeNull();
    expect(s.push(r(135.4), (t += 600))).toBeNull(); // 3 frames but only 1.2 s
    expect(s.push(r(135.4), (t += 600))).toBe(135.4);
  });
  it("takes a frame the scale marks as settled immediately", () => {
    expect(new Settler().push({ kg: 135.45, final: true, variant: "GATT" })).toBe(135.45);
    expect(new Settler().push({ kg: 3, final: true, variant: "GATT" })).toBeNull();
  });
});
