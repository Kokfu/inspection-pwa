import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["customer-timeline.spec.ts", "technician-sidebar-navigation.spec.ts", "manager-technician-services-done.spec.ts", "manager-supervisor.spec.ts"],
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:4198", browserName: "chromium", headless: true },
  webServer: {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4198 --strictPort",
    cwd: process.cwd(), url: "http://127.0.0.1:4198", reuseExistingServer: false, timeout: 60_000
  }
});
