import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * T5b: a supervisor opens an accepted record from the service visit, corrects a field with a reason, and
 * sees the correction next to the original. The accepted record is server-side immutable; these specs
 * cover the screens — the unsaved-changes guard, the required reason, the conflict message, the
 * unsupported record, and the Final Report notice with its disabled PDF button.
 */
const supervisor = { id: 840, username: "review-lead", role: "supervisor" };
const jobId = "c0000000-0000-4000-8000-000000000840";
const clientUuid = "c0000000-0000-4000-8000-000000000841";
const legacyUuid = "c0000000-0000-4000-8000-000000000842";
const visit = {
  id: jobId, reference: "SV-CORRECT-840", customer: "Correction Customer", site: "Correction Site", serviceDate: "2026-09-18",
  createdAt: "2026-09-18T01:00:00.000Z", serviceTime: "09:00", status: "closed", systems: ["Wet Chemical System"],
  technician: { id: 21, displayName: "technician-one" }, inspectionProgress: { accepted: 1, required: 1 },
  completion: { completedAt: "2026-09-18T10:00:00.000Z", completedBy: { id: 21, username: "technician-one" } }
};
const report = {
  customer: visit.customer, site: visit.site, serviceDate: visit.serviceDate, jobReference: visit.reference,
  completedAt: visit.completion.completedAt, completedBy: "technician-one",
  systems: [{ systemKey: "wet_chemical", label: "Wet Chemical System", status: "Accepted", locations: ["Kitchen A"] }],
  sections: [{ systemKey: "wet_chemical", label: "Wet Chemical System", location: { locationId: "location-1", locationLabel: "Kitchen A", zoneId: "zone-1", zoneLabel: "Kitchen", instanceKey: "primary" }, fields: [{ label: "Main Supply", value: "Good", depth: 2 }], evidence: [] }]
};
const mainSupply = "chargerAndBatteries.main_supply.result";
const reading = "measurements.jockey_pump.values.cut_in";

type Correction = { id: string; fieldPath: string; sequence: number; previousValue: unknown; newValue: unknown; reason: string; correctedBy: string; correctedByRole: string; correctedAt: string; requestId: string; label?: string; clientUuid?: string; systemKey?: string; instanceKey?: string };

async function installApi(page: Page, options: { conflict?: boolean; contractViolation?: boolean; breakReloadAfterSave?: boolean } = {}) {
  const state = {
    corrections: [] as Correction[],
    values: { [mainSupply]: "good" as unknown, "chargerAndBatteries.main_supply.remarks": "" as unknown, [reading]: 40 as unknown },
    posts: [] as Array<Record<string, unknown>>,
    reloadBroken: false
  };
  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (payload: unknown, status = 200) => route.fulfill({ status, json: payload, headers: { "cache-control": "no-store" } });
    if (path === "/api/auth/me") return json({ user: supervisor });
    if (path === "/api/manager/service-visits") return json({ serviceVisits: [visit] });
    if (path === `/api/manager/service-visits/${jobId}`) return json({ serviceVisit: visit });
    if (path === `/api/manager/service-visits/${jobId}/final-report`) return json({ report });
    if (path === `/api/manager/service-visits/${jobId}/final-report.pdf`) return json({ error: "FINAL_REPORT_HAS_CORRECTIONS", message: "This visit was corrected after submission." }, 409);
    if (path === `/api/manager/service-visits/${jobId}/accepted-records`) {
      return json({ records: [
        { clientUuid, systemKey: "wet_chemical", systemLabel: "Wet Chemical System", instanceKey: "location:1", zoneLabel: "Kitchen", locationLabel: "Kitchen A", performedAt: "2026-09-18T09:30:00.000Z", correctionCount: state.corrections.length, supported: true },
        { clientUuid: legacyUuid, systemKey: "fire_alarm_detector", systemLabel: "Fire Alarm System", instanceKey: "primary", zoneLabel: null, locationLabel: null, performedAt: "2026-09-18T09:40:00.000Z", correctionCount: 0, supported: false }
      ] });
    }
    if (path === `/api/manager/service-visits/${jobId}/corrections`) {
      return json({ corrections: state.corrections.map((correction) => ({ ...correction, clientUuid, systemKey: "wet_chemical", instanceKey: "location:1", label: "Charger & Batteries › Main Supply › Result" })) });
    }
    if (path === `/api/manager/inspections/${legacyUuid}/corrections`) {
      return json({ clientUuid: legacyUuid, jobId, jobReference: visit.reference, systemKey: "fire_alarm_detector", instanceKey: "primary", supported: false, fields: [], corrections: [] });
    }
    if (path === `/api/manager/inspections/${clientUuid}/corrections`) {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as { requestId: string; reason: string; changes: Array<{ fieldPath: string; expectedCurrentValue: unknown; newValue: unknown }> };
        state.posts.push(body);
        if (options.conflict) return json({ error: "CORRECTION_CONFLICT", message: "The inspection changed since you opened it. Reload and try again." }, 409);
        if (options.contractViolation) return json({ error: "CORRECTION_CONTRACT_VIOLATION", message: "The corrected inspection would not match its frozen form definition." }, 422);
        const stored = body.changes.map((change, index) => {
          const previousValue = state.values[change.fieldPath];
          state.values[change.fieldPath] = change.newValue;
          return { id: `${body.requestId}:${index}`, fieldPath: change.fieldPath, sequence: state.corrections.filter((row) => row.fieldPath === change.fieldPath).length + 1, previousValue, newValue: change.newValue, reason: body.reason, correctedBy: supervisor.username, correctedByRole: "supervisor", correctedAt: "2026-09-20T02:00:00.000Z", requestId: body.requestId };
        });
        state.corrections = [...state.corrections, ...stored as Correction[]];
        if (options.breakReloadAfterSave) state.reloadBroken = true;
        return json({ corrections: stored }, 201);
      }
      if (state.reloadBroken) return json({ error: "INTERNAL_SERVER_ERROR" }, 500);
      const original: Record<string, unknown> = { [mainSupply]: "good", "chargerAndBatteries.main_supply.remarks": "", [reading]: 40 };
      return json({
        clientUuid, jobId, jobReference: visit.reference, systemKey: "wet_chemical", instanceKey: "location:1", supported: true,
        corrections: state.corrections,
        fields: [
          { fieldPath: mainSupply, label: "Charger & Batteries › Main Supply › Result", kind: "result", value: state.values[mainSupply], originalValue: original[mainSupply], corrected: state.corrections.some((row) => row.fieldPath === mainSupply), options: ["good", "not_good", "complete_repair", "na"] },
          { fieldPath: "chargerAndBatteries.main_supply.remarks", label: "Charger & Batteries › Main Supply › Remarks", kind: "text", value: state.values["chargerAndBatteries.main_supply.remarks"], originalValue: "", corrected: false },
          { fieldPath: reading, label: "Measurements › Jockey Pump › Cut In", kind: "reading", value: state.values[reading], originalValue: original[reading], corrected: state.corrections.some((row) => row.fieldPath === reading) }
        ]
      });
    }
    if (path === "/api/manager/customers") return json({ customers: [] });
    if (path === "/api/manager/technicians") return json({ technicians: [] });
    return json({});
  });
  return state;
}

