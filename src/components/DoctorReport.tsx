import { useState } from "react";
import { type MessageKey, useI18n } from "../i18n";
import { bmi, bpClass, bpWeek, datesBetween, mean, present, series, slope, sum, trendLine } from "../lib/analytics";
import { addDays, ddmm, iso } from "../lib/date";
import { fmt, fmtInt, fmtKg } from "../lib/format";
import { bpSummary } from "../lib/stats";
import type { DaysMap, Settings } from "../lib/types";

/** One page for a doctor's visit: the last 30 days of pressure (home protocol), weight, pulse, sleep and episodes. */
export function DoctorReport({ days, settings }: { days: DaysMap; settings: Settings }) {
  const { t, lang } = useI18n();
  const [copied, setCopied] = useState(false);
  const end = iso(new Date()), start = iso(addDays(new Date(), -29));
  const dates = datesBetween(start, end);
  const lines: string[] = [t("doc.head", { from: ddmm(start), to: ddmm(end) })];
  // Pressure: each of the last four weeks by the home protocol, then the share by category.
  const weeks = [0, 1, 2, 3].map((k) => { const e = iso(addDays(new Date(), -7 * k)); return { e, w: bpWeek(days, e) }; }).reverse();
  if (weeks.some((x) => x.w.all)) {
    lines.push(t("doc.bp"));
    weeks.forEach(({ e, w }) => { if (w.all) lines.push(t("doc.bpWeek", { to: ddmm(e), m: w.morning ? `${w.morning.sys}/${w.morning.dia}` : "—", ev: w.evening ? `${w.evening.sys}/${w.evening.dia}` : "—" })); });
    const c = { ok: 0, elevated: 0, high: 0 };
    dates.forEach((d) => { const s = bpSummary(days[d]); [s.morning, s.evening].forEach((a) => { if (a) c[bpClass(a.sys, a.dia)]++; }); });
    const n = c.ok + c.elevated + c.high;
    if (n) lines.push(t("doc.bpShare", { ok: Math.round((c.ok / n) * 100), el: Math.round((c.elevated / n) * 100), hi: Math.round((c.high / n) * 100) }));
  }
  const all = Object.keys(days).sort();
  const tr = trendLine(series(days, "weight", all));
  const iEnd = all.filter((d) => d <= end).length - 1, iStart = all.filter((d) => d < start).length - 1;
  if (iEnd >= 0 && tr[iEnd] != null) {
    const now = tr[iEnd]!, before = iStart >= 0 ? tr[iStart] : null;
    lines.push(t("doc.weight", { v: fmtKg(now, lang), d: before != null ? `${now - before > 0 ? "+" : "−"}${fmtKg(Math.abs(now - before), lang)}` : "—", bmi: settings.heightCm ? fmt(bmi(now, settings.heightCm), lang) : "—" }));
  }
  const hr = present(series(days, "pulse", dates));
  if (hr.length) { const s = slope(series(days, "pulse", dates)); lines.push(t("doc.pulse", { v: fmtInt(mean(hr), lang), d: s ? fmt(s.perDay * 30, lang) : "—" })); }
  const sl = present(series(days, "sleep", dates));
  if (sl.length) lines.push(t("doc.sleep", { v: fmt(mean(sl), lang), ok: sl.filter((h) => h >= 7).length, n: sl.length }));
  const act = present(series(days, "active", dates)), st = present(series(days, "steps", dates));
  if (act.length || st.length) lines.push(t("doc.move", { a: fmtInt((sum(act) / 30) * 7, lang), s: fmtInt(mean(st), lang) }));
  const ep = dates.reduce((n, d) => n + (days[d]?.bpEpisodes?.length ?? 0), 0);
  const flags = dates.flatMap((d) => days[d]?.flags ?? []);
  const pain = dates.filter((d) => Object.values(days[d]?.pain ?? {}).some((p) => (p ?? 0) > 0)).length;
  lines.push(t("doc.episodes", { bp: ep, flags: [...new Set(flags)].map((f) => `${t(`flag.${f}` as MessageKey)} ×${flags.filter((x) => x === f).length}`).join(", ") || "—", pain }));
  const text = lines.join("\n");
  return (
    <section className="block" data-c="heart">
      <div className="head-row"><h2>{t("doc.title")}</h2></div>
      <p className="status" style={{ margin: 0 }}>{t("doc.why")}</p>
      <pre className="doc-text">{text}</pre>
      <div className="actions">
        <button type="button" className="primary" onClick={() => { void navigator.clipboard.writeText(text).then(() => setCopied(true), () => setCopied(false)); }}>{copied ? t("doc.copied") : t("doc.copy")}</button>
      </div>
    </section>
  );
}
