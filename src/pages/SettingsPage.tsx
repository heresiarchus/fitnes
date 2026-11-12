import { useEffect, useRef, useState } from "react";
import { Head } from "../components/Head";
import { HabitEditor } from "../components/HabitEditor";
import { Stepper } from "../components/Stepper";
import { SyncBadge } from "../components/SyncBadge";
import { Link, useParams } from "react-router-dom";
import { SettingsMenu } from "./SettingsMenu";
import { deleteAllDays, liveDays, newId, saveDays, saveItems, setSheetsConfig, setSyncConfig, updateSettings, useHealthState, useSheetsConfig, useSyncConfig } from "../db";
import { parseHistory } from "../lib/history";
import { connectHealth, diagnoseHealth, disconnectHealth, HISTORY_DAYS, openHealthSettings, pullHealth, todaySteps, type TypeReport } from "../health";
import { makePairCode, readPairCode } from "../sync/pair";
import { GOAL_DEFS } from "../lib/goals";
import { type NearbyDevice, scanNearby } from "../scale";
import { isScriptUrl } from "../lib/sheets";
import { sendSheets } from "../sync/sheets";
import sheetsScript from "../../docs/google-sheets-script.gs?raw";
import { type MessageKey, useI18n } from "../i18n";
import { makeBackup, parseBackup } from "../lib/backup";
import { downloadFile } from "../lib/download";
import { num } from "../lib/format";
import { applySamsung, emptySamsung, parseSamsungFile } from "../lib/samsung";
import { syncNow } from "../sync/engine";
import { checkRepo, SyncError } from "../sync/github";
import type { DaysMap, Lang, Phase, Settings, Theme } from "../lib/types";
import { fromWatch, PALETTES, type Palette, type ReminderKind, SOURCE_KEYS } from "../lib/types";

/** Light accent, light tint, dark accent, dark surface — shown on each style card. */
const PAL_SWATCH: Record<Palette, string[]> = {"mint": ["#0f766e", "#d6f1ea", "#5eead4", "#171b1b"],
   "steel": ["#1d4ed8", "#dde7fd", "#93b4ff", "#161a21"],
   "sand": ["#b4532a", "#f6e1d5", "#f0a27c", "#1d1915"],
   "graphite": ["#111111", "#e2e2e2", "#ffffff", "#121212"],
   "gold": ["#9a6a00", "#faf1db", "#e9c46a", "#1f1c14"],
   "lavender": ["#6d28d9", "#e7dbfa", "#c4b5fd", "#18161d"],
   "forest": ["#047857", "#dbfaef", "#6ee7b7", "#161d1a"],
   "ocean": ["#0e7490", "#dbf4fa", "#67e8f9", "#161c1d"],
   "rose": ["#be185d", "#fadbeb", "#f9a8d4", "#1d161a"],
   "coral": ["#c2410c", "#fae4db", "#fdba74", "#1e1815"],
   "olive": ["#4d7c0f", "#edfadb", "#bef264", "#1a1d16"],
   "indigo": ["#4338ca", "#dbdffa", "#a5b4fc", "#16171d"]};
import { APK_URL, askNotifications, isNative, newerShell, notificationsAllowed } from "../native";
import { checkForUpdate } from "../components/PwaPrompt";

type Status = { text: string; kind?: "ok" | "err" };

/** Explanations that belong to a whole settings category, shown behind "?" next to its title. */
const CAT_HELP: Record<string, MessageKey> = {
  goals: "goals.help", reminders: "remind.how", sources: "src.intro", habits: "habit.manageHelp", data: "settings.dataHint",
};

