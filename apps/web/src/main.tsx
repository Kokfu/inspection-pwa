import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/app.css";
import { APP_BUILD_ID } from "./pwa/buildInfo";

// Support-only: read in DevTools with document.documentElement.dataset.appBuild. Never shown on screen.
document.documentElement.dataset.appBuild = APP_BUILD_ID;

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

