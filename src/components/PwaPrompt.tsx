import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useI18n } from "../i18n";

let registration: ServiceWorkerRegistration | undefined;

/** Asks the server whether a newer version of the app has been published. */
export async function checkForUpdate(): Promise<void> {
  try { await registration?.update(); } catch { /* offline */ }
}

/**
 * "A new version is available — Update". The new version is installed only
 * when the button is pressed, so a form in progress is never reloaded away.
 */
export function PwaPrompt() {
  const { t } = useI18n();
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, r) {
      registration = r;
      // Look for a new version whenever the app comes back to the screen, and hourly.
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void checkForUpdate(); });
      setInterval(() => void checkForUpdate(), 60 * 60 * 1000);
    },
  });
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
