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
