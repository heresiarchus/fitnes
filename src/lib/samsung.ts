import type { BpReading, BpSlot, DayEntry, DaysMap, SourceKey } from "./types";

/**
 * Parser for Samsung Health "Download personal data" step files.
 *
 * The export is a folder of CSVs. Daily totals live in
 * `com.samsung.shealth.step_daily_trend.<timestamp>.csv`. Its first line is a
 * metadata line (file type, version, column count), the second the header.
 * Column names may be bare (`count`) or prefixed (`com.samsung.health.step_daily_trend.count`).
 * Rows with `source_type = -2` hold the total merged across phone and watch;
 * when they exist they are used, otherwise the largest per-device count wins
 * (summing devices would double count).
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

const short = (h: string) => h.trim().split(".").pop()!.toLowerCase();

function toDate(v: string): string | null {
  const t = v.trim();
  if (/^\d{10,13}$/.test(t)) {
    // Epoch milliseconds of the day start in UTC.
    const d = new Date(Number(t.length === 10 ? t + "000" : t));
    return d.toISOString().slice(0, 10);
  }
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export class SamsungFormatError extends Error {}

/** Returns daily step totals keyed by YYYY-MM-DD. */
export function parseSamsungSteps(text: string): Record<string, number> {
  const rows = parseCsv(text);
  const hi = rows.findIndex((r) => r.map(short).includes("count") && r.map(short).includes("day_time"));
  if (hi < 0) throw new SamsungFormatError("no day_time/count columns");
  const head = rows[hi].map(short);
  const iDay = head.indexOf("day_time");
  const iCount = head.indexOf("count");
  const iSrc = head.indexOf("source_type");
  const merged: Record<string, number> = {};
  const perDevice: Record<string, number> = {};
  for (const r of rows.slice(hi + 1)) {
    const date = toDate(r[iDay] ?? "");
    const count = Number(r[iCount]);
    if (!date || !Number.isFinite(count) || count < 0) continue;
    if (iSrc >= 0 && r[iSrc]?.trim() === "-2") merged[date] = Math.max(merged[date] ?? 0, count);
    else perDevice[date] = Math.max(perDevice[date] ?? 0, count);
  }
  const out: Record<string, number> = { ...perDevice, ...merged };
  for (const k of Object.keys(out)) out[k] = Math.round(out[k]);
  return out;
}

// ---------- Other Samsung Health export files ----------


export type SamsungKind = Exclude<SourceKey, "sleep">;

/** One workout: walking counts towards walk minutes, anything else towards cardio. */
export interface SamsungExercise { date: string; minutes: number; walk: boolean; cardio?: string }
export interface SamsungWeight { date: string; hour: number; weight: number; time: number }
export interface SamsungBp { date: string; hour: number; time: number; sys: number; dia: number; pulse: number | null }

export interface SamsungData {
  steps: Record<string, number>;
  /** Night sleep by wake-up date and resting pulse by date (from Health Connect only). */
  sleep?: Record<string, { minutes: number; start?: string; end?: string }>;
  restingHr?: Record<string, number>;
  exercise: SamsungExercise[];
  weight: SamsungWeight[];
  bp: SamsungBp[];
  kinds: SamsungKind[];
}

export const emptySamsung = (): SamsungData => ({ steps: {}, exercise: [], weight: [], bp: [], kinds: [] });

/** Samsung exercise type codes that count as walking (walking, hiking, treadmill). */
const WALK_TYPES = new Set([1001, 13001, 15005]);
/** Other types mapped to this app's cardio names (keys of the `cardio.*` messages). */
export const CARDIO_TYPES: Record<number, string> = {
  1002: "run", 11007: "cycle", 14001: "pool", 15003: "bike", 15004: "rower", 15006: "elliptical",
};

/**
 * Export timestamps are UTC ("2026-11-10 06:30:00.000") with a separate offset ("UTC+0200").
 * Returns the local calendar date and hour of the measurement.
 */
