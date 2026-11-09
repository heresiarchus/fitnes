import { useRef, useState } from "react";
import { db, updateSettings } from "../db";
import { type MessageKey, useI18n } from "../i18n";
import { makeBackup, parseBackup } from "../lib/backup";
import { downloadFile } from "../lib/download";
import { num } from "../lib/format";
import type { DaysMap, Lang, Phase, Settings, Theme } from "../lib/types";

type Status = { text: string; kind?: "ok" | "err" };

export function SettingsPage({ days, settings }: { days: DaysMap; settings: Settings }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>({ text: "" });
  const [goal, setGoal] = useState(settings.stepGoal == null ? "" : String(settings.stepGoal));
  const fileRef = useRef<HTMLInputElement>(null);
  const count = Object.keys(days).length;

  function saveGoal(v: string) {
    setGoal(v);
    const n = num(v);
    updateSettings({ stepGoal: n != null && n > 0 ? Math.round(n) : null });
  }

  async function exportJson() {
    const all = await db.days.toArray();
    downloadFile(`fitnes-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(makeBackup(all, settings), null, 2), "application/json");
  }

  async function importJson(file: File) {
    try {
      const { days: imported, settings: s } = parseBackup(await file.text());
      await db.days.bulkPut(imported);
      if (s) {
        const patch: Partial<Settings> = {};
        if (s.phase && ["1", "2", "3"].includes(String(s.phase))) patch.phase = String(s.phase) as Phase;
        if (typeof s.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.startDate)) patch.startDate = s.startDate;
        if (s.stepGoal === null || typeof s.stepGoal === "number") patch.stepGoal = s.stepGoal;
        await updateSettings(patch);
      }
      setStatus({ text: t("settings.imported", { n: imported.length }), kind: "ok" });
    } catch (e) {
      setStatus({ text: t("settings.importError", { e: (e as Error).message }), kind: "err" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function clearAll() {
    if (!confirm(t("settings.clearConfirm"))) return;
    await db.days.clear();
    setStatus({ text: t("settings.cleared"), kind: "ok" });
  }

  return (
    <>
      <header className="page-head"><h1>{t("settings.title")}</h1></header>

      <section className="block">
        <div className="fields">
          <label className="field"><span>{t("settings.lang")}</span>
            <select value={settings.lang} onChange={(e) => updateSettings({ lang: e.target.value as Lang })}>
              <option value="uk">Українська</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="field"><span>{t("settings.theme")}</span>
            <select value={settings.theme} onChange={(e) => updateSettings({ theme: e.target.value as Theme })}>
              {(["auto", "light", "dark"] as const).map((th) => <option key={th} value={th}>{t(`settings.theme.${th}` as MessageKey)}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="block">
        <h2>{t("settings.program")}</h2>
        <div className="fields">
          <label className="field"><span>{t("phase.label")}</span>
            <select value={settings.phase} onChange={(e) => updateSettings({ phase: e.target.value as Phase })}>
              {(["1", "2", "3"] as const).map((p) => <option key={p} value={p}>{t(`phase.${p}` as MessageKey)}</option>)}
            </select>
          </label>
          <label className="field"><span>{t("settings.startDate")}</span>
            <input type="date" value={settings.startDate} onChange={(e) => e.target.value && updateSettings({ startDate: e.target.value })} />
          </label>
          <label className="field"><span>{t("settings.stepGoal")}</span>
            <input type="number" min={0} step={500} inputMode="numeric" value={goal} onChange={(e) => saveGoal(e.target.value)} />
          </label>
        </div>
        <p className="status" style={{ margin: 0 }}>{t("settings.startHint")} {t("settings.stepGoalHint")}</p>
      </section>

      <section className="block">
        <div className="row between">
          <h2>{t("settings.data")}</h2>
          <span className="status num">{t("settings.count", { n: count })}</span>
        </div>
        <p className="status" style={{ margin: 0 }}>{t("settings.dataHint")}</p>
        <div className="row">
          <button type="button" onClick={exportJson}>{t("settings.backup")}</button>
          <button type="button" onClick={() => fileRef.current?.click()}>{t("settings.import")}</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          <button type="button" className="danger" onClick={clearAll} disabled={!count}>{t("settings.clear")}</button>
        </div>
        {status.text && <p className={"status " + (status.kind ?? "")} role="status">{status.text}</p>}
      </section>
    </>
  );
}
