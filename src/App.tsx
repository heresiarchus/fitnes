import { lazy, Suspense, useEffect, useState } from "react";
import { Logo } from "./components/Brand";
import { applyLook } from "./look";
import { HashRouter, NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { PwaPrompt } from "./components/PwaPrompt";
import { DueScreen } from "./components/DueScreen";
import { useDays, useSettings } from "./db";
import { I18nProvider, type MessageKey, useI18n } from "./i18n";
import { DayLog } from "./pages/DayLog";
import { Overview } from "./pages/Overview";

// Pages other than the home screen and the day form load on first visit (and are fetched
// in the background right after start), so the app starts faster on the phone.
const pages = {
  diary: () => import("./pages/DiaryPage"),
  calendar: () => import("./pages/CalendarPage"),
  reports: () => import("./pages/Reports"),
  settings: () => import("./pages/SettingsPage"),
  metric: () => import("./pages/MetricPage"),
  more: () => import("./pages/MorePage"),
};
const DiaryPage = lazy(() => pages.diary().then((m) => ({ default: m.DiaryPage })));
const CalendarPage = lazy(() => pages.calendar().then((m) => ({ default: m.CalendarPage })));
const Reports = lazy(() => pages.reports().then((m) => ({ default: m.Reports })));
const SettingsPage = lazy(() => pages.settings().then((m) => ({ default: m.SettingsPage })));
const MetricPage = lazy(() => pages.metric().then((m) => ({ default: m.MetricPage })));
const MorePage = lazy(() => pages.more().then((m) => ({ default: m.MorePage })));
const preload = () => Object.values(pages).forEach((load) => void load());
import { askNotifications, isNative, listenNativeOpens, syncReminders, updateWidget } from "./native";

const ICONS: Record<string, string> = {
  overview: "M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z",
  log: "M12 5v14M5 12h14",
  calendar: "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4",
  diary: "M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM9 9h6M9 13h6",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1",
};

const TABS = [
  { to: "/", key: "overview" },
  { to: "/log", key: "log" },
  { to: "/diary", key: "diary" },
  { to: "/history", key: "calendar" },
  { to: "/settings", key: "settings" },
];

function Shell() {
  const { t, lang } = useI18n();
  const days = useDays();
  const settings = useSettings();
  const navigate = useNavigate();
  const [notifOk, setNotifOk] = useState(false);
  const [snoozed, setSnoozed] = useState(0);
  useEffect(() => {
    const on = () => setSnoozed((n) => n + 1);
    window.addEventListener("fitnes:snooze", on);
    return () => window.removeEventListener("fitnes:snooze", on);
  }, []);

  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback;
    if (idle) idle(preload); else setTimeout(preload, 1500);
  }, []);

  useEffect(() => {
    listenNativeOpens((route) => navigate(route));
    // Ask once on first launch; the answer is remembered by Android.
    if (isNative) void askNotifications().then(setNotifOk);
  }, [navigate]);

  // Keep the widget and the reminder schedule in step with the data.
  useEffect(() => {
    if (!days) return;
    void updateWidget(days, t, lang, settings);
    void syncReminders(settings, days, t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, settings.reminders, settings.habits, settings.goals, lang, notifOk, snoozed]);

  return (
    <>
      <main>
        {days === undefined ? (
          <p className="empty">…</p>
        ) : (
          <Suspense fallback={<p className="empty">…</p>}>
          <Routes>
            <Route path="/" element={<Overview days={days} settings={settings} />} />
            <Route path="/log" element={<DayLog days={days} settings={settings} />} />
            <Route path="/diary" element={<DiaryPage />} />
            <Route path="/history" element={<CalendarPage days={days} settings={settings} />} />
            <Route path="/reports" element={<Reports days={days} settings={settings} />} />
            <Route path="/settings" element={<SettingsPage days={days} settings={settings} />} />
            <Route path="/settings/:cat" element={<SettingsPage days={days} settings={settings} />} />
            <Route path="/m/:id" element={<MetricPage days={days} settings={settings} />} />
            <Route path="/more" element={<MorePage days={days} settings={settings} />} />
            <Route path="/more/:area" element={<MorePage days={days} settings={settings} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        )}
      </main>
      <nav className="tabbar no-print" aria-label="Main">
        <div className="side-brand" aria-hidden="true"><Logo size={36} /><b>Fitnes</b></div>
        {TABS.map((tab) => (
          <NavLink key={tab.key} to={tab.to} end={tab.to === "/"} className={({ isActive }) => (isActive ? "on" : "")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[tab.key]} /></svg>
            <span>{t(`nav.${tab.key}` as MessageKey)}</span>
          </NavLink>
        ))}
      </nav>
      <PwaPrompt />
      {days && <DueScreen days={days} settings={settings} />}
    </>
  );
}

export function App() {
  const settings = useSettings();

  useEffect(() => {
    const root = document.documentElement;
    root.lang = settings.lang;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applyLook(settings.theme, settings.palette);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.lang, settings.theme, settings.palette]);

  return (
    <I18nProvider lang={settings.lang}>
      <HashRouter>
        <Shell />
      </HashRouter>
    </I18nProvider>
  );
}
