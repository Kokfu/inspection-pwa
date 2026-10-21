import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

// Separate port so the customer-history steps can be verified in parallel.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: ["add-customer-similarity.spec.ts", "technician-sidebar-navigation.spec.ts"],
  use: { ...base.use, baseURL: "http://127.0.0.1:4189" },
  webServer: {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4189 --strictPort",
    url: "http://127.0.0.1:4189",
    cwd: process.cwd(),
    reuseExistingServer: false,
    timeout: 120_000
  }
});
