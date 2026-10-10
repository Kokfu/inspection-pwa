import { expect, test, type Page } from "@playwright/test";

// CR-01 Phase 1 (pilot: CO2 + Wet Chemical): ONE optional photo on a Good / N.A. result,
// driven through the real form and the real IndexedDB repository.  Capture and Submit run OFFLINE.
const MAIN = "charger_batteries.charger_battery_checks.main_supply";
const BATTERY = "charger_batteries.charger_battery_checks.battery";
const CHARGER = "charger_batteries.charger_battery_checks.charger";
const FIELD_COUNT = 11; // 3 charger + 2 physical + 6 function-key results in the fixture

type Pilot = {
  start(systemKey: string): Promise<string[]>;
  show(clientUuid: string): Promise<string>;
  snapshot(clientUuid: string): Promise<{ status: string; responses: Record<string, Record<string, { result: string }>>; photos: Array<{ photoUuid: string; fieldPath: string; syncStatus: string; bytes: number; type: string }>; evidenceOutbox: Array<{ entityId: string; status: string }>; manifest: Array<{ photoUuid: string; fieldPath: string; sourceSha256: string }> | null; parentOutbox: string | null }>;
  removePhoto(photoUuid: string, clientUuid: string): Promise<{ ok: boolean; message?: string }>;
};
const pilot = <K extends keyof Pilot>(page: Page, method: K, ...args: Parameters<Pilot[K]>) =>
  page.evaluate(([name, values]) => (window as unknown as { pilot: Record<string, (...a: unknown[]) => unknown> }).pilot[name as string]!(...(values as unknown[])), [method, args] as const) as Promise<Awaited<ReturnType<Pilot[K]>>>;

