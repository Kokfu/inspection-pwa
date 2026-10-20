import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

// Isolated dev-server port so the R4 checks can run next to another checkpoint that owns 4175 or 4189.
export default defineConfig({
  ...base,
  testDir: ".",
  timeout: 90_000,
  outputDir: new URL("../../../test-results/remark-requests-r4", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  // Name the specs on the command line; this config only isolates the port (4190).
  testMatch: ["*.spec.ts"],
  use: { ...base.use, baseURL: "http://127.0.0.1:4190" },
  webServer: {
    cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    command: "npm run dev -- --host 127.0.0.1 --port 4190 --strictPort",
    url: "http://127.0.0.1:4190",
    reuseExistingServer: false,
    timeout: 120_000
  }
});
