import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { fmt } from "../lib/format";
import { isNative } from "../native";
import { stopScale, weighOnScale } from "../scale";

/** "Weigh on the scale": listens to the OKOK scale and hands over the settled weight. */
export function ScaleButton({ onWeight }: { onWeight: (kg: number) => void }) {
  const { t, lang } = useI18n();
  const [state, setState] = useState<"idle" | "listening" | "fail">("idle");
  const [live, setLive] = useState<number | null>(null);
  useEffect(() => () => stopScale(), []);
  if (!isNative) return null;

  async function start() {
    setState("listening"); setLive(null);
    try {
      const kg = await weighOnScale((v) => setLive(v));
      if (kg != null) { onWeight(kg); setState("idle"); } else setState("fail");
    } catch {
      setState("fail");
    }
  }

  return (
    <div className="scale-box">
      {state === "listening" ? (
        <>
          <span className="scale-live">{live != null ? `${fmt(live, lang)} ${t("common.kg")}` : t("scale.stepOn")}</span>
          <button type="button" className="pill" onClick={() => { stopScale(); setState("idle"); }}>{t("common.cancel")}</button>
        </>
      ) : (
        <>
          <button type="button" className="pill" onClick={() => void start()}>⚖ {t("scale.weigh")}</button>
          {state === "fail" && <span className="status err">{t("scale.fail")}</span>}
        </>
      )}
    </div>
  );
}
