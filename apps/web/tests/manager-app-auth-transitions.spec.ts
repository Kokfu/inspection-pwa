import { expect, test } from "@playwright/test";

test("mounted App Manager authorization transitions A-F", async ({ page }) => {
  await page.goto("/tests/manager-app-auth-transitions.html");
  await page.getByRole("button", { name: "Run mounted App Manager authorization transitions", exact: true }).click();

  await expect.poll(async () => {
    const text = await page.locator("#result").innerText();
    try {
      return JSON.parse(text).status;
    } catch {
      return "RUNNING";
    }
  }, { timeout: 30_000 }).toBe("PASS");

  const result = JSON.parse(await page.locator("#result").innerText()) as {
    status: string;
    cases: Array<{ name: string; pass: boolean }>;
  };
  expect(result.cases).toHaveLength(6);
  expect(result.cases.every((scenario) => scenario.pass)).toBe(true);

  // Verification-only switch: proves the test command returns non-zero when
  // its visible harness assertion is not satisfied without altering the harness.
  expect(result.status).toBe(process.env.MANAGER_APP_AUTH_FORCE_FAILURE ? "FORCED_FAILURE" : "PASS");
});
