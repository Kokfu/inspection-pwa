import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

// Isolated dev-server port: R1 can run while another checkpoint owns 4175.
export default defineConfig({
  ...base,
  testDir: ".",
  outputDir: new URL("../../../test-results/remarks-r1", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  testMatch: ["section-remarks-form.spec.ts", "common-remarks.spec.ts", "section-remarks-store.spec.ts", "remarks-r1.spec.ts"],
  use: { ...base.use, baseURL: "http://127.0.0.1:4186" },
  webServer: {
    cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    command: "npm run dev -- --host 127.0.0.1 --port 4186 --strictPort",
    url: "http://127.0.0.1:4186",
    reuseExistingServer: false,
    timeout: 120_000
  }
});
