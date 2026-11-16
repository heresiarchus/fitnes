import type { Palette, Theme } from "./lib/types";

const dark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

/**
 * Applies a theme and style at once. Transitions are paused for two frames so a switch is one
 * repaint instead of hundreds of colour animations at the same time (that was the stutter).
 * Called right on the tap, before the setting is saved, so the change is instant.
 */
export function applyLook(theme: Theme, palette: Palette) {
  const root = document.documentElement;
  const resolved = theme === "auto" ? (dark() ? "dark" : "light") : theme;
  if (root.dataset.theme === resolved && root.dataset.palette === palette) return;
  root.classList.add("switching");
  root.dataset.theme = resolved;
  root.dataset.palette = palette;
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("switching")));
}
