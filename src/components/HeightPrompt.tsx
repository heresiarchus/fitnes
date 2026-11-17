import { useState } from "react";
import { updateSettings } from "../db";
import { useI18n } from "../i18n";
import type { Settings } from "../lib/types";

/** Asked once (for BMI and stride length); the answer travels with the account, so it never asks again. */
export function HeightPrompt({ settings, hasData }: { settings: Settings; hasData: boolean }) {
  const { t } = useI18n();
  const [cm, setCm] = useState("");
  if (settings.heightCm || settings.heightAsked || !hasData) return null;
  const v = Number(cm);
  const ok = Number.isFinite(v) && v >= 120 && v <= 230;
  return (
    <section className="block" data-c="weight">
      <div className="head-row"><h2>{t("ht.title")}</h2></div>
      <p className="status" style={{ margin: 0 }}>{t("ht.why")}</p>
      <label className="field"><span>{t("ht.label")}</span>
        <input type="number" inputMode="numeric" min={120} max={230} value={cm} onChange={(e) => setCm(e.target.value)} placeholder="180" />
      </label>
      <div className="actions">
        <button type="button" className="primary" disabled={!ok} onClick={() => void updateSettings({ heightCm: v, heightAsked: true })}>{t("ht.save")}</button>
        <button type="button" onClick={() => void updateSettings({ heightAsked: true })}>{t("ht.later")}</button>
      </div>
    </section>
  );
}
