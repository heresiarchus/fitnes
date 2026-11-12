import { describe, expect, it } from "vitest";
import { parseScale, Settler } from "./okok";

function v20(weightRaw: number, flags: number) {
  const d = new Uint8Array(19);
  d[6] = flags; d[8] = weightRaw >> 8; d[9] = weightRaw & 0xff; d[10] = 0x12; d[11] = 0x34;
  let x = 0x20; for (let i = 0; i < 12; i++) x ^= d[i]; d[12] = x;
  return d;
}

describe("OKOK scale frames", () => {
  it("reads a final V20 frame and rejects a bad checksum", () => {
    expect(parseScale({ 0x20ca: v20(13045, 0x05) })).toEqual({ kg: 130.45, final: true, variant: "V20" });
    const bad = v20(1304, 0x01); bad[12] ^= 0xff;
    expect(parseScale({ 0x20ca: bad })).toBeNull();
  });
  it("reads the C0 layout with resolution and units", () => {
    const c0 = new Uint8Array(13); c0[0] = 0x05; c0[1] = 0x18; c0[6] = 0x01; // 1304 / 10, kg, stable
    expect(parseScale({ 0x12c0: c0 })).toEqual({ kg: 130.4, final: true, variant: "C0" });
    const lb = new Uint8Array(13); lb[0] = 0x0b; lb[1] = 0x38; lb[6] = 0x10; // 2872/10 lb, not stable
    expect(parseScale({ 0x00c0: lb })!.kg).toBeCloseTo(130.27, 1);
  });
  it("reads VF0 and ignores unknown companies", () => {
    const f = new Uint8Array([0, 0, 0x18, 0x05]);
    expect(parseScale({ 0xf0ff: f })).toEqual({ kg: 130.4, final: false, variant: "VF0" });
    expect(parseScale({ 0x004c: new Uint8Array(10) })).toBeNull();
  });
  it("waits for a final frame or three equal readings", () => {
    const s = new Settler();
    expect(s.push({ kg: 12, final: false, variant: "VF0" })).toBeNull();
    expect(s.push({ kg: 130.4, final: false, variant: "VF0" })).toBeNull();
    expect(s.push({ kg: 130.41, final: false, variant: "VF0" })).toBeNull();
    expect(s.push({ kg: 130.4, final: false, variant: "VF0" })).toBe(130.4);
    expect(new Settler().push({ kg: 129.9, final: true, variant: "V20" })).toBe(129.9);
  });
});
