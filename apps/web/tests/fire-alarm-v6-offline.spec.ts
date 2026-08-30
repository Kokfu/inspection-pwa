import { expect, test } from "@playwright/test";

async function result(page: import("@playwright/test").Page, expected: string) {
  await expect.poll(async () => {
    try { return JSON.parse(await page.locator("#result").innerText()).status; }
    catch { return "RUNNING"; }
  }, { timeout: 30_000 }).toBe(expected);
  return JSON.parse(await page.locator("#result").innerText());
}

test("V6 Fire Alarm retains frozen Poor evidence identity through offline reload, failed stage, reload, and exact retry", async ({ page }) => {
  await page.goto("/tests/fire-alarm-v6-offline.html");
  await page.locator("#run").click();
  const offlineSubmission = await result(page, "READY_RELOAD");
  await page.reload();
  await page.evaluate(() => (window as Window & { runAfterReload: () => Promise<void> }).runAfterReload());
  const failedAttempt = await result(page, "READY_RETRY_RELOAD");
  await page.reload();
  await page.evaluate(() => (window as Window & { runAfterFailureReload: () => Promise<void> }).runAfterFailureReload());
  const retried = await result(page, "PASS");
  const initial = offlineSubmission.snapshot;
  const beforeFailure = failedAttempt.snapshots.beforeFailure;
  const afterFailure = failedAttempt.snapshots.afterFailure;
  const beforeRetry = retried.snapshots.beforeRetry;
  const afterRetry = retried.snapshots.afterRetry;
  expect(beforeFailure.identity).toEqual(initial.identity);
  expect(afterFailure.identity).toEqual(initial.identity);
  expect(beforeRetry.identity).toEqual(afterFailure.identity);
  expect(afterRetry.identity).toEqual(initial.identity);
  expect(beforeRetry.state).toEqual(afterFailure.state);
  const frozen = JSON.parse(initial.identity.form.frozenResponse);
  expect(frozen.chargerAndBatteries.main_supply).toEqual({ result: "poor", remarks: "Static main-supply own remark" });
  expect(frozen.chargerAndBatteries.battery.result).toBe("good");
  expect(frozen.chargerAndBatteries.charger.result).toBe("not_relevant");
  expect(beforeFailure.state.poorRemarks).toEqual({
    alarmBell: { result: "poor", remarks: "Poor alarm-bell own remark", rowRemarks: "Row-general remark must not replace either Poor-field remark" },
    manualCallPoint: { result: "poor", remarks: "Poor manual-call-point own remark", rowRemarks: "Row-general remark must not replace either Poor-field remark" }
  });
  expect(failedAttempt.network.acceptance).toEqual([]);
  expect(failedAttempt.network.stages).toHaveLength(3);
  expect(retried.network.stages).toHaveLength(1);
  expect(retried.network.acceptance).toHaveLength(1);
  expect(retried.network.stages[0]).toEqual(failedAttempt.network.stages[1]);
  expect(retried.network.order.at(-1)).toBe("acceptance");
  expect(afterRetry.identity.form.formCount).toBe(1);
  expect(new Set(initial.identity.evidence.map((item: { photoUuid: string }) => item.photoUuid)).size).toBe(3);
});
