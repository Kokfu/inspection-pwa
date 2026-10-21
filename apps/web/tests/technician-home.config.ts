import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".", testMatch: ["open-work-search.spec.ts", "technician-home-ownership.spec.ts", "technician-sidebar-navigation.spec.ts"],
  fullyParallel: false, outputDir: "../test-results/s6-home",
  use: { baseURL: "http://127.0.0.1:4196", browserName: "chromium", headless: true },
  webServer: {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4196 --strictPort",
    cwd: process.cwd(), url: "http://127.0.0.1:4196", reuseExistingServer: false, timeout: 60_000
  }
});
