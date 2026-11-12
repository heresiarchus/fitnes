import { Link } from "react-router-dom";
import { Icon, type IconName } from "../components/Card";
import { useHealthState } from "../db";
import { type MessageKey, useI18n } from "../i18n";
import type { Settings } from "../lib/types";
import { useSyncStatus } from "../sync/engine";

/** Settings start page: one row per category with its current state. */
export function SettingsMenu({ settings, syncOn, sheetsOn }: { settings: Settings; syncOn: boolean; sheetsOn: boolean }) {
  const { t } = useI18n();
  const sync = useSyncStatus();
  const health = useHealthState();
  const yes = t("menu.on"), no = t("menu.off");
  const rows: { cat: string; icon: IconName; state: string; warn?: boolean }[] = [
    { cat: "connect", icon: "sync", warn: !syncOn || sync.state === "error",
      state: [`GitHub: ${syncOn ? (sync.state === "error" ? t("menu.error") : yes) : no}`, `Samsung: ${settings.healthLinked || health?.on ? yes : no}`, `Google: ${sheetsOn ? yes : no}`].join(" · ") },
    { cat: "sources", icon: "watch", state: settings.healthLinked ? t("menu.sourcesSet") : t("menu.manualOnly") },
    { cat: "reminders", icon: "bell", state: settings.reminders.evening.on ? `${settings.reminders.evening.time}–${settings.reminders.evening.until ?? ""}` : no },
    { cat: "habits", icon: "habits", state: t("menu.habits", { n: settings.habits.filter((h) => h.enabled).length }) },
    { cat: "look", icon: "palette", state: t(`pal.${settings.palette}` as MessageKey) },
    { cat: "program", icon: "move", state: t(`phase.${settings.phase}` as MessageKey) },
    { cat: "data", icon: "data", state: t("menu.data") },
    { cat: "about", icon: "more", state: t("menu.about") },
  ];
  return (
    <>
      <header className="page-head"><h1>{t("nav.settings")}</h1></header>
      <section className="block menu">
        {rows.map((r) => (
          <Link key={r.cat} className="menu-row" to={`/settings/${r.cat}`}>
            <span className="card-ic"><Icon name={r.icon} /></span>
            <span className="menu-t"><b>{t(`cat.${r.cat}` as MessageKey)}</b><small className={r.warn ? "warn" : ""}>{r.state}</small></span>
            <span className="menu-go" aria-hidden="true">›</span>
          </Link>
        ))}
      </section>
      <Link className="btn block" to="/reports">{t("more.reports")} →</Link>
    </>
  );
}
