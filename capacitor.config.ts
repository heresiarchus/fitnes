import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.fitnes.journal",
  appName: "Fitnes",
  webDir: "dist",
  // The app shows the published site, so a new web version reaches the phone
  // without reinstalling. The service worker keeps it working offline after the first start.
  server: { url: "https://heresiarchus.github.io/fitnes/" },
  plugins: {
    LocalNotifications: { smallIcon: "ic_stat_fitnes", iconColor: "#0f766e" },
  },
};

export default config;
