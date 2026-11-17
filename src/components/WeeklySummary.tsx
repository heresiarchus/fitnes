import { Link } from "react-router-dom";
import { updateSettings } from "../db";
import { type MessageKey, useI18n } from "../i18n";
import { ddmm, parseIso } from "../lib/date";
import { fmt, fmtInt, fmtKg } from "../lib/format";
import type { DaysMap, Settings } from "../lib/types";
import { type Fact, weeklySummary } from "../lib/weekly";
import { Icon } from "./Card";

/** Last week in a few lines: on Mondays on the home screen (until closed), always in Reports. */
export function WeeklySummary({ days, settings, always = false }: { days: DaysMap; settings: Settings; always?: boolean }) {
  const { t, lang } = useI18n();
  const now = new Date();
  const s = weeklySummary(days, settings, now);
  if (!always && (now.getDay() !== 1 || settings.summarySeen === s.monday)) return null;
  if (!s.facts.length) return always ? <section className="block"><p className="empty">{t("wk.empty")}</p></section> : null;
  const sign = (x: number, f: (v: number) => string) => `${x > 0 ? "+" : x < 0 ? "−" : "±"}${f(Math.abs(x))}`;
  const day = (d: string) => parseIso(d).toLocaleDateString(lang === "uk" ? "uk-UA" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
  const line = (f: Fact): [string, "good" | "bad" | "info"] | null => {
    switch (f.k) {
      case "steps": return [t("wk.steps", { v: fmtInt(f.avg, lang), d: f.pct == null ? "" : t("wk.vsPrev", { d: sign(f.pct, (v) => `${fmt(v, lang, 0)}%`) }) }), f.pct == null ? "info" : f.pct >= 0 ? "good" : "bad"];
      case "active": return [t("wk.active", { v: fmtInt(f.min, lang), g: f.goal }), f.min >= f.goal ? "good" : "info"];
      case "weight": return [t("wk.weight", { d: sign(f.d, (v) => fmtKg(v, lang, 2)) }), f.d <= -0.1 ? "good" : f.d >= 0.2 ? "bad" : "info"];
      case "sleep": return [t("wk.sleep", { v: fmt(f.avg, lang), ok: f.ok, n: f.n }), f.avg >= 7 ? "good" : f.avg < 6.5 ? "bad" : "info"];
      case "pulse": return [t("wk.pulse", { v: fmtInt(f.avg, lang), d: f.d == null ? "" : t("wk.vsPrev", { d: sign(f.d, (v) => fmt(v, lang)) }) }), f.d != null && f.d <= -1 ? "good" : f.d != null && f.d >= 3 ? "bad" : "info"];
      case "bp": return [t("wk.bp", { s: f.sys, d: f.dia }), f.sys < 135 && f.dia < 85 ? "good" : "bad"];
      case "sig.stepsDrop": return [t("wk.sig.stepsDrop", { p: fmt(Math.abs(f.pct), lang, 0) }), "bad"];
      case "sig.shortSleep": return [t("wk.sig.shortSleep"), "bad"];
      case "sig.weightUp": return [t("wk.sig.weightUp", { d: fmtKg(f.d, lang, 2) }), "bad"];
      case "sig.pulse": return [t("wk.sig.pulse", { d: fmtInt(f.d, lang) }), "bad"];
      case "sig.bp": return [t("wk.sig.bp", { s: f.sys, d: f.dia }), "bad"];
      case "win.stepRecord": return [t("wk.win.stepRecord", { v: fmtInt(f.v, lang), day: day(f.date) }), "good"];
      case "win.streak": return [t("wk.win.streak", { n: f.n }), "good"];
      case "win.milestone": return [t("wk.win.milestone", { p: f.pct }), "good"];
      case "win.who": return [t("wk.win.who"), "good"];
      case "jump": return [t("wk.jump", { day: day(f.date), d: fmtKg(f.d, lang, 2), why: f.causes.map((c) => t(`wk.why.${c}` as MessageKey)).join("; ") }), "info"];
      case "goalUp": return null;
    }
  };
  const goalUp = s.facts.find((f): f is Extract<Fact, { k: "goalUp" }> => f.k === "goalUp");
  const raiseGoal = (to: number) => updateSettings({ goals: settings.goals.map((g) => (g.metric === "steps" ? { ...g, target: to } : g)), stepGoal: to });
  return (
    <section className="block weekly" data-c="table">
      <div className="head-row">
        <span className="head-line"><span className="card-ic"><Icon name="table" /></span><h2>{t("wk.title")}</h2></span>
        <small className="status">{ddmm(s.week[0])}–{ddmm(s.week[1])}</small>
      </div>
      <ul className="wk-list">
        {s.facts.map((f, i) => { const l = line(f); return l && <li key={i} className={l[1]}>{l[0]}</li>; })}
      </ul>
      {goalUp && (
        <div className="wk-goal">
          <span>{t("wk.goalUp", { met: goalUp.met, of: goalUp.of, to: fmtInt(goalUp.to, lang) })}</span>
          <button type="button" className="compact primary" onClick={() => void raiseGoal(goalUp.to)}>{t("wk.raise", { to: fmtInt(goalUp.to, lang) })}</button>
        </div>
      )}
      <div className="actions">
        <Link className="btn" to="/more">{t("wk.more")}</Link>
        {!always && <button type="button" onClick={() => void updateSettings({ summarySeen: s.monday })}>{t("wk.close")}</button>}
      </div>
    </section>
  );
}
