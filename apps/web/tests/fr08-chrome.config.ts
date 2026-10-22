import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

// Isolate this gate from other browser runs. An installed Chromium can be supplied
// when the Playwright browser download is unavailable.
export default defineConfig({
  ...base,
  testDir: ".",
  outputDir: "../.fr08/test-results",
  use: { ...base.use, baseURL: "http://127.0.0.1:4186", launchOptions: { executablePath: process.env.REPORT_CHROMIUM_PATH } },
  webServer: { command: "npm run dev -- --host 127.0.0.1 --port 4186 --strictPort", url: "http://127.0.0.1:4186", reuseExistingServer: false }
});
