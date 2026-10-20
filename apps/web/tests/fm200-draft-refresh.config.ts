import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "fm200-draft-refresh.spec.ts",
  outputDir: "../test-results/fm200-draft-refresh",
  use: { baseURL: "http://127.0.0.1:4192", browserName: "chromium", headless: true },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4192 --strictPort",
    url: "http://127.0.0.1:4192",
    reuseExistingServer: false,
    timeout: 120_000
  }
});
