import { useState } from "react";
import { deleteItem, newId, saveItem } from "../db";
import { useI18n } from "../i18n";
import { ddmm } from "../lib/date";
import type { DiaryItem } from "../lib/types";
import { Rating } from "./Rating";

/** Adds one diary entry: what happened and how good it was (0–10). */
export function DiaryAdd({ date, compact = false, initial = "" }: { date: string; compact?: boolean; initial?: string }) {
  const { t } = useI18n();
  const [text, setText] = useState(initial);
  const [rating, setRating] = useState(7);
  const [share, setShare] = useState(false);
  const [done, setDone] = useState(false);

  async function add() {
    const event = text.trim();
    if (!event) return;
    const now = new Date().toISOString();
    await saveItem({ id: newId("diary"), kind: "diary", date, event, rating, share, createdAt: now, updatedAt: now });
    setText(""); setRating(7); setDone(true);
    setTimeout(() => setDone(false), 2000);
  }

  return (
    <div className="ctx">
      <textarea className={compact ? "short" : ""} maxLength={500} value={text} placeholder={t("diary.eventPh")} aria-label={t("diary.event")}
        onChange={(e) => setText(e.target.value)} />
      <span className="sub-h">{t("diary.rating")}</span>
      <Rating value={rating} onChange={setRating} label={t("diary.rating")} />
      <div className="pill-row between">
        <label className="share-toggle"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />{t("diary.share")}</label>
        <button type="button" className="primary compact" disabled={!text.trim()} onClick={add}>{done ? "✓" : t("diary.add")}</button>
      </div>
    </div>
  );
}

const sortEntries = (a: DiaryItem, b: DiaryItem) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

/** Entries grouped by date, newest first, each with its rating. */
export function DiaryList({ entries, showDate = true }: { entries: DiaryItem[]; showDate?: boolean }) {
  const { t } = useI18n();
  const groups = new Map<string, DiaryItem[]>();
  for (const e of [...entries].sort(sortEntries)) groups.set(e.date, [...(groups.get(e.date) ?? []), e]);
  if (!groups.size) return null;
  return (
    <div>
      {[...groups].map(([date, list]) => (
        <div className="dgroup" key={date}>
          {showDate && <h3>{ddmm(date)}.{date.slice(0, 4)}</h3>}
          {list.map((e) => (
            <div className="dentry" key={e.id}>
              <span className="score">{e.rating ?? "—"}</span>
              <div>
                <p>{e.event}</p>
                {e.feeling && <small>{e.feeling}</small>}
                <label className="share-toggle"><input type="checkbox" checked={e.share} onChange={(ev) => saveItem({ ...e, share: ev.target.checked })} />{t("diary.share")}</label>
              </div>
              <button type="button" className="link" aria-label={t("common.delete")} onClick={() => confirm(t("diary.deleteConfirm")) && deleteItem(e)}>✕</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Plain-text report: dates, and under each date the events with their ratings. */
export function diaryReport(entries: DiaryItem[], from: string, to: string): string {
  const inRange = entries.filter((e) => e.date >= from && e.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const groups = new Map<string, DiaryItem[]>();
  for (const e of inRange) groups.set(e.date, [...(groups.get(e.date) ?? []), e]);
  return [...groups].map(([date, list]) =>
    `${ddmm(date)}.${date.slice(0, 4)}\n` + list.map((e) => `• ${e.event}${e.rating != null ? ` — ${e.rating}/10` : ""}${e.feeling ? ` (${e.feeling})` : ""}`).join("\n"),
  ).join("\n\n");
}
