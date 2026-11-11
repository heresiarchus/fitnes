import { useState } from "react";
import { Link } from "react-router-dom";
import { SyncBadge } from "../components/SyncBadge";
import { StatGrid } from "../components/StatGrid";
import { StepsChart } from "../components/StepsChart";
import { WeightChart } from "../components/WeightChart";
import { HabitsToday } from "../components/HabitsToday";
import { Head } from "../components/Head";
import { TasksCard } from "../components/TasksCard";
import { PeriodNav } from "../components/PeriodNav";
import { updateSettings } from "../db";
import { type MessageKey, useI18n } from "../i18n";
import { addDays, ddmm, iso, rangeDates, weekDates } from "../lib/date";
import { fmt, fmtInt } from "../lib/format";
import { periodStats } from "../lib/stats";
import type { DaysMap, Phase, Settings } from "../lib/types";

export function Overview({ days, settings }: { days: DaysMap; settings: Settings }) {
  const { t, lang } = useI18n();
  const td = days[iso(new Date())];
  const [offset, setOffset] = useState(0);
  const dates = weekDates(offset);
  const prev = weekDates(offset - 1);
  const flags = periodStats(days, dates).flags;
  const chartDates = rangeDates(iso(addDays(new Date(), -55)), 56);

  return (
    <>
      <header className="page-head">
        <h1>{t("app.title")}</h1>
        <SyncBadge />
      </header>

      <section className="today" aria-label={t("today.title")}>
        <div>
          <h2>{t("today.title")}</h2>
          <span className="today-date">{new Date().toLocaleDateString(lang === "uk" ? "uk-UA" : "en-GB", { weekday: "long", day: "numeric", month: "long" })}</span>
        </div>
        <ul className="today-items">
          {!settings.hideWeight && <li><span>{t("cal.day.weight")}</span><b>{td?.weight != null ? `${fmt(td.weight, lang)} ${t("common.kg")}` : t("today.none")}</b></li>}
          <li><span>{t("cal.day.steps")}</span><b>{td?.steps != null ? fmtInt(td.steps, lang) : t("today.none")}</b></li>
          <li><span>{t("cal.day.walk")}</span><b>{td?.walkMin ? `${td.walkMin} ${t("common.min")}` : t("today.none")}</b></li>
          <li><span>{t("form.feeling")}</span><b>{td?.flags?.length ? t("today.flags") : td?.ok ? t("today.ok") : t("today.none")}</b></li>
        </ul>
        <Link className="btn block" to="/log">{td ? t("today.more") : t("today.fill")}</Link>
      </section>

      <HabitsToday days={days} settings={settings} />
      <TasksCard />

      <section className="block" aria-label={t("week.title")}>
        <PeriodNav
          label={`${t("week.title")} ${ddmm(dates[0])}–${ddmm(dates[6])}`}
          offset={offset} onChange={setOffset}
          prevLabel={t("week.prev")} nextLabel={t("week.next")} nowLabel={t("week.now")}
        />
        <div className="phase">
          <div className="field">
            <Head as="label" title={t("phase.label")} help={t(`phase.${settings.phase}.note` as MessageKey)} />
            <select aria-label={t("phase.label")} value={settings.phase} onChange={(e) => updateSettings({ phase: e.target.value as Phase })}>
              {(["1", "2", "3"] as const).map((p) => <option key={p} value={p}>{t(`phase.${p}` as MessageKey)}</option>)}
            </select>
          </div>
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
        <Head title={t("chart.weight")} help={t("chart.weightLegend")} />
        <WeightChart days={days} dates={chartDates} />
      </section>

      <section className="block">
        <Head title={t("chart.steps")} help={settings.stepGoal != null ? t("chart.stepsLegend") : undefined} />
        <StepsChart days={days} dates={dates} goal={settings.stepGoal} />
      </section>
    </>
  );
}
