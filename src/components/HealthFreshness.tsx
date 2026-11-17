import { useState } from "react";
import { useHealthState } from "../db";
import { pullHealth } from "../health";
import { useI18n } from "../i18n";
import { iso } from "../lib/date";
import { isNative, openSamsungHealth } from "../native";

/**
 * How fresh the watch data is. Samsung Health passes data to Health Connect with a delay
 * (it batches, or waits until it is opened), so the app can only show what has arrived:
 * "Samsung data up to 20:40, checked 21:05", a refresh button, and a nudge to open
 * Samsung Health when its data is old.
 */
export function HealthFreshness() {
  const { t, lang } = useI18n();
  const st = useHealthState();
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState(false);
  if (!isNative || !st?.on) return null;
  const loc = lang === "uk" ? "uk-UA" : "en-GB";
  const at = (x?: string) => {
    if (!x) return "—";
    const d = new Date(x);
    const time = d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
    return iso(d) === iso(new Date()) ? time : `${d.toLocaleDateString(loc, { day: "numeric", month: "short" })} ${time}`;
  };
  const stale = !st.lastDataAt || Date.now() - Date.parse(st.lastDataAt) > 45 * 60 * 1000;
  const refresh = async () => { setBusy(true); try { await pullHealth(2); } finally { setBusy(false); } };
  return (
    <div className="hfresh">
      <span>{t("hf.line", { data: at(st.lastDataAt), pulled: at(st.lastPullAt) })}</span>
      <div className="hfresh-b">
        <button type="button" className="compact" disabled={busy} onClick={() => void refresh()}>{busy ? t("hf.busy") : t("hf.refresh")}</button>
        {stale && <button type="button" className="compact" onClick={() => { setTip(true); void openSamsungHealth(); }}>{t("hf.openSh")}</button>}
      </div>
      {(stale || tip) && <small>{t("hf.tip")}</small>}
    </div>
  );
}
