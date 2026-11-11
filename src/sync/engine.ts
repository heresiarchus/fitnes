import { useSyncExternalStore } from "react";
import { db, getSettings, getSyncConfig, localChanges, putSyncedSettings, setSyncConfig } from "../db";
import type { DayEntry } from "../lib/types";
import { getFile, putFile, SyncError } from "./github";
import { merge, parseSyncFile, serializeSyncFile } from "./merge";

export type SyncState = "off" | "idle" | "syncing" | "offline" | "error";
export interface SyncStatus { state: SyncState; error?: SyncError["code"]; lastSyncAt?: string }

let status: SyncStatus = { state: "off" };
const listeners = new Set<() => void>();
function setStatus(s: SyncStatus) { status = s; listeners.forEach((l) => l()); }

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => status);
}

let running: Promise<void> | null = null;
let again = false;

/** Pulls the remote file, merges by timestamp, writes newer remote records locally and pushes the result. */
export function syncNow(): Promise<void> {
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      do { again = false; await runOnce(); } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function runOnce() {
  const cfg = await getSyncConfig();
  if (!cfg) { setStatus({ state: "off" }); return; }
  if (!navigator.onLine) { setStatus({ state: "offline", lastSyncAt: cfg.lastSyncAt }); return; }
  setStatus({ state: "syncing", lastSyncAt: cfg.lastSyncAt });
  const started = new Date().toISOString();
  try {
    for (let attempt = 0; ; attempt++) {
      const remote = await getFile(cfg.repo, cfg.token, cfg.path);
      const rf = remote ? parseSyncFile(remote.text) : null;
      const local = await db.days.toArray();
      const localSettings = await getSettings();
      const localItems = await db.items.toArray();
      const m = merge(local, rf?.days ?? [], localSettings, rf?.settings ?? null, localItems, rf?.items ?? []);
      await applyRemote(m.toLocal);
      if (m.itemsToLocal.length) {
        await db.transaction("rw", db.items, async () => {
          for (const r of m.itemsToLocal) {
            const cur = await db.items.get(r.id);
            if (!cur || cur.updatedAt < r.updatedAt) await db.items.put(r);
          }
        });
      }
      if (m.settingsToLocal) await putSyncedSettings(m.settingsToLocal);
      if (!m.remoteChanged && remote) break;
      try {
        const live = m.days.filter((d) => !d.deleted).length;
        await putFile(cfg.repo, cfg.token, cfg.path, serializeSyncFile(m.days, m.settings, new Date(), m.items), remote?.sha, `sync: ${live} days`);
        break;
      } catch (e) {
        if (e instanceof SyncError && e.code === "conflict" && attempt < 3) continue;
        throw e;
      }
    }
    const next = { ...cfg, lastSyncAt: started };
    // Config may have been changed or removed while syncing.
    const cur = await getSyncConfig();
    if (cur && cur.repo === cfg.repo && cur.token === cfg.token) await setSyncConfig(next);
    setStatus({ state: "idle", lastSyncAt: started });
  } catch (e) {
    const code = e instanceof SyncError ? e.code : "http";
    setStatus({ state: code === "network" ? "offline" : "error", error: code, lastSyncAt: cfg.lastSyncAt });
  }
}

/** Writes remote records, but never over a local edit made after the merge was computed. */
async function applyRemote(items: DayEntry[]) {
  if (!items.length) return;
  await db.transaction("rw", db.days, async () => {
    for (const r of items) {
      const cur = await db.days.get(r.date);
      if (!cur || cur.updatedAt < r.updatedAt) await db.days.put(r);
    }
  });
}

let timer: ReturnType<typeof setTimeout> | undefined;
function schedule(ms: number) {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

/** Wires automatic sync: on start, on reconnect, on return to the app, after edits, and every 5 min. */
export function startAutoSync() {
  void syncNow();
  window.addEventListener("online", () => void syncNow());
  window.addEventListener("offline", () => { if (status.state !== "off") setStatus({ ...status, state: "offline" }); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void syncNow(); });
  localChanges.addEventListener("change", () => schedule(1500));
  setInterval(() => { if (document.visibilityState === "visible") void syncNow(); }, 5 * 60 * 1000);
}
