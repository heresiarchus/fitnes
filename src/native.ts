import { App as CapApp } from "@capacitor/app";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { MessageKey, TFn } from "./i18n";
import { GOAL_DEFS, goalProgress } from "./lib/goals";
import { iso } from "./lib/date";
import { fmt, fmtInt } from "./lib/format";
import { eveningDay, eveningMissing } from "./lib/due";
import { EVENING_ID, type PlannedReminder, planReminders } from "./lib/reminders";
import type { DaysMap, Lang, Settings } from "./lib/types";

/** True inside the Android app; false in a browser or installed web app. */
export const isNative = Capacitor.isNativePlatform();

export const APK_URL = "https://github.com/heresiarchus/fitnes/releases/latest/download/fitnes.apk";

interface WidgetPlugin { update(data: Record<string, string>): Promise<void> }
const Widget = registerPlugin<WidgetPlugin>("FitnesWidget");

/** Pushes today's goal progress to the home-screen widget (first three enabled goals). */
export async function updateWidget(days: DaysMap, t: TFn, lang: Lang, settings?: Settings) {
  if (!isNative || !settings) return;
  const today = iso(new Date());
  const none = t("today.none");
  const data: Record<string, string> = { date: today, title: t("goals.today"), empty: none, action: t("widget.action") };
  goalProgress(settings, days[today]).slice(0, 3).forEach((g, i) => {
    const def = GOAL_DEFS.find((d) => d.metric === g.metric)!;
    const f = (v: number) => (def.step < 1 ? fmt(v, lang) : fmtInt(v, lang));
    data[`g${i + 1}Label`] = t(`goal.${g.metric}` as MessageKey);
    data[`g${i + 1}Value`] = `${g.value == null ? none : f(g.value)} / ${f(g.target)}${def.unit ? " " + def.unit : ""}`;
    data[`g${i + 1}Pct`] = String(g.pct);
  });
  for (let i = goalProgress(settings, days[today]).slice(0, 3).length; i < 3; i++) data[`g${i + 1}Label`] = "";
  try {
    await Widget.update(data);
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
    const evening = eveningDay(settings, new Date()) ?? iso(new Date());
    const done = eveningMissing(settings, days[evening], evening).length === 0;
    // Old habit reminders (1000–4999) are no longer used; evening ones go once the evening is complete.
    const stale = delivered.notifications.filter((n) => (n.id >= EVENING_ID && done) || (n.id >= 1000 && n.id < EVENING_ID));
    if (stale.length) await LocalNotifications.removeDeliveredNotifications({ notifications: stale });
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    if (!(await notificationsAllowed())) return;
    // Evening repeats are many, so plan only the next couple of evenings; the app replans on every open.
    const plan: PlannedReminder[] = planReminders(settings, days, new Date(), 2);
    if (!plan.length) return;
    await LocalNotifications.schedule({
      notifications: plan.map((p) => {
        if (p.kind === "review") {
          return { id: p.id, title: t("remind.review.title"), body: t("remind.review.body"), schedule: { at: p.at, allowWhileIdle: true }, extra: { route: "/" } };
        }
        // The text names what the evening still lacks, as of planning time.
        const miss = eveningMissing(settings, days[p.date], p.date);
        const names = miss.map((m) => (m.kind === "habit" ? m.habit.title : t(m.kind === "weight" ? "day.left.weight" : m.kind === "feel" ? "day.left.feel" : "day.left.bp")));
        return {
          id: p.id,
          title: t("remind.missing.title"),
          body: names.length ? t("remind.missing.body", { list: names.join(", ") }) : t("remind.missing.generic"),
          schedule: { at: p.at, allowWhileIdle: true },
          // Stays in the shade until the evening is complete; cleared by the app, not by a swipe.
          ongoing: true,
          autoCancel: false,
          extra: { route: "/" },
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