export function localTime(start: string, offset: string | undefined): { date: string; hour: number; time: number } | null {
  const m = start.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  let t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  const o = (offset ?? "").match(/([+-])(\d{2}):?(\d{2})/);
  if (o) t += (o[1] === "-" ? -1 : 1) * (+o[2] * 60 + +o[3]) * 60000;
  const d = new Date(t);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours(), time: t };
}

function table(text: string, required: string[]): { head: string[]; rows: string[][] } | null {
  const rows = parseCsv(text);
  const hi = rows.findIndex((r) => { const h = r.map(short); return required.every((c) => h.includes(c)); });
  return hi < 0 ? null : { head: rows[hi].map(short), rows: rows.slice(hi + 1) };
}

/** Detects which export file this is by its columns and adds its records to `into`. */
export function parseSamsungFile(text: string, into: SamsungData): SamsungKind {
  const add = (k: SamsungKind) => { if (!into.kinds.includes(k)) into.kinds.push(k); return k; };
  let t = table(text, ["day_time", "count"]);
  if (t) { Object.assign(into.steps, parseSamsungSteps(text)); return add("steps"); }

  t = table(text, ["exercise_type", "duration", "start_time"]);
  if (t) {
    const iS = t.head.indexOf("start_time"), iO = t.head.indexOf("time_offset"), iT = t.head.indexOf("exercise_type"), iD = t.head.indexOf("duration");
    for (const r of t.rows) {
      const lt = localTime(r[iS] ?? "", iO >= 0 ? r[iO] : undefined);
      const ms = Number(r[iD]);
      const type = Number(r[iT]);
      if (!lt || !Number.isFinite(ms) || ms <= 0 || !Number.isFinite(type)) continue;
      into.exercise.push({ date: lt.date, minutes: ms / 60000, walk: WALK_TYPES.has(type), cardio: CARDIO_TYPES[type] });
    }
    return add("exercise");
  }

  t = table(text, ["systolic", "diastolic", "start_time"]);
  if (t) {
    const iS = t.head.indexOf("start_time"), iO = t.head.indexOf("time_offset"), iSy = t.head.indexOf("systolic"), iDi = t.head.indexOf("diastolic"), iP = t.head.indexOf("pulse");
    for (const r of t.rows) {
      const lt = localTime(r[iS] ?? "", iO >= 0 ? r[iO] : undefined);
      const sys = Number(r[iSy]), dia = Number(r[iDi]);
      const pulse = iP >= 0 && r[iP] !== "" ? Number(r[iP]) : NaN;
      if (!lt || !(sys > 0) || !(dia > 0)) continue;
      into.bp.push({ ...lt, sys: Math.round(sys), dia: Math.round(dia), pulse: pulse > 0 ? Math.round(pulse) : null });
    }
    return add("bp");
  }

  t = table(text, ["weight", "start_time"]);
  if (t) {
    const iS = t.head.indexOf("start_time"), iO = t.head.indexOf("time_offset"), iW = t.head.indexOf("weight");
    for (const r of t.rows) {
      const lt = localTime(r[iS] ?? "", iO >= 0 ? r[iO] : undefined);
      const w = Number(r[iW]);
      if (!lt || !(w > 0)) continue;
      into.weight.push({ ...lt, weight: Math.round(w * 10) / 10 });
    }
    return add("weight");
  }
  throw new SamsungFormatError("unknown file");
}

export interface ApplyResult { changes: DayEntry[]; counts: Record<SamsungKind, number> }

/**
 * Turns parsed Samsung data into day updates, only for the sources the user enabled.
 * `cardioName` translates a cardio key ("bike") into the stored label.
 */
