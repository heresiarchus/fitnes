/**
 * Weight from OKOK International / Chipsea Bluetooth scales.
 *
 * The OKOK app works with two kinds of Chipsea scales (both documented by the
 * open-source openScale project, OkOkHandler and ChipseaBleLib):
 *
 * 1. Broadcast scales: the reading sits in the manufacturer data of the Bluetooth
 *    advertisement, anyone can listen. Four layouts:
 *    V20 (company 0x20CA, 19 bytes): flags[6] bit0 = final, bit2 = 0.01 kg resolution;
 *        weight = u16be[8..9]; XOR checksum over [0..11] seeded with 0x20 at [12].
 *    V11 (company 0x11CA, 23 bytes): weight = u16be[3..4]; properties[9];
 *        XOR checksum over [0..15] seeded with 0xCA^0x11 at [16].
 *    VF0 (company 0xF0FF): weight = u16be(msb [3], lsb [2]) / 10.
 *    C0  (company id with low byte 0xC0, ≥13 bytes): weight = u16be[0..1]; attributes[6].
 *
 * 2. "Chipsea-BLE" scales: the phone connects (service 0xFFF0), subscribes to 0xFFF1
 *    and writes a user/time frame to 0xFFF2; the scale then streams frames starting
 *    with 0xCA while the number settles and ends with a locked frame.
 *
 * Property / attribute byte: bit0 = settled, bits1–2 = decimals (01 → 0, 10 → 2, else 1),
 * bits3–4 = unit (00 kg, 01 jin, 10 lb, 11 stone). Weights keep their full resolution
 * (e.g. 135.45 kg on scales that step by 0.05).
 *
 * Body fat, muscle and bone are formula estimates from impedance; this app keeps only weight.
 */

export type ScaleFrame = Record<number, Uint8Array>;
export interface ScaleReading { kg: number; final: boolean; variant: "V20" | "V11" | "VF0" | "C0" | "GATT" }

const u16 = (msb: number, lsb: number) => ((msb & 0xff) << 8) | (lsb & 0xff);
const LB = 0.45359237;
/** Kilograms to two decimals, avoiding float noise like 135.45000000001. */
export const roundKg = (kg: number) => Math.round(kg * 100) / 100;

/** Decodes a weight using a Chipsea property byte (decimals and unit). */
export function decodeKg(hi: number, lo: number, prop: number): number {
  const unit = (prop >> 3) & 3;
  if (unit === 3) return roundKg(((hi & 0xff) * 14 + (lo & 0xff) / 10) * LB); // stone + pounds
  const digits = [1, 0, 2, 1][(prop >> 1) & 3];
  const v = u16(hi, lo) / 10 ** digits;
  return roundKg(unit === 1 ? v / 2 : unit === 2 ? v * LB : v);
}

/** Names OKOK-compatible scales advertise under (empty names are allowed for the C0 layout). */
export const isScaleName = (name: string | undefined) =>
  !name || name === "ADV" || /chipsea/i.test(name) || /^Yoda[01]/i.test(name) || /okok/i.test(name);

/** A scale that needs a connection rather than broadcasting. */
export const isGattScale = (name: string | undefined, uuids: string[] = []) =>
  /chipsea/i.test(name ?? "") || (uuids.some((u) => /^0000fff0/i.test(u)) && isScaleName(name));

