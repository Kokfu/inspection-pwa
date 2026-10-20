import { chromium, expect, test, type Page } from "@playwright/test";
import { pngBytes } from "./repairVisitMock";

const linkName = "Camera not working? Upload from gallery";
const confirmName = "This photo will be marked Uploaded from gallery for KPI.";
const file = { name: "gallery.png", mimeType: "image/png", buffer: pngBytes(90, 40, 60) };

async function camera(page: Page, mode: string) {
  await page.addInitScript(mode => {
    if (mode === "insecure") Object.defineProperty(window, "isSecureContext", { value: false });
    else if (mode === "unsupported") Object.defineProperty(navigator, "mediaDevices", { value: undefined });
    else if (mode !== "success" && mode !== "not-ready" && mode !== "denied") {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => { throw new DOMException("Start failed", mode); } });
    } else {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async (constraints: MediaStreamConstraints) => {
        const stream = await original(constraints);
        (window as any).testStream = stream;
        return stream;
      } });
      if (mode === "not-ready") {
        const width = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, "videoWidth")!;
        (window as any).restoreVideoWidth = () => Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", width);
        Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 0 });
      }
    }
  }, mode);
}

test.use({ viewport: { width: 375, height: 800 }, launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] } });

test.describe("shared photo actions component units", () => {
  for (const failure of ["insecure", "unsupported", "NotAllowedError", "NotFoundError", "NotReadableError", "AbortError", "Error"]) {
    test(`gallery only after start failure: ${failure}`, async ({ page }) => {
      await camera(page, failure);
      await page.goto("/tests/photo-capture-actions.html");
      await expect(page.getByRole("button", { name: "Take Photo", exact: true })).toBeVisible();
      await expect(page.getByText(linkName)).toHaveCount(0);
      await expect(page.getByLabel("Upload from gallery")).toBeHidden();
      await page.getByRole("button", { name: "Take Photo", exact: true }).click();
      await expect(page.getByText(linkName)).toBeVisible();
      await expect(page.getByRole("button", { name: "Capture", exact: true })).toBeDisabled();
    });
  }

  test("confirm opens picker; Cancel and Escape save nothing and return focus", async ({ page }) => {
    await camera(page, "NotAllowedError");
    await page.goto("/tests/photo-capture-actions.html");
    await page.getByRole("button", { name: "Take Photo", exact: true }).click();
    for (const cancel of ["button", "escape"]) {
      await page.getByText(linkName).click();
      const confirm = page.getByRole("dialog", { name: confirmName });
      await expect(confirm).toHaveAttribute("aria-modal", "true");
      await expect(confirm.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(confirm.getByRole("button", { name: "Confirm", exact: true })).toBeFocused();
      if (cancel === "escape") await page.keyboard.press("Escape");
      else await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(confirm).toHaveCount(0);
      await expect(page.getByText(linkName)).toBeFocused();
      await expect(page.locator("#saves")).toHaveText("0");
    }
    await page.getByText(linkName).click();
    const picker = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await (await picker).setFiles(file);
    await expect(page.locator("#source")).toHaveText("gallery");
    await expect(page.locator("#saves")).toHaveText("1");
  });

  test("post-start capture error keeps retry enabled, stream live, gallery locked", async ({ page }) => {
    await camera(page, "not-ready");
    await page.goto("/tests/photo-capture-actions.html");
    await page.getByRole("button", { name: "Take Photo", exact: true }).click();
    const capture = page.getByRole("button", { name: "Capture", exact: true });
    await expect(capture).toBeEnabled();
    await capture.click();
    await expect(page.getByText("Camera image is not ready yet.")).toBeVisible();
    await expect(capture).toBeEnabled();
    await expect(page.getByText(linkName)).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).testStream.getTracks().every((track: MediaStreamTrack) => track.readyState === "live"))).toBe(true);
    await page.evaluate(() => { (window as any).restoreVideoWidth(); });
    await expect.poll(() => page.locator("video").evaluate(v => (v as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
    await capture.click();
    await expect(page.locator("#source")).toHaveText("camera");
  });
});

test.describe("375px real form and IndexedDB", () => {
  for (const mode of ["success", "denied"]) {
    test(`${mode}: correct source and badge, offline persistence, touch targets`, async ({ page: fixturePage, context: fixtureContext }) => {
      // Chromium's deny mode rejects real getUserMedia with NotAllowedError.
      const deniedBrowser = mode === "denied" ? await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream=deny"] }) : undefined;
      const context = deniedBrowser ? await deniedBrowser.newContext({ viewport: { width: 375, height: 800 }, baseURL: "http://127.0.0.1:4175" }) : fixtureContext;
      const page = deniedBrowser ? await context.newPage() : fixturePage;
      try {
      await camera(page, mode);
      await page.goto("/tests/optional-good-photo-pilot.html");
      await page.waitForFunction(() => Boolean((window as any).pilot));
      const uuid = await page.evaluate(async () => {
        const [uuid] = await (window as any).pilot.start("co2_fire_extinguisher");
        await (window as any).pilot.show(uuid);
        return uuid;
      });
      await context.setOffline(true);
      const row = page.locator("#co2-check-battery");
      await row.getByRole("button", { name: "Take Photo", exact: true }).click();
      if (mode === "success") {
        await expect(page.getByText(linkName)).toHaveCount(0);
        await expect.poll(() => page.locator("video").evaluate(v => (v as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
        await page.getByRole("button", { name: "Capture", exact: true }).click();
      } else {
        await expect(page.getByText("Camera permission was denied.")).toBeVisible();
        const link = page.getByText(linkName);
        await expect(link).toBeVisible();
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await link.click();
        const confirm = page.getByRole("dialog", { name: confirmName });
        for (const button of await confirm.getByRole("button").all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const picker = page.waitForEvent("filechooser");
        await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
        await (await picker).setFiles(file);
      }
      await expect(row.getByText("Photo attached on this device")).toBeVisible();
      await expect(row.getByText("Uploaded from gallery", { exact: true })).toHaveCount(mode === "success" ? 0 : 1);
      const source = mode === "success" ? "camera" : "gallery";
      const stored = await page.evaluate(async uuid => {
        const { deviceDatabase } = await import("/src/db/localDatabase.ts");
        return (await deviceDatabase.inspectionAttachments.where("inspectionClientUuid").equals(uuid).toArray()).map((p: any) => p.captureSource);
      }, uuid);
      expect(stored).toEqual([source]);
      await page.evaluate(uuid => (window as any).pilot.show(uuid), uuid);
      await expect(row.getByText("Uploaded from gallery", { exact: true })).toHaveCount(source === "gallery" ? 1 : 0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await row.getByRole("button", { name: "Replace with Camera" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      } finally { await deniedBrowser?.close(); }
    });
  }
});

test("shared camera dialog fits phone, tablet and desktop", async ({ page }, info) => {
  await camera(page, "NotAllowedError");
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : 800 });
    await page.goto("/tests/photo-capture-actions.html");
    await page.getByRole("button", { name: "Take Photo", exact: true }).click();
    await page.getByText(linkName).click();
    await expect(page.getByRole("dialog", { name: confirmName })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const button of await page.getByRole("dialog", { name: confirmName }).getByRole("button").all()) {
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: info.outputPath(`photo-confirm-${width}.png`) });
  }
});

test("legacy PSI gallery badge remains visible in Draft and read-only; camera has no badge", async ({ page }) => {
  for (const status of ["Draft", "Pending", "Synced"]) for (const source of ["camera", "gallery", "unknown"]) {
    await page.goto(`/tests/photo-capture-actions.html?legacy=${status}&source=${source}`);
    await expect(page.locator(".photo-metadata")).toBeVisible();
    await expect(page.getByText("Uploaded from gallery", { exact: true })).toHaveCount(source === "gallery" ? 1 : 0);
    await expect(page.getByRole("button", { name: "Replace with Camera", exact: true })).toHaveCount(status === "Draft" ? 1 : 0);
  }
});

