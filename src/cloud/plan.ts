import type { DayEntry, Item, Settings, SheetsConfig, SyncConfig } from "../lib/types";

export type RowKind = "day" | "item" | "settings" | "secret";
export interface Row { kind: RowKind; id: string; data: { updatedAt: string } & Record<string, unknown>; updated_at: string; server_at?: string }

/** Connection details that should follow the account: GitHub data repo and the Google Sheet. */
export interface Secret { updatedAt: string; deleted?: true; [k: string]: unknown }

export interface LocalSnapshot {
  days: DayEntry[];
  items: Item[];
  settings: Settings | null;
  secrets: Record<string, Secret>;
}

export interface Plan {
  days: DayEntry[];
  items: Item[];
  settings: Settings | null;
  secrets: Record<string, Secret>;
  push: Row[];
  /** Version (updatedAt) of each record as the server now has it, keyed "kind:id". */
  synced: Record<string, string>;
}

const key = (kind: RowKind, id: string) => `${kind}:${id}`;

/**
 * One sync round. Records changed on the server since the last pull replace older local
 * copies; local records whose version differs from what the server last had are pushed,
 * unless the server just sent a newer one. Deletions travel as tombstones.
 */
export function planSync(local: LocalSnapshot, remote: Row[], syncedBefore: Record<string, string>): Plan {
  const synced = { ...syncedBefore };
  const remoteBy = new Map(remote.map((r) => [key(r.kind, r.id), r]));
  const out: Plan = { days: [], items: [], settings: null, secrets: {}, push: [], synced };
  const days = new Map(local.days.map((d) => [d.date, d]));
  const items = new Map(local.items.map((i) => [i.id, i]));

  for (const r of remote) {
    synced[key(r.kind, r.id)] = r.data.updatedAt;
    if (r.kind === "day") {
      const l = days.get(r.id);
      if (!l || r.data.updatedAt > l.updatedAt) out.days.push(r.data as unknown as DayEntry);
    } else if (r.kind === "item") {
      const l = items.get(r.id);
      if (!l || r.data.updatedAt > l.updatedAt) out.items.push(r.data as unknown as Item);
    } else if (r.kind === "settings") {
      if (!local.settings || r.data.updatedAt > local.settings.updatedAt) out.settings = r.data as unknown as Settings;
    } else {
      const l = local.secrets[r.id];
      if (!l || r.data.updatedAt > l.updatedAt) out.secrets[r.id] = r.data as Secret;
    }
  }

  const consider = (kind: RowKind, id: string, data: { updatedAt: string }) => {
    const k = key(kind, id);
    const r = remoteBy.get(k);
    if (synced[k] === data.updatedAt) return;
    if (r && r.data.updatedAt >= data.updatedAt) return;
    out.push.push({ kind, id, data: data as Row["data"], updated_at: data.updatedAt });
  };
  for (const d of local.days) consider("day", d.date, d);
  for (const i of local.items) consider("item", i.id, i);
  if (local.settings) consider("settings", "main", local.settings);
  for (const [id, s] of Object.entries(local.secrets)) consider("secret", id, s);
  return out;
}

/** Stamp for connections set up before accounts existed and never used: any real change wins. */
export const LEGACY_STAMP = "2000-01-01T00:00:00.000Z";

/**
 * Connections set up before accounts existed carry no updatedAt. They get one once, from when
 * they last worked on this device (so the device that used them most recently wins a tie).
 * Returns the stamped configs to store, or null when nothing needs stamping.
 */
export function stampLegacy(sync: SyncConfig | undefined, sheets: SheetsConfig | undefined) {
  const out: { sync?: SyncConfig; sheets?: SheetsConfig } = {};
  if (sync && !sync.updatedAt && sync.token) out.sync = { ...sync, updatedAt: sync.lastSyncAt ?? LEGACY_STAMP };
  if (sheets && !sheets.updatedAt && sheets.url) out.sheets = { ...sheets, updatedAt: sheets.lastSentAt ?? LEGACY_STAMP };
  return out.sync || out.sheets ? out : null;
}

/** What of each connection travels with the account; per-device bookkeeping (last run, errors) stays. */
export function connectionRecords(sync: SyncConfig | undefined, sheets: SheetsConfig | undefined): Record<string, Secret> {
  const out: Record<string, Secret> = {};
  if (sync?.updatedAt) out.sync = sync.deleted ? { deleted: true, updatedAt: sync.updatedAt } : { provider: sync.provider, repo: sync.repo, token: sync.token, path: sync.path, updatedAt: sync.updatedAt };
  if (sheets?.updatedAt) out.sheets = sheets.deleted ? { deleted: true, updatedAt: sheets.updatedAt } : { url: sheets.url, updatedAt: sheets.updatedAt };
  return out;
}
