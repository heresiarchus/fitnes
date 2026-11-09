import { useI18n } from "../i18n";
import { fmt, fmtInt } from "../lib/format";
import { PHASES, periodStats, walkTarget } from "../lib/stats";
import type { DaysMap, Settings } from "../lib/types";

interface Props {
  days: DaysMap;
  dates: string[];
  prevDates: string[];
  settings: Settings;
  /** Weekly mode shows targets (walking minutes, strength sessions); otherwise totals only. */
  weekly: boolean;
}

export function StatGrid({ days, dates, prevDates, settings, weekly }: Props) {
  const { t, lang } = useI18n();
  const s = periodStats(days, dates);
  const p = periodStats(days, prevDates);
  const ph = PHASES[settings.phase];
  const dW = s.avgWeight != null && p.avgWeight != null ? s.avgWeight - p.avgWeight : null;
  const walkTotal = s.walk + s.cardio;
  const wt = weekly ? walkTarget(settings.phase, dates[0], settings.startDate) : null;
  const pain = (["foot", "back", "shoulder"] as const).map((k) => s.painMax[k] ?? "—").join(" / ");

  return (
    <div className="stats">
      <div className="stat">
        <span className="label">{t("stat.weight")}</span>
        <span className="big">{fmt(s.avgWeight, lang)}</span>
        <span className="meta">
          {dW == null ? t("stat.weightNoPrev") : (
            <span className={dW <= 0 ? "delta-down" : "delta-up"}>
              {t("stat.weightDelta", { d: (dW > 0 ? "+" : dW < 0 ? "−" : "±") + fmt(Math.abs(dW), lang) })}
            </span>
          )}
          {" · "}{t("stat.weighIns", { n: s.weights.length })}
          {!weekly && s.weights.length > 1 && <> · {t("stat.weightRange", { min: fmt(s.minWeight, lang), max: fmt(s.maxWeight, lang) })}</>}
        </span>
      </div>
      <div className={"stat" + (settings.stepGoal != null && s.avgSteps != null && s.avgSteps >= settings.stepGoal ? " done" : "")}>
        <span className="label">{t("stat.steps")}</span>
        <span className="big">{fmtInt(s.avgSteps, lang)}</span>
        <span className="meta">
          {t("stat.stepDays", { n: s.steps.length })}
          {!weekly && <> · {t("stat.totalSteps").toLowerCase()} {fmtInt(s.totalSteps, lang)}</>}
        </span>
      </div>
      <div className={"stat" + (wt && walkTotal >= wt[0] ? " done" : "")}>
        <span className="label">{t("stat.walk")}</span>
        <span className="big">{walkTotal}</span>
        {wt && <div className="bar"><span style={{ width: Math.min(100, Math.round((walkTotal / wt[0]) * 100)) + "%" }} /></div>}
        <span className="meta">
          {wt && t("stat.walkTarget", { t: wt[0] === wt[1] ? wt[0] : wt[0] + "–" + wt[1] })}
          {s.walkMod > 0 && <>{wt ? " · " : ""}{t("stat.walkModerate", { n: s.walkMod })}</>}
        </span>
      </div>
      <div className={"stat" + (weekly && s.strengthDays >= ph.strength ? " done" : "")}>
        <span className="label">{t("stat.strength")}</span>
        <span className="big">{weekly ? `${s.strengthDays} ${t("common.of")} ${ph.strength}` : s.strengthDays}</span>
        {weekly && <div className="bar"><span style={{ width: Math.min(100, Math.round((s.strengthDays / ph.strength) * 100)) + "%" }} /></div>}
        <span className="meta">{t("stat.painMax", { p: pain })}</span>
      </div>
      {!weekly && (
        <div className="stat">
          <span className="label">{t("stat.logged")}</span>
          <span className="big">{s.logged} {t("common.of")} {s.days}</span>
        </div>
      )}
    </div>
  );
}
