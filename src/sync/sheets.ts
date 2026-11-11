import { db, getSettings, getSheetsConfig, localChanges, setSheetsConfig } from "../db";
import { buildSheets } from "../lib/sheets";

export type SheetsResult = "ok" | "sent" | "off" | "offline" | "error";

let running: Promise<SheetsResult> | null = null;

/**
 * Sends all tables to the user's Google Sheet through their Apps Script address.
 * "ok" means the script confirmed the write; "sent" means the request went out
 * but the browser could not read the answer.
 */
export function sendSheets(): Promise<SheetsResult> {
  running ??= run().finally(() => { running = null; });
  return running;
}

async function run(): Promise<SheetsResult> {
  const cfg = await getSheetsConfig();
  if (!cfg?.url) return "off";
  if (!navigator.onLine) return "offline";
  const payload = buildSheets(await db.days.toArray(), await db.items.toArray(), (await getSettings()).habits);
  // text/plain keeps this a "simple" request, which Apps Script accepts without a preflight.
  const init: RequestInit = { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload), redirect: "follow" };
  let result: SheetsResult;
  let error: string | undefined;
  try {
    const res = await fetch(cfg.url, init);
    const text = await res.text();
    let ok = false;
    try { const j = JSON.parse(text) as { ok?: boolean; error?: string }; ok = !!j.ok; error = j.error; } catch { error = "unexpected answer"; }
    result = ok ? "ok" : "error";
  } catch {
    try {
      // Some browsers refuse to expose the redirected answer; send blind instead.
      await fetch(cfg.url, { ...init, mode: "no-cors" });
      result = "sent";
    } catch (e) {
      result = "error";
      error = (e as Error).message;
    }
  }
  const cur = await getSheetsConfig();
  if (cur?.url === cfg.url) {
    await setSheetsConfig(result === "error" ? { ...cur, lastError: error ?? "error" } : { url: cur.url, lastSentAt: new Date().toISOString() });
  }
  return result;
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Sends on start, a few seconds after each edit, and when the app comes back online. */
export function startAutoSheets() {
  void sendSheets();
  localChanges.addEventListener("change", () => { clearTimeout(timer); timer = setTimeout(() => void sendSheets(), 5000); });
  window.addEventListener("online", () => void sendSheets());
}
