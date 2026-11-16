import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@fontsource-variable/onest";
import "./styles.css";
import "./design.css";
import { startAutoSync } from "./sync/engine";
import { runMigrations } from "./db";
import { startCloudSync } from "./cloud/sync";
import { startAutoSheets } from "./sync/sheets";
import { startAutoHealth } from "./health";

// Ask the browser not to evict our IndexedDB data under storage pressure.
navigator.storage?.persist?.().catch(() => {});

void runMigrations();
startAutoSync();
startCloudSync();
startAutoSheets();
startAutoHealth();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
