import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { db } from "../db";
import { type MessageKey, useI18n } from "../i18n";
import { useSyncStatus } from "../sync/engine";

/** One-line sync state; links to settings when sync is off or failing. */
export function SyncBadge({ detailed = false }: { detailed?: boolean }) {
  const { t, lang } = useI18n();
  const s = useSyncStatus();
  const hidden = !detailed && s.state === "off"; // the warning card says it already
  const pending = useLiveQuery(
    async () => (s.state === "off" ? 0 : db.days.filter((d) => !s.lastSyncAt || d.updatedAt > s.lastSyncAt).count()),
    [s.state, s.lastSyncAt],
  ) ?? 0;
  const time = s.lastSyncAt
    ? new Date(s.lastSyncAt).toLocaleString(lang === "uk" ? "uk-UA" : "en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;
  let text: string;
  switch (s.state) {
    case "off": text = t("sync.state.off"); break;
    case "syncing": text = t("sync.state.syncing"); break;
    case "offline": text = t("sync.state.offline"); break;
    case "error": text = t("sync.state.error", { e: t(`sync.err.${s.error ?? "http"}` as MessageKey) }); break;
    default: text = time ? t("sync.state.idle", { t: time }) : t("sync.state.never");
  }
  if (hidden) return null;
  const cls = s.state === "error" ? "err" : s.state === "idle" ? "ok" : "";
  const body = (
    <span className={"sync-badge status " + cls} role="status">
      <i className={"dot " + s.state} aria-hidden="true" />
      <span>
        {text}
        {pending > 0 && s.state !== "syncing" && <> · {t("sync.pending", { n: pending })}</>}
      </span>
    </span>
  );
  if (!detailed && (s.state === "off" || s.state === "error")) return <Link to="/settings" className="sync-link">{body}</Link>;
  return body;
}

/** Prominent notice while this device keeps entries only for itself. */
export function SyncWarning() {
  const { t } = useI18n();
  const s = useSyncStatus();
  if (s.state !== "off") return null;
  return (
    <section className="warn-card" role="alert">
      <b>{t("sync.warnTitle")}</b>
      <span>{t("sync.warnText")}</span>
      <Link className="btn block" to="/settings">{t("sync.warnBtn")}</Link>
    </section>
  );
}