export function SettingsPage({ days, settings }: { days: DaysMap; settings: Settings }) {
  const { t } = useI18n();
  const { cat } = useParams();
  const [status, setStatus] = useState<Status>({ text: "" });
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
  const setReminder = (k: ReminderKind, patch: Partial<{ on: boolean; time: string; until: string; every: number }>) =>
    updateSettings({ reminders: { ...settings.reminders, [k]: { ...settings.reminders[k], ...patch } } });
  const count = Object.keys(days).length;

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
    // An explicit file import applies everything in the file unless the watch is connected and a metric is set to manual.
    const all = { steps: true, exercise: true, weight: true, bp: true, sleep: true };
    const src = settings.healthLinked ? settings.sources : all;
    const { changes, counts } = applySamsung(days, data, src, (k) => t(`cardio.${k}` as MessageKey));
    await saveDays(changes);
    const skipped = data.kinds.filter((k) => !src[k]).map((k) => t(`src.${k}` as MessageKey).toLowerCase());
    const parts = [changes.length ? t("samsung.done2", counts) : t("samsung.nothing")];
    if (skipped.length) parts.push(t("samsung.skipped", { list: skipped.join(", ") }));
    if (bad) parts.push(t("samsung.badFiles", { n: bad }));
    setSamsung({ text: parts.join(" "), kind: "ok" });
  }

  const [shell, setShell] = useState<string | null>(null);
  const [verMsg, setVerMsg] = useState("");
  useEffect(() => { void newerShell().then(setShell); }, []);
  const built = new Date(__BUILD_TIME__).toLocaleString(settings.lang === "uk" ? "uk-UA" : "en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const health = useHealthState();
  const [hcMsg, setHcMsg] = useState<Status>({ text: "" });
  const [diag, setDiag] = useState<TypeReport[] | null>(null);
  const [nearby, setNearby] = useState<NearbyDevice[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const fmtKg = (kg: number) => (Math.round(kg * 10) / 10).toFixed(1).replace(".", settings.lang === "uk" ? "," : ".");
  const [steps, setSteps] = useState<{ samsung: number | null; merged: number } | null>(null);
  async function hcConnect() {
    setHcMsg({ text: "…" });
    const r = await connectHealth();
    setHcMsg(r === "ok" ? { text: "" } : { text: t(`hc.res.${r}` as MessageKey), kind: "err" });
  }
  const hcTime = health?.lastPullAt ? new Date(health.lastPullAt).toLocaleString(settings.lang === "uk" ? "uk-UA" : "en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
  const sheets = useSheetsConfig();
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetMsg, setSheetMsg] = useState<Status>({ text: "" });
  const [scriptCopied, setScriptCopied] = useState(false);
  async function sendNow() {
    setSheetMsg({ text: "…" });
    const r = await sendSheets();
    setSheetMsg({ text: t(`sheets.res.${r === "off" ? "error" : r}` as MessageKey), kind: r === "ok" ? "ok" : r === "error" || r === "off" ? "err" : undefined });
  }
  async function connectSheets() {
    const url = sheetUrl.trim();
    if (!isScriptUrl(url)) { setSheetMsg({ text: t("sheets.badUrl"), kind: "err" }); return; }
    await setSheetsConfig({ url });
    setSheetUrl("");
    await sendNow();
  }
  async function copyScript() {
    try { await navigator.clipboard.writeText(sheetsScript); setScriptCopied(true); setTimeout(() => setScriptCopied(false), 2500); }
    catch { downloadFile("google-sheets-script.txt", sheetsScript, "text/plain;charset=utf-8"); }
  }
  const sheetTime = sheets?.lastSentAt ? new Date(sheets.lastSentAt).toLocaleString(settings.lang === "uk" ? "uk-UA" : "en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;

  const histRef = useRef<HTMLInputElement>(null);
  async function importHistory(files: FileList) {
    let w = 0, m = 0, bad = 0;
    let current = days;
    for (const file of Array.from(files)) {
      try {
        const r = parseHistory(await file.text(), current);
        await saveDays(r.days);
        await saveItems(r.months);
        current = { ...current, ...Object.fromEntries(r.days.map((d) => [d.date, d])) };
        w += r.days.length; m += r.months.length;
      } catch { bad += 1; }
    }
    if (histRef.current) histRef.current.value = "";
    setStatus(bad && !w && !m ? { text: t("hist.importError"), kind: "err" } : { text: t("hist.imported", { w, m }), kind: "ok" });
  }

  const addHabit = () =>
    updateSettings({ habits: [...settings.habits, { id: newId("habit"), title: t("hb.newTitle"), minVersion: "", enabled: true, activeFrom: new Date().toISOString().slice(0, 10), remind: null, measure: { type: "count", unit: "раз", min: 0, max: 100, step: 1 } }] });

  const pair = readPairCode(token);
  async function copyPairCode() {
    if (!syncCfg) return;
    const code = makePairCode(syncCfg.repo, syncCfg.token);
    try { await navigator.clipboard.writeText(code); setSyncMsg({ text: t("sync.codeCopied"), kind: "ok" }); }
    catch { window.prompt(t("sync.copyCode"), code); }
  }

  async function connect() {
    if (pair) { await connectWith(pair.repo, pair.token); return; }
    await connectWith(repo, token.trim());
  }

  async function connectWith(repoIn: string, tokenIn: string) {
    const r = repoIn.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/+$/, "");
    if (!/^[\w.-]+\/[\w.-]+$/.test(r)) { setSyncMsg({ text: t("sync.badRepo"), kind: "err" }); return; }
    setConnecting(true);
    setSyncMsg({ text: t("sync.connecting") });
    try {
      await checkRepo(r, tokenIn);
      await setSyncConfig({ provider: "github", repo: r, token: tokenIn, path: "fitnes-data.json" });
      setRepo("");
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

  if (!cat) return <SettingsMenu settings={settings} syncOn={!!syncCfg} sheetsOn={!!sheets} />;
  const catTitle = t(`cat.${cat}` as MessageKey);
  return (
    <>
      <header className="page-head">
        <Link className="back" to="/settings">‹ {t("nav.settings")}</Link>
        <Head as="h1" title={catTitle} help={CAT_HELP[cat] ? t(CAT_HELP[cat]) : undefined} />
      </header>
      {cat === "connect" && (
        <>
      <section className="block">
        <Head title={t("sync.title")} />
        <SyncBadge detailed />
        {syncCfg ? (
          <>
            <p className="status" style={{ margin: 0 }}>{t("sync.connectedTo", { repo: syncCfg.repo })}</p>
            <div className="actions">
              <button type="button" onClick={() => void syncNow()}>{t("sync.now")}</button>
              <button type="button" onClick={copyPairCode}>{t("sync.copyCode")}</button>
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
              <div className="field">
                <Head as="label" title={t("sync.code")} help={t("sync.codeHelp")} />
                <input type="password" autoComplete="off" aria-label={t("sync.code")} placeholder={t("sync.codePh")} value={token} onChange={(e) => setToken(e.target.value)} />
              </div>
              {pair ? <span className="status ok">{t("sync.repoFromCode", { repo: pair.repo })}</span> : (
                <label className="field"><span>{t("sync.repo")}</span>
                  <input type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="heresiarchus/fitnes-data" value={repo} onChange={(e) => setRepo(e.target.value)} />
                </label>
              )}
            </div>
            <div className="actions">
              <button type="button" className="primary" onClick={connect} disabled={connecting || !token.trim() || (!pair && !repo.trim())}>{t("sync.connect")}</button>
            </div>
          </>
        )}
        {syncMsg.text && <p className={"status " + (syncMsg.kind ?? "")} role="status">{syncMsg.text}</p>}
      </section>
      <section className="block">
        <Head title={t("hc.title")} />
        {isNative ? (
          <>
            <span className={"status" + (health?.lastError ? " err" : health?.on ? " ok" : "")} role="status">
              {!health?.on ? t("hc.state.off") : health.lastError ? t("hc.state.error", { e: health.lastError }) : hcTime ? t("hc.state.on", { t: hcTime, n: health.lastCount ?? 0 }) : t("hc.state.never")}
            </span>
            <Head as="label" title={null} helpLabel={t("hc.how")} help={(
              <><p style={{ margin: "0 0 8px" }}>{t("hc.what")}</p><ol className="steps-list"><li>{t("hc.step1")}</li><li>{t("hc.step2")}</li><li>{t("hc.step3")}</li></ol></>
            )} />
            <div className="actions">
              {health?.on ? (
                <>
                  <button type="button" className="primary" onClick={() => { setHcMsg({ text: "…" }); void pullHealth(30).then((n) => setHcMsg({ text: t("hc.pulled", { n }), kind: "ok" })); }}>{t("hc.pullNow")}</button>
                  <button type="button" onClick={() => { setHcMsg({ text: t("hc.historyLoading") }); void connectHealth().then(() => pullHealth(HISTORY_DAYS)).then((n) => setHcMsg({ text: t("hc.pulled", { n }), kind: "ok" })); }}>{t("hc.history")}</button>
                  <button type="button" onClick={() => { setDiag(null); void diagnoseHealth().then(setDiag); void todaySteps().then(setSteps).catch(() => setSteps(null)); }}>{t("hc.diag")}</button>
                  <button type="button" onClick={() => void openHealthSettings()}>{t("hc.permissions")}</button>
                  <button type="button" className="danger" onClick={() => void disconnectHealth()}>{t("hc.disconnect")}</button>
                </>
              ) : <button type="button" className="primary" onClick={hcConnect}>{t("hc.connect")}</button>}
            </div>
            {hcMsg.text && <span className={"status " + (hcMsg.kind ?? "")} role="status">{hcMsg.text}</span>}
            {diag && (
              <div className="diag">
                <b>{t("hc.diagTitle")}</b>
                <ul className="plain">
                  {diag.map((r) => (
                    <li key={r.type} className={!r.granted || r.error || !r.count ? "bad" : "good"}>
                      <span>{t(`hc.diag.type.${r.type}` as MessageKey)}</span>
                      <span>{!r.granted ? t("hc.diag.noPerm") : r.error ? r.error : !r.count ? t("hc.diag.none") : t("hc.diag.count", { n: r.count, d: (r.last ?? "").slice(0, 10) })}
                        {r.sources.length > 0 && <small>{t("hc.diag.from", { s: r.sources.join(", ") })}</small>}</span>
                    </li>
                  ))}
                </ul>
                {steps && <p style={{ margin: 0, fontWeight: 650 }}>{t("hc.todaySteps", { sh: steps.samsung ?? "—", all: steps.merged })}</p>}
                {steps && steps.samsung != null && steps.merged < steps.samsung && <p className="help-text">{t("hc.priority")}</p>}
                <p className="status" style={{ margin: 0 }}>{t("hc.diag.hint")}</p>
              </div>
            )}
          </>
        ) : <p className="help-text">{t("hc.webOnly")}</p>}
        <details>
          <summary>{t("hc.fileImport")}</summary>
          <div className="ctx">
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
          </div>
        </details>
      </section>
      <section className="block">
        <Head title={t("sheets.title")} help={t("sheets.help")} />
        <span className={"status" + (sheets?.lastError ? " err" : sheets?.lastSentAt ? " ok" : "")} role="status">
          {!sheets ? t("sheets.state.off") : sheets.lastError ? t("sheets.state.error", { e: sheets.lastError }) : sheetTime ? t("sheets.state.sent", { t: sheetTime }) : t("sheets.state.never")}
        </span>
        {sheets ? (
          <div className="actions">
            <button type="button" className="danger" onClick={() => { void setSheetsConfig(null); setSheetMsg({ text: "" }); }}>{t("sheets.disconnect")}</button>
          </div>
        ) : (
          <>
            <Head as="label" title={null} helpLabel={t("sheets.how")} help={(
              <ol className="steps-list">
                <li>{t("sheets.step1")}</li>
                <li>{t("sheets.step2")}</li>
                <li>{t("sheets.step3")}</li>
                <li>{t("sheets.step4")}</li>
              </ol>
            )} />
            <div className="actions"><button type="button" onClick={copyScript}>{scriptCopied ? t("reports.copied") : t("sheets.copyScript")}</button></div>
            <label className="field"><span>{t("sheets.url")}</span>
              <input type="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://script.google.com/macros/s/…/exec" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} />
            </label>
            <div className="actions"><button type="button" className="primary" onClick={connectSheets} disabled={!sheetUrl.trim()}>{t("sheets.connect")}</button></div>
          </>
        )}
        {sheetMsg.text && <span className={"status " + (sheetMsg.kind ?? "")} role="status">{sheetMsg.text}</span>}
      </section>
      <section className="block">
        <Head title={t("scale.title")} help={t("scale.help")} />
        {isNative ? (
          <>
            <div className="actions"><button type="button" onClick={() => { setNearby(null); setScanning(true); void scanNearby().then((d) => { setNearby(d); setScanning(false); }).catch(() => setScanning(false)); }} disabled={scanning}>{scanning ? t("scale.scanning") : t("scale.check")}</button></div>
            {nearby && (nearby.length ? (
              <ul className="plain dev-list">
                {nearby.slice(0, 12).map((d) => (
                  <li key={d.id} className={d.reading ? "good" : ""}>
                    <b>{d.name || t("scale.noName")}</b>
                    <small>{d.reading ? t("scale.found", { kg: fmtKg(d.reading.kg), v: d.reading.variant }) : d.companies.join(" ") || "—"}{d.rssi != null ? ` · ${d.rssi} dBm` : ""}</small>
                  </li>
                ))}
              </ul>
            ) : <p className="status">{t("scale.none")}</p>)}
          </>
        ) : <p className="help-text">{t("scale.webOnly")}</p>}
      </section>
        </>
      )}
      {cat === "sources" && (
        <>
      <section className="block">
        {!settings.healthLinked && <p className="help-text">{isNative ? t("hc.linkFirst") : t("hc.linkFirstWeb")}</p>}
        <div className={"src-list" + (settings.healthLinked ? "" : " locked")}>
          {SOURCE_KEYS.map((k) => (
            <div className="src-row" key={k}>
              <span>{t(`src.${k}` as MessageKey)}</span>
              <div className="seg full" role="radiogroup" aria-label={t(`src.${k}` as MessageKey)}>
                <button type="button" role="radio" disabled={!settings.healthLinked} aria-checked={fromWatch(settings, k)} className={fromWatch(settings, k) ? "on" : ""} onClick={() => updateSettings({ sources: { ...settings.sources, [k]: true } })}>{t("src.samsung")}</button>
                <button type="button" role="radio" disabled={!settings.healthLinked} aria-checked={!fromWatch(settings, k)} className={!fromWatch(settings, k) ? "on" : ""} onClick={() => updateSettings({ sources: { ...settings.sources, [k]: false } })}>{t("src.manual")}</button>
              </div>
            </div>
          ))}
        </div>
      </section>
        </>
      )}
      {cat === "reminders" && (
        <>
      <section className="block">
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
        {(() => {
          const ev = settings.reminders.evening;
          const onOff = (on: boolean, set: (v: boolean) => void, label: string) => (
            <div className="seg full" role="radiogroup" aria-label={label}>
              <button type="button" role="radio" aria-checked={on} className={on ? "on" : ""} onClick={() => set(true)}>{t("remind.on")}</button>
              <button type="button" role="radio" aria-checked={!on} className={!on ? "on" : ""} onClick={() => set(false)}>{t("remind.off")}</button>
            </div>
          );
          return (
            <>
              {isNative && <p className="status" style={{ margin: 0 }}>{t("remind.widgetHint")}</p>}
              <span className="sub-h">{t("remind.evening")}</span>
              {onOff(ev.on, (v) => setReminder("evening", { on: v }), t("remind.evening"))}
              <div className="fields three">
                <label className="field"><span>{t("remind.from")}</span>
                  <input type="time" value={ev.time} disabled={!ev.on} onChange={(e) => e.target.value && setReminder("evening", { time: e.target.value })} />
                </label>
                <label className="field"><span>{t("remind.until")}</span>
                  <input type="time" value={ev.until ?? ""} disabled={!ev.on} onChange={(e) => e.target.value && setReminder("evening", { until: e.target.value })} />
                </label>
                <label className="field"><span>{t("remind.every")}</span>
                  <select value={ev.every ?? 5} disabled={!ev.on} onChange={(e) => setReminder("evening", { every: Number(e.target.value) })}>
                    {[5, 10, 15, 30].map((m) => <option key={m} value={m}>{m} {t("common.min")}</option>)}
                  </select>
                </label>
              </div>
              <span className="sub-h">{t("remind.includeBp")}</span>
              {onOff(settings.reminders.bp.on, (v) => setReminder("bp", { on: v }), t("remind.includeBp"))}
              <span className="sub-h">{t("remind.review")}</span>
              <div className="remind-ctl">
                {onOff(settings.reminders.review.on, (v) => setReminder("review", { on: v }), t("remind.review"))}
                <input type="time" aria-label={t("remind.time")} value={settings.reminders.review.time} disabled={!settings.reminders.review.on} onChange={(e) => e.target.value && setReminder("review", { time: e.target.value })} />
              </div>
            </>
          );
        })()}
      </section>
        </>
      )}
      {cat === "habits" && (
        <>
      <section className="block">
        <div className="ex-list">
          {settings.habits.map((h) => (
            <details className="ex-card" key={h.id}>
              <summary>
                <span className="ex-name"><b>{h.title || t("habit.name")}</b></span>
                <span className={"ex-sum" + (h.enabled ? " set" : "")}>{t(h.enabled ? "habit.on" : "habit.off")}</span>
              </summary>
              <HabitEditor habit={h} onSave={(nh) => updateSettings({ habits: settings.habits.map((x) => (x.id === h.id ? nh : x)) })}
                onDelete={h.id.startsWith("habit-") ? () => updateSettings({ habits: settings.habits.filter((x) => x.id !== h.id) }) : undefined} />
            </details>
          ))}
        </div>
        <button type="button" className="link" onClick={addHabit}>{t("habit.add")}</button>
      </section>
        </>
      )}
      {cat === "look" && (
        <>
      <section className="block">
        <span className="sub-h">{t("settings.theme")}</span>
        <div className="seg full" role="radiogroup" aria-label={t("settings.theme")}>
          {(["light", "dark", "auto"] as const).map((th) => (
            <button key={th} type="button" role="radio" aria-checked={settings.theme === th} className={settings.theme === th ? "on" : ""} onClick={() => updateSettings({ theme: th as Theme })}>{t(`settings.theme.${th}` as MessageKey)}</button>
          ))}
        </div>
        <span className="sub-h">{t("pal.title")}</span>
        <div className="pal-grid">
          {PALETTES.map((p) => (
            <button key={p} type="button" className={"pal" + (settings.palette === p ? " on" : "")} aria-pressed={settings.palette === p} onClick={() => updateSettings({ palette: p })}>
              <i className="pal-prev">
                <em className="lt"><b style={{ background: PAL_SWATCH[p][0] }} /><b style={{ background: PAL_SWATCH[p][1] }} /></em>
                <em className="dk" style={{ background: PAL_SWATCH[p][3] }}><b style={{ background: PAL_SWATCH[p][2] }} /></em>
              </i>
              <span>{t(`pal.${p}` as MessageKey)}</span>
            </button>
          ))}
        </div>
        <div className="fields one">
          <label className="field"><span>{t("settings.lang")}</span>
            <select value={settings.lang} onChange={(e) => updateSettings({ lang: e.target.value as Lang })}>
              <option value="uk">Українська</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
        <div className="field"><span>{t("settings.hideWeight")}</span>
          <div className="seg full" role="radiogroup" aria-label={t("settings.hideWeight")}>
            <button type="button" role="radio" aria-checked={!settings.hideWeight} className={!settings.hideWeight ? "on" : ""} onClick={() => updateSettings({ hideWeight: false })}>{t("settings.hideWeight.show")}</button>
            <button type="button" role="radio" aria-checked={settings.hideWeight} className={settings.hideWeight ? "on" : ""} onClick={() => updateSettings({ hideWeight: true })}>{t("settings.hideWeight.hide")}</button>
          </div>
        </div>
      </section>
        </>
      )}
      {cat === "goals" && (
        <section className="block">
          {settings.goals.map((g, i) => {
            const def = GOAL_DEFS.find((d) => d.metric === g.metric)!;
            const setGoal = (patch: Partial<typeof g>) => updateSettings({
              goals: settings.goals.map((x, j) => (j === i ? { ...x, ...patch } : x)),
              ...(g.metric === "steps" && patch.target != null ? { stepGoal: patch.target } : {}),
            });
            return (
              <div className="src-row" key={g.metric}>
                <span>{t(`goal.${g.metric}` as MessageKey)}{def.unit ? `, ${def.unit}` : ""}</span>
                <div className="remind-ctl goal-ctl">
                  <div className="seg full" role="radiogroup" aria-label={t(`goal.${g.metric}` as MessageKey)}>
                    <button type="button" role="radio" aria-checked={g.on} className={g.on ? "on" : ""} onClick={() => setGoal({ on: true })}>{t("remind.on")}</button>
                    <button type="button" role="radio" aria-checked={!g.on} className={!g.on ? "on" : ""} onClick={() => setGoal({ on: false })}>{t("remind.off")}</button>
                  </div>
                  <Stepper value={String(g.target)} onChange={(v) => { const n = num(v); if (n != null && n > 0) setGoal({ target: n }); }} step={def.step} min={def.step} max={def.max} decimals={def.step < 1 ? 1 : 0} label={t(`goal.${g.metric}` as MessageKey)} />
                </div>
              </div>
            );
          })}
        </section>
      )}
      {cat === "program" && (
        <>
      <section className="block">
        <div className="fields">
          <label className="field"><span>{t("phase.label")}</span>
            <select value={settings.phase} onChange={(e) => updateSettings({ phase: e.target.value as Phase })}>
              {(["1", "2", "3"] as const).map((p) => <option key={p} value={p}>{t(`phase.${p}` as MessageKey)}</option>)}
            </select>
          </label>
          <label className="field"><span>{t("settings.startDate")}</span>
            <input type="date" value={settings.startDate} onChange={(e) => e.target.value && updateSettings({ startDate: e.target.value })} />
          </label>
        </div>
        <div className="field"><Head as="label" title={t("settings.bpMark")} />
          <div className="fields two">
            <Stepper value={String(settings.bpMark.sys)} onChange={(v) => num(v) && updateSettings({ bpMark: { ...settings.bpMark, sys: num(v)! } })} step={5} min={90} max={200} label={t("form.bpSys")} />
            <Stepper value={String(settings.bpMark.dia)} onChange={(v) => num(v) && updateSettings({ bpMark: { ...settings.bpMark, dia: num(v)! } })} step={5} min={50} max={130} label={t("form.bpDia")} />
          </div>
        </div>
      </section>
        </>
      )}
      {cat === "data" && (
        <>
      <section className="block">
        <span className="status num">{t("settings.count", { n: count })}</span>
        <div className="actions">
          <button type="button" onClick={exportJson}>{t("settings.backup")}</button>
          <button type="button" onClick={() => fileRef.current?.click()}>{t("settings.import")}</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          <button type="button" onClick={() => histRef.current?.click()}>{t("hist.import")}</button>
          <input ref={histRef} type="file" accept=".csv,text/csv,text/comma-separated-values" multiple hidden onChange={(e) => e.target.files?.length && importHistory(e.target.files)} />
          <button type="button" className="danger" onClick={clearAll} disabled={!count}>{t("settings.clear")}</button>
        </div>
        {status.text && <p className={"status " + (status.kind ?? "")} role="status">{status.text}</p>}
      </section>
        </>
      )}
      {cat === "about" && (
        <>
      <section className="block">
        <Head title={t("ver.title")} right={<span className="status num">{t("ver.built", { t: built })}</span>} />
        <div className="actions">
          <button type="button" onClick={() => { void checkForUpdate().then(() => setVerMsg(t("ver.checked"))); }}>{t("ver.check")}</button>
        </div>
        {verMsg && <span className="status" role="status">{verMsg}</span>}
        {shell && (
          <>
            <p className="help-text">{t("ver.shell", { v: shell })}</p>
            <a className="btn primary block" href={APK_URL}>{t("ver.shellGet")}</a>
          </>
        )}
      </section>
        </>
      )}
    </>
  );
}
