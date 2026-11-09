import { useState } from "react";
import { Link } from "react-router-dom";
import { SyncBadge } from "../components/SyncBadge";
import { StatGrid } from "../components/StatGrid";
import { StepsChart } from "../components/StepsChart";
import { WeightChart } from "../components/WeightChart";
import { PeriodNav } from "../components/PeriodNav";
import { updateSettings } from "../db";
import { type MessageKey, useI18n } from "../i18n";
import { addDays, ddmm, iso, rangeDates, weekDates } from "../lib/date";
import { periodStats } from "../lib/stats";
import type { DaysMap, Phase, Settings } from "../lib/types";

export function Overview({ days, settings }: { days: DaysMap; settings: Settings }) {
  const { t } = useI18n();
  const [offset, setOffset] = useState(0);
  const dates = weekDates(offset);
  const prev = weekDates(offset - 1);
  const flags = periodStats(days, dates).flags;
  const chartDates = rangeDates(iso(addDays(new Date(), -55)), 56);

  return (
    <>
      <header className="page-head">
        <h1>{t("app.title")}</h1>
        <p className="sub">{t("overview.intro")}</p>
        <SyncBadge />
        <div className="row" style={{ marginTop: 12 }}>
          <Link className="btn primary" to="/log">{t("overview.logToday")}</Link>
        </div>
      </header>

      <section className="block" aria-label={t("week.title")}>
        <PeriodNav
          label={`${t("week.title")} ${ddmm(dates[0])}–${ddmm(dates[6])}`}
          offset={offset} onChange={setOffset}
          prevLabel={t("week.prev")} nextLabel={t("week.next")} nowLabel={t("week.now")}
        />
        <div className="phase">
          <label className="field inline">
            <span>{t("phase.label")}</span>
            <select value={settings.phase} onChange={(e) => updateSettings({ phase: e.target.value as Phase })}>
              {(["1", "2", "3"] as const).map((p) => <option key={p} value={p}>{t(`phase.${p}` as MessageKey)}</option>)}
            </select>
          </label>
          <span className="phase-note">{t(`phase.${settings.phase}.note` as MessageKey)}</span>
        </div>
        <StatGrid days={days} dates={dates} prevDates={prev} settings={settings} weekly />
        {flags.length > 0 && (
          <div className="alert">
            <b>{t("overview.lastFlags")}:</b>{" "}
            {flags.map((f) => ddmm(f.date) + " " + t(`flag.${f.flag}` as MessageKey)).join("; ")}
          </div>
        )}
      </section>

      <section className="block">
        <div className="row between">
          <h2>{t("chart.weight")}</h2>
          <span className="status">{t("chart.weightLegend")}</span>
        </div>
        <WeightChart days={days} dates={chartDates} />
      </section>

      <section className="block">
        <div className="row between">
          <h2>{t("chart.steps")}</h2>
          {settings.stepGoal != null && <span className="status">{t("chart.stepsLegend")}</span>}
        </div>
        <StepsChart days={days} dates={dates} goal={settings.stepGoal} />
      </section>
    </>
  );
}
