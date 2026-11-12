import { BleClient, type ScanResult } from "@capacitor-community/bluetooth-le";
import { isScaleName, parseScale, type ScaleFrame, type ScaleReading, Settler } from "./lib/okok";
import { isNative } from "./native";

export interface NearbyDevice { id: string; name: string; rssi?: number; companies: string[]; reading?: ScaleReading }

let ready = false;
async function init() {
  if (ready) return;
  await BleClient.initialize({ androidNeverForLocation: true });
  ready = true;
}

const frameOf = (r: ScanResult): ScaleFrame => {
  const f: ScaleFrame = {};
  for (const [k, v] of Object.entries(r.manufacturerData ?? {})) f[Number(k)] = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  return f;
};

/**
 * Listens for the scale's broadcast until a settled weight arrives (or the time runs out).
 * `onLive` gets every reading so the screen can show the number while it settles.
 */
export async function weighOnScale(onLive: (kg: number) => void, timeoutMs = 60000): Promise<number | null> {
  if (!isNative) return null;
  await init();
  const settler = new Settler();
  return new Promise<number | null>((resolve) => {
    let done = false;
    const finish = (v: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      void BleClient.stopLEScan().catch(() => {});
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    void BleClient.requestLEScan({ allowDuplicates: true }, (r) => {
      if (!isScaleName(r.localName ?? r.device.name)) return;
      const reading = parseScale(frameOf(r));
      if (!reading) return;
      onLive(Math.round(reading.kg * 10) / 10);
      const kg = settler.push(reading);
      if (kg != null) finish(kg);
    }).catch(() => finish(null));
  });
}

export function stopScale() {
  void BleClient.stopLEScan().catch(() => {});
}

/** Everything advertising nearby for a few seconds — to see whether the scale is found at all. */
export async function scanNearby(ms = 12000): Promise<NearbyDevice[]> {
  if (!isNative) return [];
  await init();
  const seen = new Map<string, NearbyDevice>();
  await BleClient.requestLEScan({ allowDuplicates: true }, (r) => {
    const frame = frameOf(r);
    const companies = Object.keys(frame).map((k) => "0x" + Number(k).toString(16).padStart(4, "0"));
    const reading = parseScale(frame) ?? seen.get(r.device.deviceId)?.reading;
    seen.set(r.device.deviceId, { id: r.device.deviceId, name: r.localName ?? r.device.name ?? "", rssi: r.rssi, companies, reading: reading ?? undefined });
  });
  await new Promise((r) => setTimeout(r, ms));
  await BleClient.stopLEScan().catch(() => {});
  return [...seen.values()].sort((a, b) => Number(!!b.reading) - Number(!!a.reading) || (b.rssi ?? -200) - (a.rssi ?? -200));
}
