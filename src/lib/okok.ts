/**
 * Weight from OKOK / Chipsea Bluetooth scales.
 *
 * These scales do not pair: they broadcast the reading in the manufacturer-specific
 * part of their Bluetooth advertisement, so any app can listen. Four layouts are known
 * (byte positions as documented by the open-source openScale project, OkOkHandler):
 *   V20 (company 0x20CA, 19 bytes): flags[6] bit0 = final, bit2 = 0.01 kg resolution;
 *       weight = u16be[8..9]; XOR checksum over [0..11] seeded with 0x20 at [12].
 *   V11 (company 0x11CA, 23 bytes): weight = u16be[3..4]; properties[9] give resolution
 *       and unit; XOR checksum over [0..15] seeded with 0xCA^0x11 at [16].
 *   VF0 (company 0xF0FF): weight = u16be(msb [3], lsb [2]) / 10.
 *   C0  (company id whose low byte is 0xC0, ≥13 bytes): weight = u16be[0..1];
 *       attributes[6] bit0 = stable, resolution and unit as in V11.
 * Some layouts also carry the body's electrical impedance. Body fat, muscle and bone
 * are not measured by the scale — they are estimated from that number with formulas —
 * and this app deliberately keeps only the weight.
 */

export type ScaleFrame = Record<number, Uint8Array>;
export interface ScaleReading { kg: number; final: boolean; variant: "V20" | "V11" | "VF0" | "C0" }

const u16 = (msb: number, lsb: number) => ((msb & 0xff) << 8) | (lsb & 0xff);
const LB = 0.45359237;

function byUnit(raw: number, props: number, msb: number, lsb: number): number | null {
  const div = [10, 1, 100, 10][(props >> 1) & 3];
  switch ((props >> 3) & 3) {
    case 0: return raw / div; // kg
    case 1: return raw / div / 2; // jin
    case 2: return (raw / div) * LB; // lb
    default: return (msb & 0xff) * 6.35029318 + ((lsb & 0xff) / div) * LB; // st:lb
  }
}

/** Names OKOK-compatible scales advertise under (empty names are allowed for the C0 layout). */
export const isScaleName = (name: string | undefined) =>
  !name || name === "ADV" || name === "Chipsea-BLE" || /^Yoda[01]/i.test(name) || /okok/i.test(name);

/** Parses one advertisement; null if it is not a recognised scale frame. */
export function parseScale(frame: ScaleFrame): ScaleReading | null {
  const v20 = frame[0x20ca];
  if (v20 && v20.length === 19) {
    let x = 0x20;
    for (let i = 0; i < 12; i++) x ^= v20[i];
    if ((x & 0xff) === v20[12]) {
      const div = v20[6] & 0x04 ? 100 : 10;
      return { kg: u16(v20[8], v20[9]) / div, final: (v20[6] & 0x01) !== 0, variant: "V20" };
    }
  }
  const v11 = frame[0x11ca];
  if (v11 && v11.length === 23) {
    let x = 0xca ^ 0x11;
    for (let i = 0; i < 16; i++) x ^= v11[i];
    if ((x & 0xff) === v11[16]) {
      const kg = byUnit(u16(v11[3], v11[4]), v11[9], v11[3], v11[4]);
      if (kg != null) return { kg, final: false, variant: "V11" };
    }
  }
  const vf0 = frame[0xf0ff];
  if (vf0 && vf0.length >= 4) return { kg: u16(vf0[3], vf0[2]) / 10, final: false, variant: "VF0" };
  const c0key = Object.keys(frame).map(Number).find((k) => (k & 0xff) === 0xc0);
  const c0 = c0key != null ? frame[c0key] : undefined;
  if (c0 && c0.length >= 13) {
    const attrib = c0[6];
    const kg = byUnit(u16(c0[0], c0[1]), attrib, c0[0], c0[1]);
    if (kg != null) return { kg, final: (attrib & 0x01) !== 0, variant: "C0" };
  }
  return null;
}

/**
 * Decides when a weighing is finished: on a frame marked final, or when the same
 * value (to 0.1 kg) has arrived three times in a row for layouts without that flag.
 */
export class Settler {
  private last: number | null = null;
  private same = 0;
  push(r: ScaleReading): number | null {
    const kg = Math.round(r.kg * 10) / 10;
    if (kg < 20 || kg > 300) return null; // stepping on / off, or noise
    if (r.final) return kg;
    this.same = this.last === kg ? this.same + 1 : 1;
    this.last = kg;
    return this.same >= 3 ? kg : null;
  }
}
