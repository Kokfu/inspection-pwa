import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

// Isolated dev-server port so R3 checks can run next to another checkpoint that owns 4175.
export default defineConfig({
  ...base,
  testDir: ".",
  outputDir: new URL("../../../test-results/remark-requests-r3", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  testMatch: ["automatic-sprinkler*.spec.ts", "section-remarks*.spec.ts", "common-remarks.spec.ts", "remarks-r1.spec.ts", "remark-requests*.spec.ts", "auto-sync-lock.spec.ts", "connectivity-recovery.spec.ts", "sync-refusal-engine.spec.ts", "header-*.spec.ts", "technician-*.spec.ts", "supervisor-*.spec.ts", "manager-*.spec.ts", "proposal-filters-spacing.spec.ts", "location-proposals-unreadable.spec.ts", "layout-proposal-already-pending.spec.ts", "offline-*.spec.ts", "draft-autosave*.spec.ts", "form-stays-mounted-on-autosave.spec.ts", "label-override-*.spec.ts", "hygiene-bundle.spec.ts", "photo-capture-actions.spec.ts", "optional-good-photo-pilot.spec.ts", "result-tap-scroll.spec.ts", "new-service-visit-*.spec.ts", "autosave-strip-idle.spec.ts"],
  use: { ...base.use, baseURL: "http://127.0.0.1:4189" },
  webServer: {
    cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    command: "npm run dev -- --host 127.0.0.1 --port 4189 --strictPort",
    url: "http://127.0.0.1:4189",
    reuseExistingServer: false,
    timeout: 120_000
  }
});
