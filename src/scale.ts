import { BleClient, type ScanResult } from "@capacitor-community/bluetooth-le";
import { Capacitor } from "@capacitor/core";
import { ChipseaStream, isGattScale, isScaleName, parseScale, type ScaleFrame, type ScaleReading, Settler, userSyncFrame } from "./lib/okok";
import { isNative } from "./native";

export interface NearbyDevice { id: string; name: string; rssi?: number; companies: string[]; uuids: string[]; raw: string; reading?: ScaleReading }

export type WeighEvent =
  | { phase: "search" }
  | { phase: "found"; name: string; how: "broadcast" | "connect" }
  | { phase: "live"; kg: number }
  | { phase: "done"; kg: number }
  | { phase: "timeout"; seen: NearbyDevice[] }
  | { phase: "error"; reason: "noPlugin" | "bluetoothOff" | "other"; message?: string };

const SERVICE = "0000fff0-0000-1000-8000-00805f9b34fb";
const NOTIFY = "0000fff1-0000-1000-8000-00805f9b34fb";
const WRITE = "0000fff2-0000-1000-8000-00805f9b34fb";

/** The installed Android shell has the Bluetooth part (older shells only got the web update). */
export const bluetoothAvailable = () => isNative && Capacitor.isPluginAvailable("BluetoothLe");

let ready = false;
async function init() {
  if (ready) return;
  await BleClient.initialize({ androidNeverForLocation: true });
  ready = true;
}

const hex = (u: Uint8Array) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const frameOf = (r: ScanResult): ScaleFrame => {
  const f: ScaleFrame = {};
  for (const [k, v] of Object.entries(r.manufacturerData ?? {})) f[Number(k)] = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  return f;
};
const describe = (r: ScanResult, reading: ScaleReading | null): NearbyDevice => {
  const frame = frameOf(r);
  return {
    id: r.device.deviceId, name: r.localName ?? r.device.name ?? "", rssi: r.rssi, uuids: r.uuids ?? [],
    companies: Object.keys(frame).map((k) => "0x" + Number(k).toString(16).padStart(4, "0")),
    raw: Object.entries(frame).map(([k, v]) => `${Number(k).toString(16)}:${hex(v)}`).join(" "),
    reading: reading ?? undefined,
  };
};

/**
 * One weighing, as in the OKOK app: 30 seconds to find the scale and step on it (extended
 * while numbers are still coming in), live numbers while it settles, then the fixed value.
 * Broadcast scales are only listened to; "Chipsea-BLE" scales are connected to.
 * Returns a function that cancels the session.
 */
export function startWeighing(on: (e: WeighEvent) => void, windowMs = 30000): () => void {
  let finished = false;
  let gattId: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const seen = new Map<string, NearbyDevice>();
  const settler = new Settler();

  const stop = async () => {
    clearTimeout(timer);
    await BleClient.stopLEScan().catch(() => {});
    if (gattId) await BleClient.disconnect(gattId).catch(() => {});
  };
  const finish = (e: WeighEvent) => {
    if (finished) return;
    finished = true;
    void stop();
    on(e);
  };
  const arm = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => finish({ phase: "timeout", seen: [...seen.values()].sort((a, b) => (b.rssi ?? -200) - (a.rssi ?? -200)) }), ms);
  };
  const reading = (r: ScaleReading) => {
    on({ phase: "live", kg: r.kg });
    arm(windowMs); // still measuring: give it time to settle
    const kg = settler.push(r);
    if (kg != null) finish({ phase: "done", kg });
  };

  const connect = async (id: string, name: string) => {
    gattId = id;
    await BleClient.stopLEScan().catch(() => {});
    on({ phase: "found", name, how: "connect" });
    const stream = new ChipseaStream();
    await BleClient.connect(id, () => { if (!finished) gattId = null; }, { timeout: 10000 });
    await BleClient.startNotifications(id, SERVICE, NOTIFY, (v) => {
      const r = stream.feed(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
      if (r) reading(r);
    });
    const sync = userSyncFrame(new Date());
    await BleClient.writeWithoutResponse(id, SERVICE, WRITE, new DataView(sync.buffer)).catch(() =>
      BleClient.write(id, SERVICE, WRITE, new DataView(sync.buffer)));
  };

  void (async () => {
    if (!bluetoothAvailable()) return finish({ phase: "error", reason: "noPlugin" });
    try {
      await init();
      if (!(await BleClient.isEnabled())) {
        await BleClient.requestEnable().catch(() => {});
        if (!(await BleClient.isEnabled())) return finish({ phase: "error", reason: "bluetoothOff" });
      }
    } catch (e) {
      return finish({ phase: "error", reason: "other", message: (e as Error).message });
    }
    on({ phase: "search" });
    arm(windowMs);
    let announced = false;
    await BleClient.requestLEScan({ allowDuplicates: true }, (r) => {
      if (finished || gattId) return;
      const name = r.localName ?? r.device.name ?? "";
      const parsed = parseScale(frameOf(r));
      seen.set(r.device.deviceId, describe(r, parsed));
      if (parsed && isScaleName(name) && parsed.kg > 0) {
        if (!announced) { announced = true; on({ phase: "found", name: name || "OKOK", how: "broadcast" }); }
        reading(parsed);
      } else if (!parsed && isGattScale(name, r.uuids)) {
        connect(r.device.deviceId, name).catch((e) => finish({ phase: "error", reason: "other", message: (e as Error).message }));
      }
    }).catch((e) => finish({ phase: "error", reason: "other", message: (e as Error).message }));
  })();

  return () => { finished = true; void stop(); };
}

/** Everything advertising nearby for a few seconds — to see whether the scale is found at all. */
export async function scanNearby(ms = 12000): Promise<NearbyDevice[]> {
  if (!bluetoothAvailable()) return [];
  await init();
  const seen = new Map<string, NearbyDevice>();
  await BleClient.requestLEScan({ allowDuplicates: true }, (r) => {
    const parsed = parseScale(frameOf(r)) ?? seen.get(r.device.deviceId)?.reading ?? null;
    seen.set(r.device.deviceId, describe(r, parsed));
  });
  await new Promise((r) => setTimeout(r, ms));
  await BleClient.stopLEScan().catch(() => {});
  return [...seen.values()].sort((a, b) => Number(!!b.reading) - Number(!!a.reading) || (b.rssi ?? -200) - (a.rssi ?? -200));
}
