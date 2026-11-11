import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.fitnes.journal",
  appName: "Fitnes",
  webDir: "dist",
  plugins: {
    LocalNotifications: { smallIcon: "ic_stat_fitnes", iconColor: "#0f766e" },
  },
};

export default config;
