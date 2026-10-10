import { expect, test } from "@playwright/test";

test("existing photo harness: camera lifecycle, cancellation, local persistence and sync", async ({ page }) => {
  await page.goto("/tests/automatic-sprinkler-photo-evidence.html");
  await page.locator('#run[data-handler-attached="true"]').click();
  await expect.poll(async () => {
    try { return JSON.parse(await page.locator("#result").innerText()).status; }
    catch { return "RUNNING"; }
  }, { timeout: 40_000 }).not.toBe("RUNNING");
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(result.status, JSON.stringify(result)).toBe("PASS");
});

test("CR-08: offline JPEG pixels, Malaysia processing clock, size and hash", async ({ page, context }) => {
  await page.goto("/tests/photo-watermark.html");
  await page.waitForFunction(() => Boolean((window as any).processPhoto));
  await context.setOffline(true);
  const result = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600; canvas.height = 1200;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, 1600, 1200);
    const input = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/jpeg"));
    const texts: string[] = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      texts.push(text); return original.call(this, text, ...args);
    };
    try {
      // Force the HTMLImageElement fallback too; it must stamp identically.
      const bitmapDecoder = window.createImageBitmap;
      const first = await (window as any).processPhoto(input, undefined, () => new Date("2026-10-10T06:32:00Z"));
      window.createImageBitmap = async () => { throw new Error("Partial bitmap support"); };
      let second;
      try { second = await (window as any).processPhoto(input, undefined, () => new Date("2026-10-10T16:01:00Z")); }
      finally { window.createImageBitmap = bitmapDecoder; }
      const bitmap = await createImageBitmap(first.blob);
      ctx.drawImage(bitmap, 0, 0); bitmap.close();
      const region = ctx.getImageData(1050, 1080, 530, 100).data;
      let dark = 0; let light = 0;
      for (let i = 0; i < region.length; i += 4) {
        if (region[i] < 160) dark++;
        if (region[i] > 220) light++;
      }
      const outside = ctx.getImageData(0, 0, 800, 800).data;
      const unchangedOutside = outside.every((value, index) => index % 4 === 3 || value > 250);
      const bytes = new Uint8Array(await first.blob.arrayBuffer());
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
      // White glyphs must survive within the dark box, not just outside it.
      const glyphRegion = ctx.getImageData(1170, 1125, 380, 35).data;
      let glyphPixels = 0;
      for (let i = 0; i < glyphRegion.length; i += 4) if (glyphRegion[i] > 220) glyphPixels++;
      return { texts, dark, light, glyphPixels, unchangedOutside, hash, reportedHash: first.sha256,
        timestampHashesDiffer: first.sha256 !== second.sha256, size: first.sizeBytes,
        actualSize: first.blob.size, jpeg: bytes[0] === 255 && bytes[1] === 216,
        mime: first.blob.type, width: first.width, height: first.height };
    } finally { CanvasRenderingContext2D.prototype.fillText = original; }
  });
  expect(result.texts).toEqual(["10 Oct 2026 14:32", "11 Oct 2026 00:01"]);
  expect(result.jpeg).toBe(true);
  expect(result.mime).toBe("image/jpeg");
  expect(result.size).toBe(result.actualSize);
  expect(result.size).toBeLessThanOrEqual(2 * 1024 * 1024);
  expect(result.hash).toBe(result.reportedHash);
  expect(result.timestampHashesDiffer).toBe(true);
  expect(result.dark).toBeGreaterThan(5000);
  expect(result.light).toBeGreaterThan(1000);
  expect(result.glyphPixels).toBeGreaterThan(100);
  expect(result.unchangedOutside).toBe(true);
});

test("CR-08: size retries redraw one stamp at the reduced output resolution", async ({ page }) => {
  await page.goto("/tests/photo-watermark.html");
  await page.waitForFunction(() => Boolean((window as any).processPhoto));
  const result = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 1600; canvas.height = 1200;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "white"; ctx.fillRect(0, 0, 1600, 1200);
    const source = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg"));
    const original = HTMLCanvasElement.prototype.toBlob;
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    let encodes = 0; let clocks = 0; const stamps: Array<{ text: string; width: number; font: string }> = [];
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      stamps.push({ text, width: this.canvas.width, font: this.font });
      return fillText.call(this, text, ...args);
    };
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      encodes++;
      original.call(this, (blob) => callback(encodes < 5 ? new Blob([blob!, new Uint8Array(2 * 1024 * 1024)], { type: "image/jpeg" }) : blob), ...args);
    };
    try {
      const photo = await (window as any).processPhoto(source, undefined, () => { clocks++; return new Date("2026-10-10T06:32:00Z"); });
      const bitmap = await createImageBitmap(photo.blob);
      const decodedWidth = bitmap.width; bitmap.close();
      return { encodes, clocks, stamps, width: photo.width, decodedWidth, size: photo.sizeBytes };
    } finally { HTMLCanvasElement.prototype.toBlob = original; CanvasRenderingContext2D.prototype.fillText = fillText; }
  });
  expect(result.encodes).toBe(5);
  expect(result.clocks).toBe(1);
  expect(result.stamps).toHaveLength(5);
  expect(result.stamps.every((s) => s.text === "10 Oct 2026 14:32")).toBe(true);
  expect(result.stamps[4].font).toContain("32px");
  expect(result.width).toBe(1296);
  expect(result.decodedWidth).toBe(result.width);
  expect(result.size).toBeLessThanOrEqual(2 * 1024 * 1024);
});

test("CR-08: representative 12 MP and 24 MP gallery processing measurements", async ({ page }) => {
  await page.goto("/tests/photo-watermark.html");
  await page.waitForFunction(() => Boolean((window as any).processPhoto));
  for (const [width, height] of [[4032, 3024], [6000, 4000]]) {
    const result = await page.evaluate(async ({ width, height }) => {
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      // Deterministic textured JPEG, rather than a tiny flat-color source.
      const pixels = ctx.createImageData(width, height);
      let seed = 12345;
      for (let i = 0; i < pixels.data.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        pixels.data[i] = seed & 255; pixels.data[i + 1] = (seed >>> 8) & 255;
        pixels.data[i + 2] = (seed >>> 16) & 255; pixels.data[i + 3] = 255;
      }
      ctx.putImageData(pixels, 0, 0);
      let source = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.92));
      const originalSourceBytes = source.size;
      let oversizedRejected = false;
      if (source.size > 20 * 1024 * 1024) {
        try { await (window as any).processPhoto(source); }
        catch (error) { oversizedRejected = error instanceof Error && error.message.includes("20 MB"); }
        // Measure an admissible 24 MP JPEG as well as the full-quality rejection.
        source = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.82));
      }
      canvas.width = 1; canvas.height = 1;
      const start = performance.now();
      const photo = await (window as any).processPhoto(source);
      return { originalSourceBytes, oversizedRejected, sourceBytes: source.size, outputBytes: photo.sizeBytes, width: photo.width, height: photo.height, elapsedMs: Math.round(performance.now() - start) };
    }, { width, height });
    console.log(JSON.stringify({ sourceWidth: width, sourceHeight: height, ...result }));
    expect(result.outputBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(Math.max(result.width, result.height)).toBe(1600);
    if (result.originalSourceBytes > 20 * 1024 * 1024) expect(result.oversizedRejected).toBe(true);
  }
});
