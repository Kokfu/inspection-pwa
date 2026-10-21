import { defineConfig } from "@playwright/test";

// Dedicated port keeps this step's browser checks independent of other waves.
const port = process.env.S3A_TEST_PORT ?? "4186";
export default defineConfig({
  testDir: ".", testMatch: "manager-customer-records.spec.ts", fullyParallel: false,
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: "chromium", headless: true },
  webServer: { command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`, url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 120_000 }
});