export function applySamsung(
  days: DaysMap, data: SamsungData, sources: Record<SourceKey, boolean>,
  cardioName: (key: string) => string, now = new Date(),
): ApplyResult {
  const next = new Map<string, DayEntry>();
  const counts: Record<SamsungKind, number> = { steps: 0, exercise: 0, weight: 0, bp: 0 };
  const touched: Record<SamsungKind, Set<string>> = { steps: new Set(), exercise: new Set(), weight: new Set(), bp: new Set() };
  const get = (date: string): DayEntry => next.get(date) ?? { ...(days[date] ?? { date, updatedAt: "" }) };
  const put = (kind: SamsungKind, d: DayEntry) => { next.set(d.date, d); touched[kind].add(d.date); };

  if (sources.steps) {
    for (const [date, n] of Object.entries(data.steps)) {
      const d = get(date);
      if (d.steps !== n) { d.steps = n; put("steps", d); }
    }
  }

  if (sources.exercise) {
    const byDay = new Map<string, { walk: number; cardio: number; kinds: Set<string> }>();
    for (const e of data.exercise) {
      const a = byDay.get(e.date) ?? { walk: 0, cardio: 0, kinds: new Set<string>() };
      if (e.walk) a.walk += e.minutes;
      else { a.cardio += e.minutes; a.kinds.add(e.cardio ?? "other"); }
      byDay.set(e.date, a);
    }
    for (const [date, a] of byDay) {
      const d = get(date);
      const walk = Math.round(a.walk), cardio = Math.round(a.cardio);
      let ch = false;
      if (walk > 0 && d.walkMin !== walk) { d.walkMin = walk; d.walkIntensity ??= "light"; ch = true; }
      if (cardio > 0 && d.cardioMin !== cardio) {
        d.cardioMin = cardio;
        const names = [...a.kinds].filter((k) => k !== "other").map(cardioName);
        if (names.length) d.cardioWhat = names.join(", "); else if (!d.cardioWhat) delete d.cardioWhat;
        ch = true;
      }
      if (ch) put("exercise", d);
    }
  }

  if (sources.weight) {
    const first = new Map<string, SamsungWeight>();
    for (const w of data.weight) { const c = first.get(w.date); if (!c || w.time < c.time) first.set(w.date, w); }
    for (const [date, w] of first) {
      const d = get(date);
      const cond = w.hour < 12 ? "morning" : "other";
      if (d.weight !== w.weight || d.weightCond !== cond) { d.weight = w.weight; d.weightCond = cond; delete d.noWeight; put("weight", d); }
    }
  }

  if (sources.bp) {
    const byDay = new Map<string, SamsungBp[]>();
    for (const b of data.bp) byDay.set(b.date, [...(byDay.get(b.date) ?? []), b]);
    for (const [date, list] of byDay) {
      list.sort((a, b) => a.time - b.time);
      const bp: Partial<Record<BpSlot, BpReading>> = {};
      const am = list.filter((b) => b.hour < 14).slice(0, 2), pm = list.filter((b) => b.hour >= 14).slice(0, 2);
      am.forEach((b, i) => { bp[(["m1", "m2"] as const)[i]] = { sys: b.sys, dia: b.dia, pulse: b.pulse }; });
      pm.forEach((b, i) => { bp[(["e1", "e2"] as const)[i]] = { sys: b.sys, dia: b.dia, pulse: b.pulse }; });
      const d = get(date);
      const merged = { ...(d.bp ?? {}), ...bp };
      if (JSON.stringify(merged) !== JSON.stringify(d.bp ?? {})) { d.bp = merged; put("bp", d); }
    }
  }

  if (sources.sleep) {
    for (const [date, v] of Object.entries(data.sleep ?? {})) {
      const d = get(date);
      const minutes = Math.round(v.minutes);
      if (minutes > 0 && (d.sleepMin !== minutes || d.sleepStart !== v.start || d.sleepEnd !== v.end)) {
        d.sleepMin = minutes;
        if (v.start) d.sleepStart = v.start;
        if (v.end) d.sleepEnd = v.end;
        next.set(date, d);
      }
    }
    for (const [date, hr] of Object.entries(data.restingHr ?? {})) {
      const d = get(date);
      if (hr > 0 && d.restingHr !== Math.round(hr)) { d.restingHr = Math.round(hr); next.set(date, d); }
    }
  }

  const stamp = now.toISOString();
  for (const k of Object.keys(touched) as SamsungKind[]) counts[k] = touched[k].size;
  return { changes: [...next.values()].map((d) => ({ ...d, updatedAt: stamp })), counts };
}
