import { useEffect, useState } from "react";
import { type MessageKey, useI18n } from "../i18n";
import { type ReminderPerms, APK_URL, nativeReminders, openReminderSettings, reminderPerms, testReminder } from "../native";
import { REMINDER_STYLES, type ReminderStyle } from "../lib/types";

/** A small drawing of a phone showing how the evening reminder appears in that style. */
function Preview({ style }: { style: ReminderStyle }) {
  // Text this small would be unreadable (and Android enlarges it), so lines stand for words.
  const note = (
    <span className="rs-note">
      <i className="rs-ic" />
      <span className="rs-lines"><i /><i /></span>
    </span>
  );
  const full = (
    <span className="rs-due">
      <span className="rs-lines c"><i /></span>
      <span className="rs-drum">135,45</span>
      <span className="rs-chips"><i /><i /><i /></span>
      <span className="rs-btn" />
    </span>
  );
  const app = <span className="rs-app"><i /><i /><i /><i /></span>;
  if (style === "escalate") {
    return (
      <span className="rs-pair">
        <span className="rs-phone sm"><span className="rs-screen">{app}<span className="rs-banner">{note}</span></span></span>
        <span className="rs-arrow">→</span>
        <span className="rs-phone sm"><span className="rs-screen">{full}</span></span>
      </span>
    );
  }
  return (
    <span className={"rs-phone rs-" + style}>
      <span className="rs-screen">
        {style === "notification" && <><span className="rs-clock">23:20</span>{note}</>}
        {style === "headsup" && <>{app}<span className="rs-banner">{note}</span></>}
        {style === "fullscreen" && full}
      </span>
    </span>
  );
}

/** Choice of how the evening reminder appears, with a preview of each and what Android must allow. */
export function ReminderStylePicker({ value, every, onChange }: { value: ReminderStyle | undefined; every: number; onChange: (s: ReminderStyle) => void }) {
  const { t } = useI18n();
  const cur = value ?? "fullscreen";
  const ready = nativeReminders();
  const [perms, setPerms] = useState<ReminderPerms | null>(null);
  const [tested, setTested] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const load = () => void reminderPerms().then(setPerms).catch(() => setPerms(null));
    load();
    // Back from the system settings page: read the switches again.
    document.addEventListener("visibilitychange", load);
    return () => document.removeEventListener("visibilitychange", load);
  }, [ready]);

  const needs: (keyof ReminderPerms)[] = cur === "notification" || cur === "headsup" ? ["notifications", "exact"] : ["overlay", "fullScreen", "notifications", "exact"];

  return (
    <>
      <span className="sub-h">{t("remind.style.title")}</span>
      <div className="rs-grid" role="radiogroup" aria-label={t("remind.style.title")}>
        {REMINDER_STYLES.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={cur === s} className={"rs-opt" + (cur === s ? " on" : "")} onClick={() => onChange(s)}>
            <Preview style={s} />
            <b>{t(`remind.style.${s}` as MessageKey)}</b>
            <small>{t(`remind.style.${s}.d` as MessageKey, { n: every })}</small>
          </button>
        ))}
      </div>
      {!ready ? (
        <div className="help-text">
          {t("remind.needShell")} <a className="link" href={APK_URL}>{t("remind.getApk")}</a>
        </div>
      ) : (
        <>
          {perms && (
            <ul className="perm-list">
              {needs.map((k) => (
                <li key={k} className={perms[k] ? "ok" : ""}>
                  <span><b>{t(`remind.perm.${k}` as MessageKey)}</b><small>{t(perms[k] ? "remind.perm.ok" : "remind.perm.no")}</small></span>
                  {!perms[k] && <button type="button" className="compact primary" onClick={() => void openReminderSettings(k)}>{t("remind.perm.grant")}</button>}
                </li>
              ))}
            </ul>
          )}
          {perms && needs.some((k) => !perms[k]) && <p className="status" style={{ margin: 0 }}>{t("remind.perm.why")}</p>}
          <button type="button" onClick={() => void testReminder(cur, t).then(() => setTested(true))}>{t("remind.test")}</button>
          {tested && <p className="status ok" style={{ margin: 0 }}>{t("remind.testHint")}</p>}
        </>
      )}
    </>
  );
}
