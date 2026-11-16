import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { fmtKg } from "../lib/format";
import { APK_URL, isNative } from "../native";
import { type NearbyDevice, startWeighing, type WeighEvent } from "../scale";
import { Icon } from "./Card";

type View =
  | { phase: "search" | "idle" }
  | { phase: "found"; name: string }
  | { phase: "live"; kg: number; name?: string }
  | { phase: "done"; kg: number }
  | { phase: "timeout"; seen: NearbyDevice[] }
  | { phase: "error"; reason: string; message?: string };

const WINDOW = 30;

/** Full-screen weighing like the OKOK app: find the scale, live numbers, the settled weight goes into the entry. */
function WeighSheet({ onWeight, onClose }: { onWeight: (kg: number) => void; onClose: () => void }) {
  const { t, lang } = useI18n();
  const [view, setView] = useState<View>({ phase: "search" });
  const [left, setLeft] = useState(WINDOW);
  const [run, setRun] = useState(0);
  const name = useRef("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setView({ phase: "search" }); setLeft(WINDOW); name.current = "";
    const tick = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    const cancel = startWeighing((e: WeighEvent) => {
      if (e.phase === "found") { name.current = e.name; setView({ phase: "found", name: e.name }); return; }
      if (e.phase === "live") { setLeft(WINDOW); setView({ phase: "live", kg: e.kg, name: name.current }); return; }
      clearInterval(tick);
      if (e.phase === "done") {
        setView({ phase: "done", kg: e.kg });
        navigator.vibrate?.(60);
        setTimeout(() => { onWeight(e.kg); onClose(); }, 1400);
      } else setView(e as View);
    });
    return () => { clearInterval(tick); cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  const report = view.phase === "timeout"
    ? view.seen.slice(0, 15).map((d) => `${d.name || "?"} | ${d.rssi ?? ""} dBm | ${d.uuids.join(",")} | ${d.raw}`).join("\n")
    : "";

  return (
    <div className="due-screen" role="dialog" aria-modal="true" aria-labelledby="weigh-title">
      <div className="due-sheet weigh">
        <div className="due-top">
          <span className="card-ic"><Icon name="weight" /></span>
          <div><h2 id="weigh-title">{t("scale.title2")}</h2><p>{view.phase === "search" || view.phase === "found" || view.phase === "live" ? t("scale.left", { s: left }) : ""}</p></div>
        </div>

        {(view.phase === "search" || view.phase === "found") && (
          <div className="weigh-main">
            <div className="weigh-pulse" aria-hidden="true" />
            <b>{view.phase === "found" ? t("scale.foundName", { name: view.name }) : t("scale.stepOn")}</b>
            <span className="status">{t("scale.hint")}</span>
          </div>
        )}
        {view.phase === "live" && (
          <div className="weigh-main">
            <span className="weigh-num live">{fmtKg(view.kg, lang, 2)}<small> {t("common.kg")}</small></span>
            <span className="status">{t("scale.settling")}</span>
          </div>
        )}
        {view.phase === "done" && (
          <div className="weigh-main">
            <span className="weigh-num done">{fmtKg(view.kg, lang, 2)}<small> {t("common.kg")}</small></span>
            <span className="status ok">✓ {t("scale.fixed")}</span>
          </div>
        )}
        {view.phase === "timeout" && (
          <div className="weigh-main left">
            <b>{t("scale.timeout")}</b>
            <span className="status">{t("scale.timeoutHelp")}</span>
            {report && (
              <>
                <textarea className="report" readOnly value={report} rows={6} aria-label={t("scale.seen")} />
                <button type="button" className="pill" onClick={() => { void navigator.clipboard.writeText(report).then(() => setCopied(true)); }}>{copied ? t("reports.copied") : t("scale.copyForClaude")}</button>
              </>
            )}
          </div>
        )}
        {view.phase === "error" && (
          <div className="weigh-main left">
            <b>{t(view.reason === "noPlugin" ? "scale.noPlugin" : view.reason === "bluetoothOff" ? "scale.btOff" : "scale.error")}</b>
            {view.message && <span className="status">{view.message}</span>}
            {view.reason === "noPlugin" && <a className="btn primary block" href={APK_URL}>{t("ver.shellGet")}</a>}
          </div>
        )}

        <div className="actions">
          {(view.phase === "timeout" || view.phase === "error") && <button type="button" className="primary" onClick={() => setRun((n) => n + 1)}>{t("scale.retry")}</button>}
          {view.phase !== "done" && <button type="button" onClick={onClose}>{t("common.cancel")}</button>}
        </div>
      </div>
    </div>
  );
}

/** "Weigh on the scale" button; opens the weighing screen. */
export function ScaleButton({ onWeight }: { onWeight: (kg: number) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!isNative) return null;
  return (
    <>
      <button type="button" className="pill" onClick={() => setOpen(true)}>⚖ {t("scale.weigh")}</button>
      {open && <WeighSheet onWeight={onWeight} onClose={() => setOpen(false)} />}
    </>
  );
}
