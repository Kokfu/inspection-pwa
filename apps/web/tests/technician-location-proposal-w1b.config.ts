import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

// W1 tasks share a checkout. Keep this suite's server and screenshots independent.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: ["technician-location-proposal-*.spec.ts", "layout-proposal-already-pending.spec.ts", "header-proposal-sync-summary.spec.ts"],
  outputDir: "../test-results/w1b",
  use: { ...base.use, baseURL: "http://127.0.0.1:4177" },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4177 --strictPort",
    url: "http://127.0.0.1:4177", reuseExistingServer: false, timeout: 120_000
  }
});