async function jpeg(page: Page, seed: number) {
  const base64 = await page.evaluate(async (value) => {
    const canvas = document.createElement("canvas"); canvas.width = 96; canvas.height = 72;
    const context = canvas.getContext("2d")!;
    context.fillStyle = `hsl(${(value * 53) % 360} 70% 45%)`; context.fillRect(0, 0, 96, 72);
    context.fillStyle = "#fff"; context.fillRect((value * 7) % 60, 10 + (value % 5) * 8, 20, 16);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((result) => resolve(result!), "image/jpeg", 0.9));
    let binary = ""; new Uint8Array(await blob.arrayBuffer()).forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }, seed);
  return { name: `photo-${seed}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(base64, "base64") };
}
const row = (page: Page, key: string) => page.locator(`#co2-check-${key}`);
async function attach(page: Page, key: string, seed: number) {
  await row(page, key).locator('input[type="file"]').setInputFiles(await jpeg(page, seed));
  await expect(row(page, key).getByText("Photo attached on this device")).toBeVisible();
}
const choose = (page: Page, key: string, label: string, name: RegExp) => row(page, key).getByRole("group", { name: `${label} result` }).getByRole("button", { name }).click();

for (const systemKey of ["co2_fire_extinguisher", "wet_chemical"] as const) {
  test.describe(`${systemKey}: optional photo on Good / N.A.`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/tests/optional-good-photo-pilot.html");
      await page.waitForFunction(() => Boolean((window as unknown as { pilot?: unknown }).pilot));
    });

    test("offline: a Good and an N.A. result take an optional photo beside the required one; Submit stages all three", async ({ page, context }) => {
      const [a] = await pilot(page, "start", systemKey);
      await pilot(page, "show", a!);
      // Only Good / N.A. rows get the slot; the finding keeps its own required-photo control.
      await expect(page.locator(".optional-photo-slot")).toHaveCount(FIELD_COUNT - 1);
      await expect(row(page, "main_supply").locator(".optional-photo-slot")).toHaveCount(0);
      await expect(row(page, "main_supply").locator(`[aria-label="Evidence photo for ${MAIN}"]`)).toHaveCount(1);
      await expect(row(page, "battery").getByText("Photo (optional)")).toBeVisible();
      await expect(row(page, "battery").getByRole("button", { name: "Remove Photo" })).toHaveCount(0);

      await context.setOffline(true);
      await attach(page, "battery", 1);
      await expect(row(page, "battery").getByRole("button", { name: "Remove Photo" })).toBeVisible();
      await choose(page, "charger", "Charger", /N\.A\./);
      await attach(page, "charger", 2);

      // The finding still needs its OWN photo: the two optional photos do not stand in for it.
      await page.getByRole("button", { name: "Submit Inspection" }).click();
      const summary = page.locator(".validation-summary");
      await expect(summary).toContainText(`${MAIN} requires its own Photo`);
      await expect(summary).not.toContainText(BATTERY);
      await expect(summary).not.toContainText(CHARGER);
      expect((await pilot(page, "snapshot", a!)).status).toBe("Draft");

      await attach(page, "main_supply", 3);
      await page.getByRole("button", { name: "Submit Inspection" }).click();
      await expect.poll(async () => (await pilot(page, "snapshot", a!)).status).toBe("Pending");
      const snapshot = await pilot(page, "snapshot", a!);
      expect(snapshot.photos.map((photo) => photo.fieldPath).sort()).toEqual([BATTERY, CHARGER, MAIN].sort());
      expect(snapshot.photos.every((photo) => photo.syncStatus === "Pending" && photo.bytes > 0 && photo.type === "image/jpeg")).toBe(true);
      expect(snapshot.manifest!.map((entry) => entry.fieldPath).sort()).toEqual([BATTERY, CHARGER, MAIN].sort());
      expect(snapshot.manifest!.every((entry) => Object.keys(entry).sort().join() === "fieldPath,photoUuid,sourceSha256")).toBe(true);
      expect(snapshot.evidenceOutbox).toHaveLength(3);
      expect(snapshot.responses.chargerAndBatteries!.charger!.result).toBe("na");
      expect(snapshot.parentOutbox).toBe("Pending");

      // A photo that has left Draft cannot be removed from this device.
      const refused = await pilot(page, "removePhoto", snapshot.photos.find((photo) => photo.fieldPath === BATTERY)!.photoUuid, a!);
      expect(refused.ok).toBe(false);
      expect((await pilot(page, "snapshot", a!)).photos).toHaveLength(3);
    });

    test("Submit works with no optional photo at all", async ({ page, context }) => {
      const [, b] = await pilot(page, "start", systemKey);
      await pilot(page, "show", b!);
      await context.setOffline(true);
      await page.getByRole("button", { name: "Submit Inspection" }).click();
      await expect.poll(async () => (await pilot(page, "snapshot", b!)).status).toBe("Pending");
      const snapshot = await pilot(page, "snapshot", b!);
      expect(snapshot.photos).toHaveLength(0);
      expect(snapshot.manifest).toEqual([]);
      expect(snapshot.evidenceOutbox).toHaveLength(0);
    });

    test("Poor then Good keeps the photo as the optional photo; it survives a reload and is submitted", async ({ page, context }) => {
      const [, , c] = await pilot(page, "start", systemKey);
      await pilot(page, "show", c!);
      await attach(page, "main_supply", 4); // required photo for the finding
      await choose(page, "main_supply", "Main Supply", /^✓?Good$/);
      const kept = row(page, "main_supply").locator(".optional-photo-slot");
      await expect(kept).toHaveCount(1);
      await expect(kept.getByText("Photo attached on this device")).toBeVisible();
      await expect(kept.getByRole("button", { name: "Remove Photo" })).toBeVisible();
      await page.getByRole("button", { name: "Save Draft" }).click();
      await expect.poll(async () => (await pilot(page, "snapshot", c!)).responses.chargerAndBatteries!.main_supply!.result).toBe("good");

      await page.reload();
      await page.waitForFunction(() => Boolean((window as unknown as { pilot?: unknown }).pilot));
      await pilot(page, "show", c!);
      await expect(row(page, "main_supply").locator(".optional-photo-slot").getByText("Photo attached on this device")).toBeVisible();

      await context.setOffline(true);
      await page.getByRole("button", { name: "Submit Inspection" }).click();
      await expect.poll(async () => (await pilot(page, "snapshot", c!)).status).toBe("Pending");
      const snapshot = await pilot(page, "snapshot", c!);
      expect(snapshot.manifest!.map((entry) => entry.fieldPath)).toEqual([MAIN]);
      expect(snapshot.evidenceOutbox).toHaveLength(1);
    });

    test("Remove takes a Draft optional photo off the device and Submit still works", async ({ page, context }) => {
      const [, , , d] = await pilot(page, "start", systemKey);
      await pilot(page, "show", d!);
      await context.setOffline(true);
      await attach(page, "battery", 5);
      expect((await pilot(page, "snapshot", d!)).photos).toHaveLength(1);
      await row(page, "battery").getByRole("button", { name: "Remove Photo" }).click();
      await expect(row(page, "battery").getByText("Photo removed.")).toBeVisible();
      await expect(row(page, "battery").getByText("No photo attached")).toBeVisible();
      await expect(row(page, "battery").getByRole("button", { name: "Remove Photo" })).toHaveCount(0);
      expect((await pilot(page, "snapshot", d!)).photos).toHaveLength(0);
      // Replacing is the same capture control: one photo per field.
      await attach(page, "battery", 6);
      await attach(page, "battery", 7);
      expect((await pilot(page, "snapshot", d!)).photos).toHaveLength(1);
      await page.getByRole("button", { name: "Submit Inspection" }).click();
      await expect.poll(async () => (await pilot(page, "snapshot", d!)).status).toBe("Pending");
      expect((await pilot(page, "snapshot", d!)).manifest!.map((entry) => entry.fieldPath)).toEqual([BATTERY]);
    });

    test("the slot fits a 360 px phone: no horizontal scroll, touch targets of 44 px", async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      const [a] = await pilot(page, "start", systemKey);
      await pilot(page, "show", a!);
      await attach(page, "battery", 8);
      const slot = row(page, "battery").locator(".optional-photo-slot");
      await slot.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const box = (await slot.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(360);
      for (const control of [slot.getByRole("button", { name: "Remove Photo" }), slot.getByRole("button", { name: "Replace with Camera" }), slot.getByRole("button", { name: "Replace from Gallery" })]) {
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
      }
    });
  });
}
