import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: [
    "supervisor-location-proposals.spec.ts", "location-proposals-unreadable.spec.ts",
    "technician-location-proposal-*.spec.ts", "layout-proposal-already-pending.spec.ts",
    "header-proposal-sync-summary.spec.ts", "manager-supervisor.spec.ts"
  ],
  outputDir: "../test-results/w2",
  use: { ...base.use, baseURL: "http://127.0.0.1:4178" },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4178 --strictPort",
    url: "http://127.0.0.1:4178", reuseExistingServer: false, timeout: 120_000
  }
});
