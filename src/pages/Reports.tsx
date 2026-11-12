import { useState } from "react";
import { Head } from "../components/Head";
import { HistoryCharts } from "../components/HistoryCharts";
import { PeriodNav } from "../components/PeriodNav";
import { StatGrid } from "../components/StatGrid";
import { StepsChart } from "../components/StepsChart";
import { WeightChart } from "../components/WeightChart";
import { useI18n } from "../i18n";
import { daysToCsv } from "../lib/csv";
import { ddmm, monthDates, weekDates } from "../lib/date";
import { monthName } from "../lib/format";
import { buildReport } from "../lib/report";
import type { DaysMap, Settings } from "../lib/types";
import { downloadFile } from "../lib/download";

type Kind = "week" | "month" | "all";

export function Reports({ days, settings }: { days: DaysMap; settings: Settings }) {
  const { t, lang } = useI18n();
  const [kind, setKind] = useState<Kind>("week");
  const [offset, setOffset] = useState(0);
  const [copyLabel, setCopyLabel] = useState(t("reports.copy"));
  const dates = kind === "week" ? weekDates(offset) : monthDates(offset);
  const prev = kind === "week" ? weekDates(offset - 1) : monthDates(offset - 1);
  const label = kind === "week"
    ? `${t("week.title")} ${ddmm(dates[0])}–${ddmm(dates[dates.length - 1])}`
    : monthName(dates[0], lang);
  const report = buildReport(days, dates, prev, settings.phase, t, lang, settings.habits);

  const switchKind = (k: Kind) => { setKind(k); setOffset(0); };

  async function copy() {
    try {
      await navigator.clipboard.writeText(report);
      setCopyLabel(t("reports.copied"));
    } catch {
      const ta = document.getElementById("report-text") as HTMLTextAreaElement | null;
      ta?.focus();
      ta?.select();
      setCopyLabel(t("reports.copyManual"));
    }
    setTimeout(() => setCopyLabel(t("reports.copy")), 2000);
  }

  function exportCsv() {
    const csv = daysToCsv(Object.values(days), t);
    downloadFile(`fitnes-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
  }

  return (
    <>
      <header className="page-head">
        <h1>{t("reports.title")}</h1>
        <div className="seg full no-print" role="tablist">
          {(["week", "month", "all"] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? "on" : ""} onClick={() => switchKind(k)}>
              {t(k === "week" ? "reports.week" : k === "month" ? "reports.month" : "hist.tab")}
            </button>
          ))}
        </div>
      </header>

      {kind === "all" ? <HistoryCharts days={days} /> : (<>
      <section className="block">
        <PeriodNav label={label} offset={offset} onChange={setOffset}
          prevLabel={t("common.prev")} nextLabel={t("common.next")} nowLabel={t("common.current")} />
        <StatGrid days={days} dates={dates} prevDates={prev} settings={settings} weekly={kind === "week"} />
      </section>

      <section className="block">
        <Head title={t("chart.weightPeriod")} sub={t("chart.weightLegend")} />
        <WeightChart days={days} dates={dates} />
      </section>

      <section className="block">
        <Head title={t("chart.steps")} sub={settings.stepGoal != null ? t("chart.stepsLegend") : undefined} />
        <StepsChart days={days} dates={dates} goal={settings.stepGoal} />
      </section>

      <section className="block">
        <Head title={t("reports.text")} />
        <textarea id="report-text" className="report" readOnly value={report} aria-label={t("reports.text")} rows={Math.min(30, report.split("\n").length + 1)} />
        <div className="actions no-print"><button type="button" className="primary" onClick={copy}>{copyLabel}</button></div>
      </section>

      </>)}

      <section className="block no-print">
        <Head title={t("reports.export")} />
        <div className="actions">
          <button type="button" onClick={exportCsv}>{t("reports.csv")}</button>
          <button type="button" onClick={() => window.print()}>{t("reports.print")}</button>
        </div>
      </section>
    </>
  );
}
