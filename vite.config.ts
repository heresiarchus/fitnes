import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Fitnes — журнал руху й ваги",
        short_name: "Fitnes",
        description: "Журнал тренувань, ваги, кроків і звіти. Дані зберігаються на пристрої.",
        lang: "uk",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#eef1f5",
        theme_color: "#0f766e",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"]
      }
    })
  ]
});
