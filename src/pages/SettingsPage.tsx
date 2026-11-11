import { useEffect, useRef, useState } from "react";
import { Head } from "../components/Head";
import { Stepper } from "../components/Stepper";
import { SyncBadge } from "../components/SyncBadge";
import { deleteAllDays, liveDays, saveDays, setSyncConfig, updateSettings, useSyncConfig } from "../db";
import { type MessageKey, useI18n } from "../i18n";
import { makeBackup, parseBackup } from "../lib/backup";
import { downloadFile } from "../lib/download";
import { num } from "../lib/format";
import { applySamsung, emptySamsung, parseSamsungFile } from "../lib/samsung";
import { syncNow } from "../sync/engine";
import { checkRepo, SyncError } from "../sync/github";
import type { DaysMap, Lang, Phase, Settings, Theme } from "../lib/types";
import { REMINDER_KINDS, SOURCE_KEYS } from "../lib/types";
import { APK_URL, askNotifications, isNative, notificationsAllowed } from "../native";

type Status = { text: string; kind?: "ok" | "err" };

export function SettingsPage({ days, settings }: { days: DaysMap; settings: Settings }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>({ text: "" });
  const [goal, setGoal] = useState(settings.stepGoal == null ? "" : String(settings.stepGoal));
  const fileRef = useRef<HTMLInputElement>(null);
  const samsungRef = useRef<HTMLInputElement>(null);
  const [samsung, setSamsung] = useState<Status>({ text: "" });
  const syncCfg = useSyncConfig();
  const [repo, setRepo] = useState("");
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncMsg, setSyncMsg] = useState<Status>({ text: "" });
  const [notifOk, setNotifOk] = useState(true);
  useEffect(() => { if (isNative) void notificationsAllowed().then(setNotifOk); }, []);
  const setReminder = (k: (typeof REMINDER_KINDS)[number], patch: Partial<{ on: boolean; time: string }>) =>
    updateSettings({ reminders: { ...settings.reminders, [k]: { ...settings.reminders[k], ...patch } } });
  const count = Object.keys(days).length;

  function saveGoal(v: string) {
    setGoal(v);
    const n = num(v);
    updateSettings({ stepGoal: n != null && n > 0 ? Math.round(n) : null });
  }

  async function exportJson() {
    const all = await liveDays();
    downloadFile(`fitnes-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(makeBackup(all, settings), null, 2), "application/json");
  }

  async function importJson(file: File) {
    try {
      const { days: imported, settings: s } = parseBackup(await file.text());
      const now = new Date().toISOString();
      // Imported records become the newest version, so sync pushes them.
      await saveDays(imported.map((d) => ({ ...d, updatedAt: now })));
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
    await deleteAllDays();
    setStatus({ text: t("settings.cleared"), kind: "ok" });
  }

  async function importSamsung(files: FileList) {
    const data = emptySamsung();
    let bad = 0;
    for (const file of Array.from(files)) {
      try { parseSamsungFile(await file.text(), data); } catch { bad += 1; }
    }
    if (samsungRef.current) samsungRef.current.value = "";
    if (!data.kinds.length) { setSamsung({ text: t("samsung.error"), kind: "err" }); return; }
    const { changes, counts } = applySamsung(days, data, settings.sources, (k) => t(`cardio.${k}` as MessageKey));
    await saveDays(changes);
    const skipped = data.kinds.filter((k) => !settings.sources[k]).map((k) => t(`src.${k}` as MessageKey).toLowerCase());
    const parts = [changes.length ? t("samsung.done2", counts) : t("samsung.nothing")];
    if (skipped.length) parts.push(t("samsung.skipped", { list: skipped.join(", ") }));
    if (bad) parts.push(t("samsung.badFiles", { n: bad }));
    setSamsung({ text: parts.join(" "), kind: "ok" });
  }

  async function connect() {
    const r = repo.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/+$/, "");
    if (!/^[\w.-]+\/[\w.-]+$/.test(r)) { setSyncMsg({ text: t("sync.badRepo"), kind: "err" }); return; }
    setConnecting(true);
    setSyncMsg({ text: t("sync.connecting") });
    try {
      await checkRepo(r, token.trim());
      await setSyncConfig({ provider: "github", repo: r, token: token.trim(), path: "fitnes-data.json" });
      setToken("");
      setSyncMsg({ text: "" });
      await syncNow();
    } catch (e) {
      const code = e instanceof SyncError ? e.code : "http";
      setSyncMsg({ text: t(`sync.err.${code}` as MessageKey), kind: "err" });
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    await setSyncConfig(null);
    await syncNow();
  }

  return (
    <>
      <header className="page-head"><h1>{t("settings.title")}</h1></header>

      <section className="block">
        <Head title={t("sync.title")} help={t("sync.intro")} />
        <SyncBadge detailed />
        {syncCfg ? (
          <>
            <p className="status" style={{ margin: 0 }}>{t("sync.connectedTo", { repo: syncCfg.repo })}</p>
            <div className="actions">
              <button type="button" onClick={() => void syncNow()}>{t("sync.now")}</button>
              <button type="button" className="danger" onClick={disconnect}>{t("sync.disconnect")}</button>
            </div>
          </>
        ) : (
          <>
            <Head as="label" title={null} helpLabel={t("help.sync.how")} help={(
              <ol className="steps-list">
                <li>{t("sync.step1")}</li>
                <li>{t("sync.step2")}</li>
                <li>{t("sync.step3")}</li>
              </ol>
            )} />
            <div className="fields one">
              <label className="field"><span>{t("sync.repo")}</span>
                <input type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="user/fitnes-data" value={repo} onChange={(e) => setRepo(e.target.value)} />
              </label>
              <label className="field"><span>{t("sync.token")}</span>
                <input type="password" autoComplete="off" placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
              </label>
            </div>
            <div className="actions">
              <button type="button" className="primary" onClick={connect} disabled={connecting || !repo.trim() || !token.trim()}>{t("sync.connect")}</button>
            </div>
          </>
        )}
        {syncMsg.text && <p className={"status " + (syncMsg.kind ?? "")} role="status">{syncMsg.text}</p>}
      </section>

      <section className="block">
        <Head title={t("remind.title")} help={<>{t("remind.help")} {isNative ? t("remind.widgetHint") : ""}</>} />
        {!isNative && (
          <>
            <p className="help-text">{t("remind.webOnly")}</p>
            <a className="btn primary block" href={APK_URL}>{t("remind.getApk")}</a>
          </>
        )}
        {isNative && !notifOk && (
          <>
            <p className="status err" style={{ margin: 0 }}>{t("remind.denied")}</p>
            <div className="actions"><button type="button" className="primary" onClick={() => void askNotifications().then(setNotifOk)}>{t("remind.allow")}</button></div>
          </>
        )}
        <div className="src-list">
          {REMINDER_KINDS.map((k) => {
            const r = settings.reminders[k];
            return (
              <div className="src-row" key={k}>
                <span>{t(`remind.${k}` as MessageKey)}</span>
                <div className="remind-ctl">
                  <div className="seg full" role="radiogroup" aria-label={t(`remind.${k}` as MessageKey)}>
                    <button type="button" role="radio" aria-checked={r.on} className={r.on ? "on" : ""} onClick={() => setReminder(k, { on: true })}>{t("remind.on")}</button>
                    <button type="button" role="radio" aria-checked={!r.on} className={!r.on ? "on" : ""} onClick={() => setReminder(k, { on: false })}>{t("remind.off")}</button>
                  </div>
                  <input type="time" aria-label={t("remind.time")} value={r.time} disabled={!r.on} onChange={(e) => e.target.value && setReminder(k, { time: e.target.value })} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="block">
        <Head title={t("src.title")} help={t("src.intro")} />
        <div className="src-list">
          {SOURCE_KEYS.map((k) => (
            <div className="src-row" key={k}>
              <span>{t(`src.${k}` as MessageKey)}</span>
              <div className="seg full" role="radiogroup" aria-label={t(`src.${k}` as MessageKey)}>
                <button type="button" role="radio" aria-checked={settings.sources[k]} className={settings.sources[k] ? "on" : ""} onClick={() => updateSettings({ sources: { ...settings.sources, [k]: true } })}>{t("src.samsung")}</button>
                <button type="button" role="radio" aria-checked={!settings.sources[k]} className={!settings.sources[k] ? "on" : ""} onClick={() => updateSettings({ sources: { ...settings.sources, [k]: false } })}>{t("src.manual")}</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="block">
        <Head title={t("samsung.title")} help={t("samsung.intro")} />
        <Head as="label" title={null} helpLabel={t("help.samsung.how")} help={(
          <ol className="steps-list">
            <li>{t("samsung.step1")}</li>
            <li>{t("samsung.step2")}</li>
          </ol>
        )} />
        <div className="actions">
          <button type="button" onClick={() => samsungRef.current?.click()}>{t("samsung.pick")}</button>
          <input ref={samsungRef} type="file" accept=".csv,text/csv,text/comma-separated-values" multiple hidden onChange={(e) => e.target.files?.length && importSamsung(e.target.files)} />
        </div>
        {samsung.text && <p className={"status " + (samsung.kind ?? "")} role="status">{samsung.text}</p>}
      </section>

      <section className="block">
        <div className="fields two">
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
        <Head title={t("settings.program")} help={<>{t("settings.startHint")} {t("settings.stepGoalHint")}</>} />
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
        <div className="field"><Head as="label" title={t("settings.bpMark")} help={t("settings.bpMarkHint")} />
          <div className="fields two">
            <Stepper value={String(settings.bpMark.sys)} onChange={(v) => num(v) && updateSettings({ bpMark: { ...settings.bpMark, sys: num(v)! } })} step={5} min={90} max={200} label={t("form.bpSys")} />
            <Stepper value={String(settings.bpMark.dia)} onChange={(v) => num(v) && updateSettings({ bpMark: { ...settings.bpMark, dia: num(v)! } })} step={5} min={50} max={130} label={t("form.bpDia")} />
          </div>
        </div>
      </section>

      <section className="block">
        <Head title={t("settings.data")} help={t("settings.dataHint")} right={<span className="status num">{t("settings.count", { n: count })}</span>} />
        <div className="actions">
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
