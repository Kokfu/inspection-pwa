import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * T6: report approval. A supervisor or admin approves a completed visit's report from the Final
 * Report screen; the chip on Operations reflects the current derived state; the PDF stays withheld
 * until approved; a correction recorded after approval flips the state back to "re-approval needed".
 */
const supervisor = { id: 860, username: "review-lead", role: "supervisor" };
const admin = { id: 861, username: "the-admin", role: "admin" };
const jobId = "c0000000-0000-4000-8000-000000000860";
const visitBase = {
  id: jobId, reference: "SV-APPROVE-860", customer: "Approval Customer", site: "Approval Site", serviceDate: "2026-09-20",
  createdAt: "2026-09-20T01:00:00.000Z", serviceTime: "09:00", status: "closed" as const, systems: ["Wet Chemical System"],
  technician: { id: 22, displayName: "technician-two" }, inspectionProgress: { accepted: 1, required: 1 },
  completion: { completedAt: "2026-09-20T10:00:00.000Z", completedBy: { id: 22, username: "technician-two" } }
};
const report = {
  customer: visitBase.customer, site: visitBase.site, serviceDate: visitBase.serviceDate, jobReference: visitBase.reference,
  completedAt: visitBase.completion.completedAt, completedBy: "technician-two",
  systems: [{ systemKey: "wet_chemical", label: "Wet Chemical System", status: "Accepted", locations: ["Kitchen A"] }],
  sections: [{ systemKey: "wet_chemical", label: "Wet Chemical System", location: { locationId: "location-1", locationLabel: "Kitchen A", zoneId: "zone-1", zoneLabel: "Kitchen", instanceKey: "primary" }, fields: [{ label: "Main Supply", value: "Good", depth: 2 }], evidence: [] }]
};

type ApprovalState = {
  status: "not_applicable" | "awaiting_approval" | "approved";
  decidedBy: string | null; decidedByRole: "admin" | "supervisor" | null; decidedAt: string | null;
  note: string | null; latestCorrectionAt: string | null; correctedAfterApproval: boolean;
};

const awaiting: ApprovalState = { status: "awaiting_approval", decidedBy: null, decidedByRole: null, decidedAt: null, note: null, latestCorrectionAt: null, correctedAfterApproval: false };

async function installApi(page: Page, actor: typeof supervisor | typeof admin, initial: ApprovalState = awaiting) {
  const state = { approval: initial, posts: [] as Array<Record<string, unknown>> };
  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (payload: unknown, status = 200) => route.fulfill({ status, json: payload, headers: { "cache-control": "no-store" } });
    if (path === "/api/auth/me") return json({ user: actor });
    if (path === "/api/manager/service-visits") return json({ serviceVisits: [{ ...visitBase, reportApproval: state.approval }] });
    if (path === `/api/manager/service-visits/${jobId}`) return json({ serviceVisit: { ...visitBase, reportApproval: state.approval } });
    if (path === `/api/manager/service-visits/${jobId}/final-report`) return json({ report });
    if (path === `/api/manager/service-visits/${jobId}/final-report.pdf`) {
      if (state.approval.status !== "approved") return json({ error: "REPORT_NOT_APPROVED", message: "This report has not been approved yet." }, 409);
      return route.fulfill({ status: 200, contentType: "application/pdf", body: Buffer.from("%PDF-1.4 fake") });
    }
    if (path === `/api/manager/service-visits/${jobId}/corrections`) return json({ corrections: [] });
    if (path === `/api/manager/service-visits/${jobId}/report-approval`) {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as { requestId: string; decision: "approved" | "withdrawn"; note?: string; expectedStatus: string };
        state.posts.push(body);
        if (body.expectedStatus !== state.approval.status) return json({ error: "REPORT_APPROVAL_CONFLICT", message: "The report approval state changed since you loaded it." }, 409);
        if (body.decision === "withdrawn" && actor.role !== "admin") return json({ error: "REPORT_APPROVAL_WITHDRAW_FORBIDDEN", message: "Only an admin may withdraw a report approval." }, 403);
        state.approval = body.decision === "approved"
          ? { status: "approved", decidedBy: actor.username, decidedByRole: actor.role as "admin" | "supervisor", decidedAt: "2026-09-20T11:00:00.000Z", note: null, latestCorrectionAt: null, correctedAfterApproval: false }
          : { status: "awaiting_approval", decidedBy: actor.username, decidedByRole: actor.role as "admin" | "supervisor", decidedAt: "2026-09-20T12:00:00.000Z", note: body.note ?? null, latestCorrectionAt: null, correctedAfterApproval: false };
        return json({ reportApproval: state.approval, events: [] }, 201);
      }
      return json({ reportApproval: state.approval, events: [] });
    }
    if (path === "/api/manager/customers") return json({ customers: [] });
    if (path === "/api/manager/technicians") return json({ technicians: [] });
    return json({});
  });
  return state;
}

