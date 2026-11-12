import { App as CapApp } from "@capacitor/app";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { TFn } from "./i18n";
import { iso } from "./lib/date";
import { fmt, fmtInt } from "./lib/format";
import { missingToday, type PlannedReminder, planReminders } from "./lib/reminders";
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
    // Clear delivered reminders that are no longer true (the data has been logged).
    const delivered = await LocalNotifications.getDeliveredNotifications();
    const todayDone = missingToday(days[iso(new Date())]).length === 0;
    const stale = delivered.notifications.filter((n) => (n.id >= 5000 && n.id < 6000 && todayDone) || n.id >= 1000 && n.id < 5000);
    if (stale.length) await LocalNotifications.removeDeliveredNotifications({ notifications: stale });
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    if (!(await notificationsAllowed())) return;
    const plan: PlannedReminder[] = planReminders(settings.reminders, days, new Date(), 14, settings.habits);
    if (!plan.length) return;
    await LocalNotifications.schedule({
      notifications: plan.map((p) => {
        if (p.kind === "habit" && p.habit) {
          return {
            id: p.id,
            title: p.minOnly ? t("habit.remindMin") : p.habit.title,
            body: t("habit.remindBody", { min: p.habit.minVersion }),
            schedule: { at: p.at, allowWhileIdle: true },
            extra: { route: "/" },
          };
        }
        const kind = p.kind as Exclude<PlannedReminder["kind"], "habit">;
        if (kind === "evening") {
          // Today's text names exactly what's missing; later days get a general check.
          const miss = iso(p.at) === iso(new Date()) ? missingToday(days[iso(p.at)]) : [];
          return {
            id: p.id,
            title: t("remind.missing.title"),
            body: miss.length ? t("remind.missing.body", { list: miss.map((m) => t(m === "weight" ? "day.left.weight" : "day.left.feel")).join(", ") }) : t("remind.missing.generic"),
            schedule: { at: p.at, allowWhileIdle: true },
            // Stays in the shade until the day is complete; cleared by the app, not by a swipe.
            ongoing: true,
            autoCancel: false,
            extra: { route: "/log" },
          };
        }
        return {
          id: p.id,
          title: t(`remind.${kind}.title`),
          body: t(`remind.${kind}.body`),
          schedule: { at: p.at, allowWhileIdle: true },
          extra: { route: kind === "bp" ? "/history" : kind === "review" ? "/" : "/log" },
        };
      }),
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


/**
 * The Android shell itself changes rarely (widget, reminders, watch access).
 * Returns the newer shell version when one has been published, else null.
 */
export async function newerShell(): Promise<string | null> {
  if (!isNative) return null;
  try {
    const mine = (await CapApp.getInfo()).version;
    const res = await fetch("https://api.github.com/repos/heresiarchus/fitnes/releases/latest", { cache: "no-store" });
    if (!res.ok) return null;
    const latest = String(((await res.json()) as { tag_name?: string }).tag_name ?? "").replace(/^v/, "");
    return latest && isNewer(latest, mine) ? latest : null;
  } catch {
    return null;
  }
}

/** Compares dotted versions numerically: "0.2.10" is newer than "0.2.9". */
export function isNewer(a: string, b: string): boolean {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d !== 0) return d > 0;
  }
  return false;
}
