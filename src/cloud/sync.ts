import { useSyncExternalStore } from "react";
import { db, type CloudState, getSecrets, getSettings, localChanges, putSecret, putSyncedSettings } from "../db";
import { cloud } from "./client";
import { planSync, type Row } from "./plan";

export interface CloudStatus { state: "off" | "signedOut" | "syncing" | "idle" | "error"; lastAt?: string; error?: string }
let status: CloudStatus = { state: "off" };
const listeners = new Set<() => void>();
const setStatus = (s: CloudStatus) => { status = s; listeners.forEach((l) => l()); };
export const useCloudStatus = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => status);

const PAGE = 1000;

async function pull(since: string | null): Promise<Row[]> {
  const c = cloud()!;
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = c.from("records").select("kind,id,data,updated_at,server_at").order("server_at", { ascending: true }).order("kind").order("id").range(from, from + PAGE - 1);
    if (since) q = q.gt("server_at", since);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) return out;
  }
}

async function push(userId: string, rows: Row[]) {
  const c = cloud()!;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ user_id: userId, kind: r.kind, id: r.id, data: r.data, updated_at: r.updated_at }));
    const { error } = await c.from("records").upsert(chunk, { onConflict: "user_id,kind,id" });
    if (error) throw new Error(error.message);
  }
}

let running: Promise<void> | null = null;
let again = false;

/** Pulls what changed on the account, merges by timestamp, pushes local changes. */
export function cloudSync(): Promise<void> {
  if (running) { again = true; return running; }
  running = (async () => {
    try { do { again = false; await once(); } while (again); } finally { running = null; }
  })();
  return running;
}

async function once() {
  const c = cloud();
  if (!c) { setStatus({ state: "off" }); return; }
  const { data: { session } } = await c.auth.getSession();
  if (!session) { setStatus({ state: "signedOut" }); return; }
  if (!navigator.onLine) return;
  const userId = session.user.id;
  const prev = (await db.meta.get("cloud"))?.value as CloudState | undefined;
  // A different account on this device starts from scratch.
  const st: CloudState = prev?.userId === userId ? prev : { userId, lastServerAt: null, synced: {} };
  setStatus({ state: "syncing", lastAt: st.lastAt });
  try {
    const remote = await pull(st.lastServerAt);
    const plan = planSync({ days: await db.days.toArray(), items: await db.items.toArray(), settings: await getSettings(), secrets: await getSecrets() }, remote, st.synced);
    await db.transaction("rw", db.days, db.items, async () => {
      for (const d of plan.days) { const cur = await db.days.get(d.date); if (!cur || cur.updatedAt < d.updatedAt) await db.days.put(d); }
      for (const i of plan.items) { const cur = await db.items.get(i.id); if (!cur || cur.updatedAt < i.updatedAt) await db.items.put(i); }
    });
    if (plan.settings) await putSyncedSettings(plan.settings);
    for (const [id, v] of Object.entries(plan.secrets)) await putSecret(id, v);
    if (plan.push.length) await push(userId, plan.push);
    for (const r of plan.push) plan.synced[`${r.kind}:${r.id}`] = r.data.updatedAt;
    const lastServerAt = remote.reduce<string | null>((m, r) => (r.server_at && (!m || r.server_at > m) ? r.server_at : m), st.lastServerAt);
    const lastAt = new Date().toISOString();
    await db.meta.put({ key: "cloud", value: { userId, lastServerAt, synced: plan.synced, lastAt } });
    setStatus({ state: "idle", lastAt });
  } catch (e) {
    setStatus({ state: "error", lastAt: st.lastAt, error: (e as Error).message });
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Syncs on start, on sign-in, after edits, on return to the app and every 2 minutes. */
export function startCloudSync() {
  const c = cloud();
  if (!c) return;
  c.auth.onAuthStateChange((event) => { if (event === "SIGNED_IN" || event === "SIGNED_OUT") setTimeout(() => void cloudSync(), 0); });
  void cloudSync();
  localChanges.addEventListener("change", () => { clearTimeout(timer); timer = setTimeout(() => void cloudSync(), 2000); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void cloudSync(); });
  window.addEventListener("online", () => void cloudSync());
  setInterval(() => { if (document.visibilityState === "visible") void cloudSync(); }, 2 * 60 * 1000);
}
