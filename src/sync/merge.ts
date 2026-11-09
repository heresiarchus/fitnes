import type { DayEntry, Settings } from "../lib/types";

export interface SyncFile {
  format: "fitnes-sync";
  version: 1;
  updatedAt: string;
  settings: Settings | null;
  days: DayEntry[];
}

export interface MergeResult {
  /** Full merged day list (including tombstones), sorted by date. */
  days: DayEntry[];
  settings: Settings | null;
  /** Remote records that are newer than local ones and must be written locally. */
  toLocal: DayEntry[];
  settingsToLocal: Settings | null;
  /** Whether the remote file lacks something the merge contains. */
  remoteChanged: boolean;
}

const newer = (a: { updatedAt: string }, b: { updatedAt: string }) => a.updatedAt > b.updatedAt;

/** Last-writer-wins merge per day (by updatedAt); ties keep the local copy. */
export function merge(
  local: DayEntry[], remote: DayEntry[],
  localSettings: Settings | null, remoteSettings: Settings | null,
): MergeResult {
  const byDate = new Map<string, DayEntry>();
  const remoteBy = new Map(remote.map((d) => [d.date, d]));
  const toLocal: DayEntry[] = [];
  let remoteChanged = false;
  for (const l of local) byDate.set(l.date, l);
  for (const r of remote) {
    const l = byDate.get(r.date);
    if (!l || newer(r, l)) { byDate.set(r.date, r); toLocal.push(r); }
  }
  for (const [date, d] of byDate) {
    const r = remoteBy.get(date);
    if (!r || r.updatedAt !== d.updatedAt) { remoteChanged = true; break; }
  }
  let settings = localSettings;
  let settingsToLocal: Settings | null = null;
  if (remoteSettings && (!localSettings || newer(remoteSettings, localSettings))) {
    settings = remoteSettings;
    settingsToLocal = remoteSettings;
  }
  if (settings && (!remoteSettings || settings.updatedAt !== remoteSettings.updatedAt)) remoteChanged = true;
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { days, settings, toLocal, settingsToLocal, remoteChanged };
}

/** One day per line, so the file history on GitHub stays readable. */
export function serializeSyncFile(days: DayEntry[], settings: Settings | null, now = new Date()): string {
  const head = { format: "fitnes-sync", version: 1, updatedAt: now.toISOString(), settings };
  const body = days.map((d) => "    " + JSON.stringify(d)).join(",\n");
  const h = JSON.stringify(head, null, 2);
  return h.slice(0, -2) + ',\n  "days": [\n' + body + (days.length ? "\n" : "") + "  ]\n}\n";
}

export function parseSyncFile(text: string): SyncFile {
  const data = JSON.parse(text) as Partial<SyncFile>;
  if (data.format !== "fitnes-sync" || !Array.isArray(data.days)) throw new Error("not a fitnes sync file");
  return {
    format: "fitnes-sync", version: 1, updatedAt: data.updatedAt ?? "",
    settings: data.settings ?? null,
    days: data.days.filter((d): d is DayEntry => !!d && typeof d.date === "string" && typeof d.updatedAt === "string"),
  };
}
