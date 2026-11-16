/** "Remind me in 30 minutes" on the evening screen; shared with the reminder planner. */
const KEY = "fitnes.dueSnoozeUntil";

export function getSnooze(): number {
  try { return Number(localStorage.getItem(KEY) || 0); } catch { return 0; }
}

/** 0 clears it (e.g. the reminder itself was tapped). Listeners replan reminders and redraw the screen. */
export function setSnooze(until: number) {
  try { if (until) localStorage.setItem(KEY, String(until)); else localStorage.removeItem(KEY); } catch { /* private mode */ }
  window.dispatchEvent(new Event("fitnes:snooze"));
}
