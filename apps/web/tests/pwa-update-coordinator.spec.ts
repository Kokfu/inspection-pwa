import { expect, test } from "@playwright/test";

test("update coordinator safely handles waiting-worker activation and takeover", async ({ page }) => {
  await page.goto("/tests/pwa-update-coordinator.html");
  await page.getByRole("button", { name: "Run PWA update coordinator checks", exact: true }).click();

  await expect.poll(async () => {
    const text = await page.locator("#result").innerText();
    try {
      return JSON.parse(text).status;
    } catch {
      return "RUNNING";
    }
  }).not.toBe("RUNNING");

  const result = JSON.parse(await page.locator("#result").innerText()) as {
    status: string;
    cases: Array<{ name: string; pass: boolean }>;
  };
  expect(result.status, JSON.stringify(result, null, 2)).toBe("PASS");
  expect(result.cases).toHaveLength(15);
  expect(result.cases.every((scenario) => scenario.pass)).toBe(true);
});