async function openVisit(page: Page) {
  await page.goto("/tests/manager-service-editor.html#/manager");
  await page.getByRole("button", { name: /^Manager Monitor/ }).click();
  await page.getByRole("button", { name: "Services", exact: true }).click();
  await page.getByRole("button", { name: /SV-CORRECT-840/ }).click();
  await expect(page.getByRole("heading", { name: "Accepted records" })).toBeVisible();
}

test("supervisor corrects a result with a reason; the original stays visible", async ({ page }) => {
  const api = await installApi(page);
  await openVisit(page);
  await page.getByRole("button", { name: "Review / correct" }).click();
  await expect(page).toHaveURL(new RegExp(`#/manager-correction/${clientUuid}$`));
  await expect(page.getByText("The accepted inspection is never changed.", { exact: false })).toBeVisible();

  const field = page.locator(".manager-wording-label-row", { hasText: "Main Supply › Result" });
  await field.getByRole("button", { name: "Not Good" }).click();
  await expect(page.getByText("1 unsaved correction")).toBeVisible();
  // A reason is required before anything can be saved.
  await expect(page.getByRole("button", { name: "Save corrections" })).toBeDisabled();
  await page.getByLabel(/Reason for these corrections/).fill("Terminal corrosion found on the evidence photo");
  await page.getByRole("button", { name: "Save corrections" }).click();

  await expect(page.getByText("Corrections saved.", { exact: false })).toBeVisible();
  await expect(field.getByText("Corrected", { exact: true })).toBeVisible();
  await expect(field.getByText("Originally: Good")).toBeVisible();
  await expect(field.getByText(/Good → Not Good · review-lead \(supervisor\)/)).toBeVisible();
  expect(api.posts).toHaveLength(1);
  expect(api.posts[0]!.changes).toEqual([{ fieldPath: mainSupply, expectedCurrentValue: "good", newValue: "not_good" }]);
  expect(String(api.posts[0]!.reason)).toBe("Terminal corrosion found on the evidence photo");
});

test("leaving with unsaved corrections asks first", async ({ page }) => {
  await installApi(page);
  await openVisit(page);
  await page.getByRole("button", { name: "Review / correct" }).click();
  await page.locator(".manager-wording-label-row", { hasText: "Main Supply › Result" }).getByRole("button", { name: "N.A." }).click();

  const dialogs: string[] = [];
  page.once("dialog", (dialog) => { dialogs.push(dialog.message()); void dialog.dismiss(); });
  await page.getByRole("button", { name: "Back to service visit" }).click();
  expect(dialogs).toEqual(["You have 1 unsaved correction. Leave without saving?"]);
  await expect(page).toHaveURL(new RegExp(`#/manager-correction/${clientUuid}$`));

  page.once("dialog", (dialog) => { dialogs.push(dialog.message()); void dialog.accept(); });
  await page.getByRole("button", { name: "Back to service visit" }).click();
  await expect(page).toHaveURL(new RegExp(`#/manager-service-visit/${jobId}$`));
  expect(dialogs).toHaveLength(2);
});

