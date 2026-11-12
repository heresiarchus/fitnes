import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Head } from "../components/Head";
import { deleteItem, newId, saveItem, useItems } from "../db";
import { type MessageKey, useI18n } from "../i18n";
import { addDays, ddmm, iso } from "../lib/date";
import { downloadFile } from "../lib/download";
import type { DiaryItem } from "../lib/types";
import { DIARY_TAGS } from "../lib/types";

/** Plain-text diary for a period, oldest first — to show a therapist. */
export function diaryText(entries: DiaryItem[], from: string, to: string, labels: { event: string; feeling: string }): string {
  return entries
    .filter((e) => e.date >= from && e.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((e) => `${ddmm(e.date)}.${e.date.slice(0, 4)}\n${labels.event}: ${e.event}${e.feeling ? `\n${labels.feeling}: ${e.feeling}` : ""}`)
    .join("\n\n");
}

export function DiaryPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const today = iso(new Date());
  const entries = useItems("diary") ?? [];
  const [date, setDate] = useState(today);
  const [event, setEvent] = useState(params.get("event") ?? "");
  const [feeling, setFeeling] = useState("");
  const [tag, setTag] = useState("");
  const [share, setShare] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind?: "ok" | "err" }>({ text: "" });
  const [from, setFrom] = useState(iso(addDays(new Date(), -30)));
  const [to, setTo] = useState(today);
  const [copied, setCopied] = useState(false);
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const text = diaryText(entries, from, to, { event: t("diary.event"), feeling: t("diary.feeling") });

  async function add() {
    const ev = event.trim();
    if (!ev) { setMsg({ text: t("diary.needEvent"), kind: "err" }); return; }
    const now = new Date().toISOString();
    await saveItem({ id: newId("diary"), kind: "diary", date, event: ev, ...(feeling.trim() ? { feeling: feeling.trim() } : {}), ...(tag ? { tag } : {}), share, createdAt: now, updatedAt: now });
    setEvent(""); setFeeling(""); setTag(""); setShare(false);
    if (params.get("event")) setParams({}, { replace: true });
    setMsg({ text: t("diary.saved"), kind: "ok" });
  }

  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
  }

  return (
    <>
      <header className="page-head">
        <h1>{t("diary.title")}</h1>
        <p className="sub">{t("diary.intro")}</p>
      </header>

      <section className="block">
        <Head title={t("diary.save")} help={t("diary.help")} />
        <label className="field"><span>{t("form.date")}</span>
          <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <label className="field"><span>{t("diary.event")}</span>
          <textarea maxLength={1000} value={event} onChange={(e) => { setEvent(e.target.value); setMsg({ text: "" }); }} />
        </label>
        <label className="field"><span>{t("diary.feeling")}</span>
          <textarea maxLength={1000} value={feeling} onChange={(e) => setFeeling(e.target.value)} />
        </label>
        <div className="field"><span>{t("diary.tag")}</span>
          <div className="tag-row" role="radiogroup" aria-label={t("diary.tag")}>
            {DIARY_TAGS.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={tag === k} className={"chip" + (tag === k ? " on" : "")} onClick={() => setTag(tag === k ? "" : k)}>{t(`diary.tag.${k}` as MessageKey)}</button>
            ))}
          </div>
        </div>
        <label className="check-line"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> {t("diary.share")}</label>
        <div className="actions"><button type="button" className="primary" onClick={add}>{t("diary.save")}</button></div>
        {msg.text && <span className={"status " + (msg.kind ?? "")} role="status">{msg.text}</span>}
      </section>

      <section className="block">
        {!sorted.length ? <p className="empty">{t("diary.empty")}</p> : (
          <ul className="diary">
            {sorted.map((e) => (
              <li key={e.id}>
                <div className="diary-head">
                  <b className="num">{ddmm(e.date)}.{e.date.slice(0, 4)}</b>
                  {e.tag && <span className="tag">{t(`diary.tag.${e.tag}` as MessageKey)}</span>}
                  {e.share && <span className="tag">{t("diary.shared")}</span>}
                  <button type="button" className="link" onClick={() => confirm(t("form.deleteConfirm", { d: ddmm(e.date) })) && deleteItem(e)}>{t("common.delete")}</button>
                </div>
                <p>{e.event}</p>
                {e.feeling && <p className="feeling">{e.feeling}</p>}
                <label className="check-line small"><input type="checkbox" checked={e.share} onChange={(ev) => saveItem({ ...e, share: ev.target.checked })} /> {t("diary.share")}</label>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sorted.length > 0 && (
        <section className="block">
          <Head title={t("diary.export")} help={t("diary.exportHelp")} />
          <div className="fields two">
            <label className="field"><span>{t("diary.from")}</span><input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
            <label className="field"><span>{t("diary.to")}</span><input type="date" value={to} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
          </div>
          <div className="actions">
            <button type="button" disabled={!text} onClick={() => downloadFile(`diary-${from}-${to}.txt`, text, "text/plain;charset=utf-8")}>{t("diary.download")}</button>
            <button type="button" disabled={!text} onClick={copy}>{copied ? t("reports.copied") : t("diary.copy")}</button>
          </div>
        </section>
      )}
    </>
  );
}
