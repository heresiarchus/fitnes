import type { MessageKey, TFn } from "../i18n";
import { ddmm } from "./date";
import { fmt, fmtInt } from "./format";
import { periodStats } from "./stats";
import type { DaysMap, Habit, Lang, Phase } from "./types";
import { BP_SLOTS } from "./types";

export function exerciseName(t: TFn, e: { id?: string; name?: string }): string {
  return e.id ? t(("ex." + e.id) as MessageKey) : e.name ?? "";
}

/** Plain-text report for a period, suitable for pasting into a chat or message to a doctor. */
export function buildReport(days: DaysMap, dates: string[], prevDates: string[], phase: Phase, t: TFn, lang: Lang, habits: Habit[] = []): string {
  const s = periodStats(days, dates);
  const p = periodStats(days, prevDates);
  const kg = (v: number) => (lang === "uk" ? String(v).replace(".", ",") : String(v));
  const lines: string[] = [];
  lines.push(t("report.header", { range: ddmm(dates[0]) + "–" + ddmm(dates[dates.length - 1]), phase }));
  lines.push(t("report.logged", { n: s.logged, total: dates.length }));
  lines.push(
    t("report.weight", { avg: fmt(s.avgWeight, lang), n: s.weights.length }) +
      (s.avgWeight != null && p.avgWeight != null ? t("report.weightPrev", { avg: fmt(p.avgWeight, lang) }) : ""),
  );
  if (s.weights.length > 1) lines.push(t("report.weightRange", { min: fmt(s.minWeight, lang), max: fmt(s.maxWeight, lang) }));
  lines.push(t("report.steps", { avg: fmtInt(s.avgSteps, lang), total: fmtInt(s.totalSteps, lang) }));
  lines.push(t("report.walk", { walk: s.walk, light: s.walkLight, mod: s.walkMod, cardio: s.cardio }));
  lines.push(t("report.strength", { n: s.strengthDays }));
  for (const d of dates) {
    const x = days[d];
    if (!x?.strength) continue;
    lines.push("  " + ddmm(d) + ": " + x.strength.map((e) => exerciseName(t, e) + " " + e.sets + "×" + e.reps + (e.kg != null ? " " + kg(e.kg) + " " + t("common.kg") : "")).join("; "));
  }
  const bp: string[] = [];
  for (const d of dates) {
    const x = days[d];
    if (!x?.bp) continue;
    bp.push("  " + ddmm(d) + ": " + BP_SLOTS.filter((b) => x.bp?.[b]).map((b) => {
      const v = x.bp![b]!;
      return t(("form.bp." + b) as MessageKey) + " " + (v.sys ?? "?") + "/" + (v.dia ?? "?") + (v.pulse != null ? " " + t("form.bpPulse").toLowerCase() + " " + v.pulse : "");
    }).join("; "));
  }
  if (bp.length) lines.push(t("report.bp"), ...bp);
  const pm = (v: number | null) => (v == null ? "—" : String(v));
  lines.push(t("report.pain", { foot: pm(s.painMax.foot), back: pm(s.painMax.back), shoulder: pm(s.painMax.shoulder) }));
  if (s.flags.length) lines.push(t("report.flags", { list: s.flags.map((f) => ddmm(f.date) + " " + t(("flag." + f.flag) as MessageKey)).join("; ") }));
  const hl: string[] = [];
  let episodes = 0;
  for (const d of dates) {
    const x = days[d];
    if (x?.nightEpisode) episodes += 1;
    if (!x?.habitLog?.length) continue;
    hl.push("  " + ddmm(d) + ": " + x.habitLog.map((m) => (habits.find((h) => h.id === m.habitId)?.title ?? m.habitId) + " — " + t(`habit.status.${m.status}`).toLowerCase() + (m.reasonIfNo ? " (" + m.reasonIfNo + ")" : "")).join("; "));
  }
  if (hl.length) lines.push(t("habit.title") + ":", ...hl);
  if (episodes) lines.push(t("ctx.episode") + ": " + episodes);
  if (s.notes.length) lines.push(t("report.notes"), ...s.notes.map((n) => "  " + ddmm(n.date) + ": " + n.note));
  return lines.join("\n");
}