test("a conflicting correction is reported and nothing is claimed as saved", async ({ page }) => {
  await installApi(page, { conflict: true });
  await openVisit(page);
  await page.getByRole("button", { name: "Review / correct" }).click();
  await page.locator(".manager-wording-label-row", { hasText: "Main Supply › Result" }).getByRole("button", { name: "Complete Repair" }).click();
  await page.getByLabel(/Reason for these corrections/).fill("Repaired during the follow-up visit");
  await page.getByRole("button", { name: "Save corrections" }).click();
  await expect(page.getByRole("alert")).toContainText("The inspection changed since you opened it");
  await expect(page.getByText("Corrections saved.", { exact: false })).toHaveCount(0);
});

test("a record outside the supported systems is read-only", async ({ page }) => {
  await installApi(page);
  await openVisit(page);
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Corrections are available for V7 inspections");
  await expect(page.getByRole("button", { name: "Save corrections" })).toHaveCount(0);
});

test("the Final Report lists corrections and offers no PDF until they are included", async ({ page }) => {
  const api = await installApi(page);
  api.corrections.push({ id: "correction-1", fieldPath: mainSupply, sequence: 1, previousValue: "good", newValue: "not_good", reason: "Terminal corrosion found", correctedBy: "review-lead", correctedByRole: "supervisor", correctedAt: "2026-09-20T02:00:00.000Z", requestId: "request-1" });
  await openVisit(page);
  await page.getByRole("button", { name: /View report|Final Report/ }).first().click();
  await expect(page.getByRole("heading", { name: /1 correction was made after submission/ })).toBeVisible();
  await expect(page.getByText(/Main Supply › Result: Good → Not Good/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeDisabled();
});

test("a numeric reading is corrected as a number, not as typed text", async ({ page }) => {
  const api = await installApi(page);
  await openVisit(page);
  await page.getByRole("button", { name: "Review / correct" }).click();
  const field = page.locator(".manager-wording-label-row", { hasText: "Cut In" });
  await field.getByRole("textbox").fill("45");
  await page.getByLabel(/Reason for these corrections/).fill("Gauge re-read after calibration");
  await page.getByRole("button", { name: "Save corrections" }).click();
  await expect(page.getByText("Corrections saved.", { exact: false })).toBeVisible();
  expect(api.posts[0]!.changes).toEqual([{ fieldPath: reading, expectedCurrentValue: 40, newValue: 45 }]);
  await expect(field.getByText("40 → 45", { exact: false })).toBeVisible();
});

test("a contract refusal is shown and the unsaved corrections stay on screen", async ({ page }) => {
  await installApi(page, { contractViolation: true });
  await openVisit(page);
  await page.getByRole("button", { name: "Review / correct" }).click();
  await page.locator(".manager-wording-label-row", { hasText: "Main Supply › Remarks" }).getByRole("textbox").fill("x".repeat(60));
  await page.getByLabel(/Reason for these corrections/).fill("Remark rewritten after review");
  await page.getByRole("button", { name: "Save corrections" }).click();
  await expect(page.getByRole("alert")).toContainText("would not match its frozen form definition");
  // The Manager experience stays up and the work is not lost.
  await expect(page.getByText("1 unsaved correction")).toBeVisible();
  await expect(page.getByText("Choose how you are signing in")).toHaveCount(0);
});

test("a decimal reading survives being typed one key at a time", async ({ page }) => {
  const api = await installApi(page);
  await openVisit(page);
  await page.getByRole("button", { name: "Review / correct" }).click();
  const input = page.locator(".manager-wording-label-row", { hasText: "Cut In" }).getByRole("textbox");
  await input.fill("");
  await input.pressSequentially("45.5");
  await expect(input).toHaveValue("45.5");
  await page.getByLabel(/Reason for these corrections/).fill("Gauge re-read after calibration");
  await page.getByRole("button", { name: "Save corrections" }).click();
  await expect(page.getByText("Corrections saved.", { exact: false })).toBeVisible();
  expect(api.posts[0]!.changes).toEqual([{ fieldPath: reading, expectedCurrentValue: 40, newValue: 45.5 }]);
});

test("a save that lands but cannot refresh says so instead of claiming a clean save", async ({ page }) => {
  await installApi(page, { breakReloadAfterSave: true });
  await openVisit(page);
  await page.getByRole("button", { name: "Review / correct" }).click();
  await page.locator(".manager-wording-label-row", { hasText: "Main Supply › Result" }).getByRole("button", { name: "Not Good" }).click();
  await page.getByLabel(/Reason for these corrections/).fill("Terminal corrosion found on the evidence photo");
  await page.getByRole("button", { name: "Save corrections" }).click();
  await expect(page.getByText("Corrections saved, but this screen could not refresh.", { exact: false })).toBeVisible();
  // The write landed, so the supervisor stays on the screen rather than being thrown out of Manager.
  await expect(page.getByText("Choose how you are signing in")).toHaveCount(0);
});
