import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useI18n } from "../i18n";

export function PwaPrompt() {
  const { t } = useI18n();
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  // The "offline ready" notice is informational; hide it on its own.
  useEffect(() => {
    if (!offlineReady || needRefresh) return;
    const id = setTimeout(() => setOfflineReady(false), 4000);
    return () => clearTimeout(id);
  }, [offlineReady, needRefresh, setOfflineReady]);
  if (!offlineReady && !needRefresh) return null;
  return (
    <div className="toast" role="status">
      <span>{needRefresh ? t("pwa.update") : t("pwa.offline")}</span>
      {needRefresh && <button type="button" className="primary" onClick={() => updateServiceWorker(true)}>{t("pwa.reload")}</button>}
      <button type="button" onClick={() => { setOfflineReady(false); setNeedRefresh(false); }}>{t("pwa.close")}</button>
    </div>
  );
}
