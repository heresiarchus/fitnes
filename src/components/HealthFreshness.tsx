import { useState } from "react";
import { useHealthState } from "../db";
import { pullHealth } from "../health";
import { useI18n } from "../i18n";
import { iso } from "../lib/date";
import { isNative } from "../native";

/**
 * A small round button in the corner of the Today card: pulls fresh data from Samsung Health
 * (through Health Connect). It spins while working and shows a tick when done; how fresh the
 * data is sits in its label for screen readers and a long press.
 */
export function HealthRefresh() {
  const { t, lang } = useI18n();
  const st = useHealthState();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  if (!isNative || !st?.on) return null;
  const loc = lang === "uk" ? "uk-UA" : "en-GB";
  const at = (x?: string) => {
    if (!x) return "—";
    const d = new Date(x);
    const time = d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
    return iso(d) === iso(new Date()) ? time : `${d.toLocaleDateString(loc, { day: "numeric", month: "short" })} ${time}`;
  };
  const label = t("hf.line", { data: at(st.lastDataAt), pulled: at(st.lastPullAt) });
  const refresh = async () => {
    if (state === "busy") return;
    setState("busy");
    try { await pullHealth(2); } finally { setState("done"); setTimeout(() => setState("idle"), 1600); }
  };
  return (
    <button type="button" className={"hrefresh " + state} aria-label={`${t("hf.refresh")} · ${label}`} title={label} onClick={() => void refresh()}>
      {state === "done"
        ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" /></svg>}
    </button>
  );
}
