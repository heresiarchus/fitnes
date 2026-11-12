import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { startAutoSync } from "./sync/engine";
import { startAutoSheets } from "./sync/sheets";
import { startAutoHealth } from "./health";

// Ask the browser not to evict our IndexedDB data under storage pressure.
navigator.storage?.persist?.().catch(() => {});

startAutoSync();
startAutoSheets();
startAutoHealth();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
