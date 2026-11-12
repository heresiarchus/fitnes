import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "../components/Card";
import { DiaryAdd, DiaryList, diaryReport } from "../components/Diary";
import { useItems } from "../db";
import { useI18n } from "../i18n";
import { addDays, iso } from "../lib/date";
import { downloadFile } from "../lib/download";

export function DiaryPage() {
  const { t } = useI18n();
  const today = iso(new Date());
  const entries = useItems("diary") ?? [];
  const [params] = useSearchParams();
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState(iso(addDays(new Date(), -30)));
  const [to, setTo] = useState(today);
  const [copied, setCopied] = useState(false);
  const report = diaryReport(entries, from, to);

  async function copy() {
    try { await navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
  }

  return (
    <>
      <header className="page-head">
        <h1>{t("diary.title")}</h1>
        <p className="sub">{t("diary.intro")}</p>
      </header>

      <Card icon="diary" title={t("diary.new")}>
        <label className="field"><span>{t("form.date")}</span>
          <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <DiaryAdd key={date} date={date} initial={params.get("event") ?? ""} />
      </Card>

      <Card icon="diary" title={t("diary.entries")} status={{ text: String(entries.length) }}>
        {entries.length ? <DiaryList entries={entries} /> : <p className="empty">{t("diary.empty")}</p>}
      </Card>

      {entries.length > 0 && (
        <Card icon="data" title={t("diary.report")} sub={t("diary.reportSub")}>
          <div className="fields two">
            <label className="field"><span>{t("diary.from")}</span><input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
            <label className="field"><span>{t("diary.to")}</span><input type="date" value={to} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
          </div>
          {report ? <textarea className="report" readOnly value={report} rows={Math.min(16, report.split("\n").length + 1)} aria-label={t("diary.report")} /> : <p className="empty">{t("diary.empty")}</p>}
          <div className="actions">
            <button type="button" disabled={!report} onClick={copy}>{copied ? t("reports.copied") : t("diary.copy")}</button>
            <button type="button" disabled={!report} onClick={() => downloadFile(`diary-${from}-${to}.txt`, report, "text/plain;charset=utf-8")}>{t("diary.download")}</button>
          </div>
        </Card>
      )}
    </>
  );
}
