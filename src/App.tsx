import { useEffect, useState } from "react";
import { HashRouter, NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { PwaPrompt } from "./components/PwaPrompt";
import { useDays, useSettings } from "./db";
import { I18nProvider, type MessageKey, useI18n } from "./i18n";
import { DayLog } from "./pages/DayLog";
import { DiaryPage } from "./pages/DiaryPage";
import { CalendarPage } from "./pages/CalendarPage";
import { Overview } from "./pages/Overview";
import { Reports } from "./pages/Reports";
import { SettingsPage } from "./pages/SettingsPage";
import { askNotifications, isNative, listenNativeOpens, syncReminders, updateWidget } from "./native";

const ICONS: Record<string, string> = {
  overview: "M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z",
  log: "M12 5v14M5 12h14",
  calendar: "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4",
  diary: "M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM9 9h6M9 13h6",
  more: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1",
};

const TABS = [
  { to: "/", key: "overview" },
  { to: "/log", key: "log" },
  { to: "/diary", key: "diary" },
  { to: "/history", key: "calendar" },
  { to: "/settings", key: "more" },
];

function Shell() {
  const { t, lang } = useI18n();
  const days = useDays();
  const settings = useSettings();
  const navigate = useNavigate();
  const [notifOk, setNotifOk] = useState(false);

  useEffect(() => {
    listenNativeOpens((route) => navigate(route));
    // Ask once on first launch; the answer is remembered by Android.
    if (isNative) void askNotifications().then(setNotifOk);
  }, [navigate]);

  // Keep the widget and the reminder schedule in step with the data.
  useEffect(() => {
    if (!days) return;
    void updateWidget(days, t, lang);
    void syncReminders(settings, days, t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, settings.reminders, settings.habits, lang, notifOk]);

  return (
    <>
      <main>
        {days === undefined ? (
          <p className="empty">…</p>
        ) : (
          <Routes>
            <Route path="/" element={<Overview days={days} settings={settings} />} />
            <Route path="/log" element={<DayLog days={days} settings={settings} />} />
            <Route path="/diary" element={<DiaryPage />} />
            <Route path="/history" element={<CalendarPage days={days} settings={settings} />} />
            <Route path="/reports" element={<Reports days={days} settings={settings} />} />
            <Route path="/settings" element={<SettingsPage days={days} settings={settings} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
      <nav className="tabbar no-print" aria-label="Main">
        {TABS.map((tab) => (
          <NavLink key={tab.key} to={tab.to} end={tab.to === "/"} className={({ isActive }) => (isActive ? "on" : "")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[tab.key]} /></svg>
            <span>{t(`nav.${tab.key}` as MessageKey)}</span>
          </NavLink>
        ))}
      </nav>
      {!isNative && <PwaPrompt />}
    </>
  );
}

export function App() {
  const settings = useSettings();

  useEffect(() => {
    const root = document.documentElement;
    root.lang = settings.lang;
    if (settings.theme === "auto") delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  }, [settings.lang, settings.theme]);

  return (
    <I18nProvider lang={settings.lang}>
      <HashRouter>
        <Shell />
      </HashRouter>
    </I18nProvider>
  );
}
