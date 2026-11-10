import type { DayEntry, Settings } from "./types";
import { BP_SLOTS, EXERCISES, FLAGS, PAIN_AREAS } from "./types";

export const BACKUP_FORMAT = "fitnes-backup";
export const BACKUP_VERSION = 1;

export function makeBackup(days: DayEntry[], settings: Settings, now = new Date()) {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), settings, days };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const n = (v: unknown): number | undefined => {
  if (v == null || v === "") return undefined;
  const x = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : undefined;
};
const nn = (v: unknown): number | null => n(v) ?? null;
const str = (v: unknown, max = 1000): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

const WEIGHT_COND: Record<string, DayEntry["weightCond"]> = { morning: "morning", other: "other", "ранок": "morning", "інше": "other" };
const WALK_INT: Record<string, DayEntry["walkIntensity"]> = { light: "light", moderate: "moderate", "легка": "light", "помірна": "moderate" };

/**
 * Normalises one day record. Accepts this app's format and the earlier
 * "Журнал руху й ваги" page format (Ukrainian enum values).
 */
export function normalizeDay(raw: unknown, fallbackDate?: string): DayEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const date = typeof r.date === "string" ? r.date : fallbackDate;
  if (!date || !DATE_RE.test(date)) return null;
  const out: DayEntry = { date, updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : new Date().toISOString() };
  const weight = n(r.weight);
  if (weight != null) { out.weight = weight; out.weightCond = WEIGHT_COND[String(r.weightCond ?? "morning")] ?? "morning"; }
  const steps = n(r.steps);
  if (steps != null) out.steps = Math.round(steps);
  const walk = n(r.walkMin);
  if (walk != null) { out.walkMin = Math.round(walk); out.walkIntensity = WALK_INT[String(r.walkIntensity ?? "light")] ?? "light"; }
  const cardio = n(r.cardioMin);
  if (cardio != null) { out.cardioMin = Math.round(cardio); const w = str(r.cardioWhat, 60); if (w) out.cardioWhat = w; }
  if (Array.isArray(r.strength)) {
    const items = r.strength.flatMap((x) => {
      if (!x || typeof x !== "object") return [];
      const it = x as Record<string, unknown>;
      const reps = n(it.reps);
      if (!reps) return [];
      const id = typeof it.id === "string" && (EXERCISES as readonly string[]).includes(it.id) ? it.id : undefined;
      const name = str(it.name, 60);
      if (!id && !name) return [];
      const kg = n(it.kg);
      return [{ ...(id ? { id } : { name }), sets: Math.round(n(it.sets) ?? 1), reps: Math.round(reps), ...(kg != null ? { kg } : {}) }];
    });
    if (items.length) out.strength = items;
  }
  if (r.bp && typeof r.bp === "object") {
    const bp: DayEntry["bp"] = {};
    for (const slot of BP_SLOTS) {
      const v = (r.bp as Record<string, Record<string, unknown> | undefined>)[slot];
      if (v) bp[slot] = { sys: nn(v.sys), dia: nn(v.dia), pulse: nn(v.pulse) };
    }
    if (Object.keys(bp).length) out.bp = bp;
  }
  if (r.pain && typeof r.pain === "object") {
    const pain: DayEntry["pain"] = {};
    for (const a of PAIN_AREAS) {
      const v = n((r.pain as Record<string, unknown>)[a]);
      if (v != null) pain[a] = Math.max(0, Math.min(10, Math.round(v)));
    }
    if (Object.keys(pain).length) out.pain = pain;
  }
  if (Array.isArray(r.flags)) {
    const flags = FLAGS.filter((f) => (r.flags as unknown[]).includes(f));
    if (flags.length) out.flags = flags;
  }
  const note = str(r.note);
  if (note) out.note = note;
  if (r.noWeight === true && out.weight == null) out.noWeight = true;
  if (r.ok === true && !out.flags) out.ok = true;
  return out;
}

/** Parses a backup file: this app's backup, a plain array of days, or a {date: day} map. */
export function parseBackup(text: string): { days: DayEntry[]; settings?: Partial<Settings> } {
  const data = JSON.parse(text) as unknown;
  let rawDays: [unknown, string | undefined][] = [];
  let settings: Partial<Settings> | undefined;
  if (Array.isArray(data)) rawDays = data.map((d) => [d, undefined]);
  else if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.days)) rawDays = o.days.map((d) => [d, undefined]);
    else if (o.days && typeof o.days === "object") rawDays = Object.entries(o.days).map(([k, v]) => [v, k]);
    else rawDays = Object.entries(o).filter(([k]) => DATE_RE.test(k)).map(([k, v]) => [v, k]);
    if (o.settings && typeof o.settings === "object") settings = o.settings as Partial<Settings>;
  }
  const days = rawDays.map(([d, k]) => normalizeDay(d, k)).filter((d): d is DayEntry => d !== null);
  if (!days.length && !settings) throw new Error("no day records found");
  return { days, settings };
}