// A supervisor signs in through the Supervisor card, whose sidebar "Services" is the review list; an admin uses the Manager
// card, where "Services" is customer configuration and the service-visit list is "Operations".
async function openReport(page: Page, as: "supervisor" | "admin" = "supervisor") {
  await page.goto("/tests/manager-service-editor.html#/manager");
  await page.getByRole("button", { name: as === "admin" ? /^Manager Monitor/ : /^Supervisor Review/ }).click();
  await page.getByLabel("Primary navigation").getByRole("button", { name: as === "admin" ? "Operations" : "Services", exact: true }).click();
  await page.getByRole("button", { name: /SV-APPROVE-860/ }).click();
  await page.getByRole("button", { name: "View Final Report" }).click();
  await expect(page.getByRole("heading", { name: "Final Report" })).toBeVisible();
}

test("a supervisor approves the report and the Operations chip updates", async ({ page }) => {
  const api = await installApi(page, supervisor);
  await openReport(page);
  await expect(page.getByRole("heading", { name: "Awaiting approval" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeDisabled();

  await page.getByRole("button", { name: "Approve report" }).click();
  await expect(page.getByRole("heading", { name: "Report approved" })).toBeVisible();
  await expect(page.getByText("review-lead (supervisor)", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  expect(api.posts).toHaveLength(1);
  expect(api.posts[0]!.decision).toBe("approved");
  expect(api.posts[0]!.expectedStatus).toBe("awaiting_approval");

  // A supervisor never sees a withdraw control.
  await expect(page.getByRole("button", { name: "Withdraw approval" })).toHaveCount(0);

  await page.getByRole("button", { name: /^Back to/ }).click();
  await expect(page.getByText("Approved review-lead", { exact: false })).toBeVisible();
});

test("an admin can withdraw an approval with a required note", async ({ page }) => {
  const approvedByAdmin: ApprovalState = { status: "approved", decidedBy: "the-admin", decidedByRole: "admin", decidedAt: "2026-09-20T11:00:00.000Z", note: null, latestCorrectionAt: null, correctedAfterApproval: false };
  const api = await installApi(page, admin, approvedByAdmin);
  await openReport(page, "admin");
  await expect(page.getByRole("heading", { name: "Report approved" })).toBeVisible();
  await page.getByRole("button", { name: "Withdraw approval" }).click();
  await page.getByRole("button", { name: "Confirm withdraw" }).click();
  // A note is required before the withdraw is submitted.
  await expect(page.getByRole("alert")).toContainText("A note of at least 3 characters is required");
  expect(api.posts).toHaveLength(0);

  await page.getByLabel(/Reason for withdrawing/).fill("Wrong customer contact listed on the report");
  await page.getByRole("button", { name: "Confirm withdraw" }).click();
  await expect(page.getByRole("heading", { name: "Awaiting approval" })).toBeVisible();
  expect(api.posts).toHaveLength(1);
  expect(api.posts[0]!.decision).toBe("withdrawn");
  expect(api.posts[0]!.note).toBe("Wrong customer contact listed on the report");
});

test("a correction after approval shows re-approval needed and withholds the PDF again", async ({ page }) => {
  const correctedAfterApproval: ApprovalState = { status: "awaiting_approval", decidedBy: "review-lead", decidedByRole: "supervisor", decidedAt: "2026-09-20T11:00:00.000Z", note: null, latestCorrectionAt: "2026-09-20T12:00:00.000Z", correctedAfterApproval: true };
  await installApi(page, supervisor, correctedAfterApproval);
  await openReport(page);
  await expect(page.getByRole("heading", { name: /Awaiting approval — corrected after approval, re-approval needed/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve report" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeDisabled();
});