/** Parses one advertisement; null if it is not a recognised scale frame. */
export function parseScale(frame: ScaleFrame): ScaleReading | null {
  const v20 = frame[0x20ca];
  if (v20 && v20.length === 19) {
    let x = 0x20;
    for (let i = 0; i < 12; i++) x ^= v20[i];
    if ((x & 0xff) === v20[12]) {
      const div = v20[6] & 0x04 ? 100 : 10;
      return { kg: roundKg(u16(v20[8], v20[9]) / div), final: (v20[6] & 0x01) !== 0, variant: "V20" };
    }
  }
  const v11 = frame[0x11ca];
  if (v11 && v11.length === 23) {
    let x = 0xca ^ 0x11;
    for (let i = 0; i < 16; i++) x ^= v11[i];
    if ((x & 0xff) === v11[16]) return { kg: decodeKg(v11[3], v11[4], v11[9]), final: false, variant: "V11" };
  }
  const vf0 = frame[0xf0ff];
  if (vf0 && vf0.length >= 4) return { kg: roundKg(u16(vf0[3], vf0[2]) / 10), final: false, variant: "VF0" };
  const c0key = Object.keys(frame).map(Number).find((k) => (k & 0xff) === 0xc0);
  const c0 = c0key != null ? frame[c0key] : undefined;
  if (c0 && c0.length >= 13) return { kg: decodeKg(c0[0], c0[1], c0[6]), final: (c0[6] & 0x01) !== 0, variant: "C0" };
  return null;
}

/** Frames from a connected "Chipsea-BLE" scale (notifications on 0xFFF1). */
export class ChipseaStream {
  private chunks = new Map<number, Uint8Array>();

  feed(f: Uint8Array): ScaleReading | null {
    if (f.length < 4 || f[0] !== 0xca) return null;
    if (f[1] === 0x10) {
      if (f.length < 7) return null;
      return { kg: decodeKg(f[5], f[6], f[4]), final: (f[4] & 1) !== 0, variant: "GATT" };
    }
    if (f[1] !== 0x11) return null;
    const sub = f[3];
    if (sub === 0 || sub === 1) {
      if (f.length < 12) return null;
      return { kg: decodeKg(f[5], f[6], f[11]), final: sub === 1, variant: "GATT" };
    }
    if (sub === 18) {
      const len = f[2] - 2, index = f[4] >> 4, total = f[4] & 0x0f;
      if (len < 0 || f.length < 5 + len || !total || !index || index > total) return null;
      if (index === 1) this.chunks.clear();
      this.chunks.set(index, f.slice(5, 5 + len));
      if (index !== total) return null;
      const parts: Uint8Array[] = [];
      for (let i = 1; i <= total; i++) { const c = this.chunks.get(i); if (!c) { this.chunks.clear(); return null; } parts.push(c); }
      this.chunks.clear();
      const p = new Uint8Array(parts.reduce((a, b) => a + b.length, 0));
      let o = 0; for (const c of parts) { p.set(c, o); o += c.length; }
      if (p.length < 12) return null;
      return { kg: decodeKg(p[10], p[11], p[4]), final: (p[4] & 1) !== 0, variant: "GATT" };
    }
    return null;
  }
}

/**
 * The user/time frame the OKOK app writes on connect (20 bytes, XOR over [1..16] at [17]).
 * The scale waits for it before measuring; body values are not used by this app,
 * so neutral profile values are sent.
 */
export function userSyncFrame(now: Date): Uint8Array {
  const f = new Uint8Array(20);
  f.set([0xca, 0x10, 14, 1, now.getFullYear() % 100, now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds(), 0, 0, 0, 1, 1, 35, 175]);
  let x = 0;
  for (let i = 1; i <= 16; i++) x ^= f[i];
  f[17] = x;
  return f;
}

/**
 * Decides when a weighing is finished, like the scale's own display: a frame the scale
 * marks as settled, or — for layouts without that flag — the same value (to 0.01 kg)
 * for at least three frames over 1.5 seconds. Values outside 20–300 kg are stepping on/off.
 */
export class Settler {
  private value: number | null = null;
  private since = 0;
  private count = 0;
  push(r: ScaleReading, now = Date.now()): number | null {
    const kg = roundKg(r.kg);
    if (kg < 20 || kg > 300) { this.value = null; return null; }
    if (r.final) return kg;
    if (this.value !== kg) { this.value = kg; this.since = now; this.count = 1; return null; }
    this.count += 1;
    return this.count >= 3 && now - this.since >= 1500 ? kg : null;
  }
}
