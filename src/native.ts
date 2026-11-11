import { App as CapApp } from "@capacitor/app";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { TFn } from "./i18n";
import { iso } from "./lib/date";
import { fmt, fmtInt } from "./lib/format";
import { type PlannedReminder, planReminders } from "./lib/reminders";
import type { DaysMap, Lang, Settings } from "./lib/types";

/** True inside the Android app; false in a browser or installed web app. */
export const isNative = Capacitor.isNativePlatform();

export const APK_URL = "https://github.com/heresiarchus/fitnes/releases/latest/download/fitnes.apk";

interface WidgetPlugin { update(data: Record<string, string>): Promise<void> }
const Widget = registerPlugin<WidgetPlugin>("FitnesWidget");

/** Pushes today's numbers to the home-screen widget. */
export async function updateWidget(days: DaysMap, t: TFn, lang: Lang) {
  if (!isNative) return;
  const today = iso(new Date());
  const d = days[today];
  const none = t("today.none");
  try {
    await Widget.update({
      date: today,
      title: t("today.title"),
      empty: none,
      action: t("widget.action"),
      weightLabel: t("cal.day.weight"),
      weight: d?.weight != null ? `${fmt(d.weight, lang)} ${t("common.kg")}` : none,
      stepsLabel: t("cal.day.steps"),
      steps: d?.steps != null ? fmtInt(d.steps, lang) : none,
      walkLabel: t("cal.day.walk"),
      walk: d?.walkMin ? `${d.walkMin} ${t("common.min")}` : none,
    });
  } catch {
    // The widget is optional; never let it break the app.
  }
}

export async function notificationsAllowed(): Promise<boolean> {
  if (!isNative) return false;
  return (await LocalNotifications.checkPermissions()).display === "granted";
}

export async function askNotifications(): Promise<boolean> {
  if (!isNative) return false;
  return (await LocalNotifications.requestPermissions()).display === "granted";
}

/**
 * Replaces all scheduled reminders with the plan for the next two weeks.
 * Rescheduling on every start and save lets today's reminder disappear once
 * the thing it asks for has been logged.
 */
export async function syncReminders(settings: Settings, days: DaysMap, t: TFn) {
  if (!isNative) return;
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    if (!(await notificationsAllowed())) return;
    const plan: PlannedReminder[] = planReminders(settings.reminders, days, new Date(), 14);
    if (!plan.length) return;
    await LocalNotifications.schedule({
      notifications: plan.map((p) => ({
        id: p.id,
        title: t(`remind.${p.kind}.title`),
        body: t(`remind.${p.kind}.body`),
        schedule: { at: p.at, allowWhileIdle: true },
        extra: { route: p.kind === "bp" ? "/history" : "/log" },
      })),
    });
  } catch {
    // Reminders are best effort.
  }
}

/** Opens the right screen when the app is started from the widget or a reminder. */
export function listenNativeOpens(go: (route: string) => void) {
  if (!isNative) return;
  void CapApp.addListener("appUrlOpen", (e) => { if (e.url.includes("://log")) go("/log"); });
  void LocalNotifications.addListener("localNotificationActionPerformed", (e) => {
    const route = (e.notification.extra as { route?: string } | undefined)?.route;
    go(route ?? "/log");
  });
}

