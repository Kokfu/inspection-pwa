import assert from "node:assert/strict";
import test from "node:test";
import { visibleActionNotice } from "../src/repairVisits/repairVisitPresentation.js";

/** OA-6: the one-off delivery message must not outlive the pending/syncing state. */
const sent = "Submitted. Sending to the server…";

test("a delivery notice shows while the visit is pending or syncing", () => {
  assert.equal(visibleActionNotice(sent, true, "pending"), sent);
  assert.equal(visibleActionNotice(sent, true, "syncing"), sent);
});

test("a delivery notice is hidden once the visit is waiting, approved, returned, in need of attention or draft", () => {
  for (const tone of ["waiting", "approved", "returned", "attention", "draft"] as const) assert.equal(visibleActionNotice(sent, true, tone), "", tone);
});

test("other notices (for example reopening for edit) are unaffected by the tone", () => {
  const reopened = "You can edit this repair visit again. Submit it when it is complete.";
  for (const tone of ["draft", "pending", "waiting", "returned"] as const) assert.equal(visibleActionNotice(reopened, false, tone), reopened);
});
