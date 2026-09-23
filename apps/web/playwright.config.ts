import { defineConfig } from "@playwright/test";

// Live specs need a real API, a seeded disposable database and runtime fixture
// files. scripts/Test-V7LiveBrowser.ps1 provides them and sets PLAYWRIGHT_LIVE=1;
// otherwise they are not collected at all (neither skipped nor passed). They use
// their own absolute *_BASE_URL, so live mode does not start the 4175 dev server.
const live = process.env.PLAYWRIGHT_LIVE === "1";
const liveSpecs = ["**/co2-v7-live-accepted-detail.spec.ts", "**/wet-chemical-v7-live-accepted-detail.spec.ts"];

export default defineConfig({
  testDir: "./tests",
  testIgnore: live ? [] : liveSpecs,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4175",
    browserName: "chromium",
    headless: true
  },
  webServer: live ? undefined : {
    command: "npm run dev -- --host 127.0.0.1 --port 4175 --strictPort",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
    timeout: 120_000
  }
});
