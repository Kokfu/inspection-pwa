import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveAutomaticSprinklerServerProgress,
  deriveNoLocalSystemProgress,
  type SystemProgress,
} from "../src/jobs/jobProgress";

type AuthStatus = "verified" | "offline-unverified" | "logged-out";
type SummaryState = "idle" | "loading" | "loaded" | "failed";
type EvidenceState = "not-required" | "complete" | "pending" | "failed" | "invalid";

const authStatuses: AuthStatus[] = ["verified", "offline-unverified", "logged-out"];
const summaryStates: SummaryState[] = ["idle", "loading", "loaded", "failed"];
const evidenceStates: EvidenceState[] = [
  "not-required",
  "complete",
  "pending",
  "failed",
  "invalid",
];

// Every summary shape the caller can pass: absent, plus one per evidenceState.
const summaries: { label: string; value: { evidenceState: EvidenceState } | undefined }[] = [
  { label: "undefined", value: undefined },
  ...evidenceStates.map((evidenceState) => ({
    label: evidenceState,
    value: { evidenceState },
  })),
];

const trusted = (authStatus: AuthStatus, serverSummaryState: SummaryState) =>
  authStatus === "verified" && serverSummaryState === "loaded";

const expectedForEvidenceState: Record<EvidenceState, SystemProgress> = {
  "not-required": "Completed",
  complete: "Completed",
  pending: "Pending Evidence",
  failed: "Needs Attention",
  invalid: "Needs Attention",
};

test("deriveAutomaticSprinklerServerProgress covers the full auth x summary-state x summary matrix", () => {
  let cases = 0;
  for (const authStatus of authStatuses) {
    for (const serverSummaryState of summaryStates) {
      for (const summary of summaries) {
        const expected: SystemProgress = !trusted(authStatus, serverSummaryState)
          ? "Unknown / Not Cached"
          : summary.value
            ? expectedForEvidenceState[summary.value.evidenceState]
            : "Unknown / Not Cached";
        assert.equal(
          deriveAutomaticSprinklerServerProgress(summary.value, authStatus, serverSummaryState),
          expected,
          `authStatus=${authStatus} serverSummaryState=${serverSummaryState} summary=${summary.label}`
        );
        cases += 1;
      }
    }
  }
  assert.equal(cases, authStatuses.length * summaryStates.length * summaries.length);
  assert.equal(cases, 72);
});

test("deriveAutomaticSprinklerServerProgress distrusts a cached summary unless auth is verified", () => {
  // The regression this guard closes: a summary cached from an earlier verified
  // session must not keep rendering "Completed" once auth is no longer verified.
  for (const authStatus of ["offline-unverified", "logged-out"] as AuthStatus[]) {
    for (const evidenceState of evidenceStates) {
      assert.equal(
        deriveAutomaticSprinklerServerProgress({ evidenceState }, authStatus, "loaded"),
        "Unknown / Not Cached",
        `authStatus=${authStatus} evidenceState=${evidenceState}`
      );
    }
  }
});

test("deriveAutomaticSprinklerServerProgress distrusts a cached summary unless the summary is loaded", () => {
  for (const serverSummaryState of ["idle", "loading", "failed"] as SummaryState[]) {
    for (const evidenceState of evidenceStates) {
      assert.equal(
        deriveAutomaticSprinklerServerProgress({ evidenceState }, "verified", serverSummaryState),
        "Unknown / Not Cached",
        `serverSummaryState=${serverSummaryState} evidenceState=${evidenceState}`
      );
    }
  }
});

test("deriveAutomaticSprinklerServerProgress derives from evidenceState when verified and loaded", () => {
  assert.equal(
    deriveAutomaticSprinklerServerProgress({ evidenceState: "not-required" }, "verified", "loaded"),
    "Completed"
  );
  assert.equal(
    deriveAutomaticSprinklerServerProgress({ evidenceState: "complete" }, "verified", "loaded"),
    "Completed"
  );
  assert.equal(
    deriveAutomaticSprinklerServerProgress({ evidenceState: "pending" }, "verified", "loaded"),
    "Pending Evidence"
  );
  assert.equal(
    deriveAutomaticSprinklerServerProgress({ evidenceState: "failed" }, "verified", "loaded"),
    "Needs Attention"
  );
  assert.equal(
    deriveAutomaticSprinklerServerProgress({ evidenceState: "invalid" }, "verified", "loaded"),
    "Needs Attention"
  );
});

test("deriveAutomaticSprinklerServerProgress reports an absent summary as not cached even when verified and loaded", () => {
  assert.equal(
    deriveAutomaticSprinklerServerProgress(undefined, "verified", "loaded"),
    "Unknown / Not Cached"
  );
});

test("deriveNoLocalSystemProgress covers the full accepted x auth x summary-state matrix", () => {
  let cases = 0;
  for (const serverAccepted of [true, false]) {
    for (const authStatus of authStatuses) {
      for (const serverSummaryState of summaryStates) {
        const expected: SystemProgress = serverAccepted
          ? "Completed"
          : trusted(authStatus, serverSummaryState)
            ? "Not Started"
            : "Unknown / Not Cached";
        assert.equal(
          deriveNoLocalSystemProgress(serverAccepted, authStatus, serverSummaryState),
          expected,
          `serverAccepted=${serverAccepted} authStatus=${authStatus} serverSummaryState=${serverSummaryState}`
        );
        cases += 1;
      }
    }
  }
  assert.equal(cases, 2 * authStatuses.length * summaryStates.length);
  assert.equal(cases, 24);
});

test("deriveNoLocalSystemProgress trusts an accepted server record regardless of auth or load state", () => {
  // Unchanged, already-shipped behaviour: server acceptance short-circuits the
  // gate, so this stays "Completed" even offline.
  assert.equal(deriveNoLocalSystemProgress(true, "logged-out", "idle"), "Completed");
  assert.equal(deriveNoLocalSystemProgress(true, "offline-unverified", "failed"), "Completed");
});

test("deriveNoLocalSystemProgress reports Not Started only when verified and loaded", () => {
  assert.equal(deriveNoLocalSystemProgress(false, "verified", "loaded"), "Not Started");
  assert.equal(deriveNoLocalSystemProgress(false, "verified", "loading"), "Unknown / Not Cached");
  assert.equal(
    deriveNoLocalSystemProgress(false, "offline-unverified", "loaded"),
    "Unknown / Not Cached"
  );
});
