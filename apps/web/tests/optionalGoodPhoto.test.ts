import assert from "node:assert/strict";
import test from "node:test";
import { isOptionalPhotoResult } from "../src/attachments/optionalGoodPhoto.ts";
import { submittedPhotoIssues } from "../src/attachments/correctedCopy.ts";
import {
  collectV7SiblingEvidence, crossInstanceV7PhotoIssues, duplicateV7PhotoIssues, v7EvidenceManifest, v7EvidenceOutbox,
  v7OptionalFieldPaths, v7RequiredFieldPaths, v7SubmissionIssues, type V7EvidenceSource
} from "../src/co2/v7Evidence.ts";
import type { InspectionAttachmentRecord } from "../src/attachments/attachmentTypes.ts";
import type { Co2Responses, MasterSystemFormInstanceRecord } from "../src/co2/co2Types.ts";

// CR-01 (web, pilot = CO2 + Wet Chemical): ONE optional photo on a Good / N.A. result.

const MAIN_SUPPLY = "charger_batteries.charger_battery_checks.main_supply";
const BATTERY = "charger_batteries.charger_battery_checks.battery";
const CHARGER = "charger_batteries.charger_battery_checks.charger";
const CYLINDER = "physical_outlook.physical_outlook_checks.co2_cylinder";
const LAMP = "main_function_key.function_checks.lamp_test";

const cell = (result: string, remarks = "") => ({ result, remarks });
const responses = (overrides: { main?: string; battery?: string; charger?: string; cylinder?: string; lamp?: string } = {}): Co2Responses => ({
  controlPanelLocation: "Room", detectorRows: [],
  chargerAndBatteries: {
    main_supply: cell(overrides.main ?? "good", overrides.main === "not_good" || overrides.main === "complete_repair" ? "Own remark" : ""),
    battery: cell(overrides.battery ?? "good"), charger: cell(overrides.charger ?? "na")
  },
  physicalOutlook: { co2_cylinder: cell(overrides.cylinder ?? "good", overrides.cylinder === "not_good" || overrides.cylinder === "complete_repair" ? "Own remark" : "") },
  mainFunctionKeys: { lamp_test: cell(overrides.lamp ?? "good") }, comments: ""
} as unknown as Co2Responses);
const record = (clientUuid = "b", groupKey = "job:co2_fire_extinguisher") => ({
  clientUuid, groupKey, displaySequence: 2, masterTemplate: { id: "t", code: "MFE-FSSR", version: 7 }, responses: responses(),
  inspectionSnapshot: { instance: { location: { displayName: "Room B" } } }
}) as unknown as MasterSystemFormInstanceRecord;
const photo = (fieldPath: string, sha: string, extra: Partial<InspectionAttachmentRecord> = {}) => ({
  photoUuid: `00000000-0000-4000-8000-${sha.charCodeAt(0).toString().padStart(12, "0")}`, inspectionClientUuid: "b", systemKey: "co2_fire_extinguisher",
  localCreatedAt: "2026-10-10T00:00:00.000Z", fieldPath, sha256: sha.repeat(64).slice(0, 64), protocolVersion: 7, syncStatus: "Draft", ...extra
}) as unknown as InspectionAttachmentRecord;

test("only Good and N.A. are photo-eligible; a finding is required, never optional", () => {
  assert.equal(isOptionalPhotoResult("good"), true);
  assert.equal(isOptionalPhotoResult("na"), true);
  for (const value of ["not_good", "complete_repair", "poor", "not_relevant", "", null, undefined]) assert.equal(isOptionalPhotoResult(value), false, String(value));
  const mixed = responses({ main: "not_good", charger: "na", cylinder: "complete_repair" });
  assert.deepEqual(v7RequiredFieldPaths(mixed), [MAIN_SUPPLY, CYLINDER].sort());
  assert.deepEqual(v7OptionalFieldPaths(mixed), [BATTERY, CHARGER, LAMP].sort());
});

test("a missing optional photo never creates a submit issue", () => {
  assert.deepEqual(v7SubmissionIssues(record(), responses(), [], []), []);
  assert.deepEqual(v7SubmissionIssues(record(), responses({ charger: "na" }), [], []), []);
  assert.deepEqual(v7EvidenceManifest([], responses()), []);
});

test("a missing REQUIRED photo is still an issue; an attached optional photo does not stand in for it", () => {
  const issues = v7SubmissionIssues(record(), responses({ main: "not_good" }), [photo(BATTERY, "a")], []);
  assert.deepEqual(issues, [`${MAIN_SUPPLY} requires its own Photo`]);
});

test("a Good or N.A. photo joins the frozen manifest and stages through the same outbox item", () => {
  const photos = [photo(BATTERY, "a"), photo(CHARGER, "b"), photo(MAIN_SUPPLY, "c")];
  const body = responses({ main: "not_good" });
  assert.deepEqual(v7SubmissionIssues(record(), body, photos, []), []);
  const manifest = v7EvidenceManifest(photos, body);
  assert.deepEqual(manifest.map((entry) => entry.fieldPath), [BATTERY, CHARGER, MAIN_SUPPLY].sort(), "required + both optional");
  assert.deepEqual(manifest.map((entry) => Object.keys(entry).sort()), [0, 1, 2].map(() => ["fieldPath", "photoUuid", "sourceSha256"]), "exactly the three server keys");
  const outbox = manifest.map((entry) => v7EvidenceOutbox(photos.find((candidate) => candidate.photoUuid === entry.photoUuid)!));
  assert.ok(outbox.every((item) => item.entityType === "v7StagedEvidence" && item.action === "create" && item.status === "Pending"));
  assert.equal(new Set(outbox.map((item) => item.activeKey)).size, 3, "one outbox item per photo");
});

test("a photo on a field that is not in the responses is never in the manifest", () => {
  assert.deepEqual(v7EvidenceManifest([photo("main_function_key.function_checks.not_a_field", "a"), photo(BATTERY, "b")], responses()).map((entry) => entry.fieldPath), [BATTERY]);
});

test("Poor → Good keeps the photo as the optional photo; Remove (photo gone) leaves a clean manifest", () => {
  const kept = photo(MAIN_SUPPLY, "a");
  const afterFlip = responses({ main: "good" });
  assert.deepEqual(v7EvidenceManifest([kept], afterFlip).map((entry) => entry.fieldPath), [MAIN_SUPPLY]);
  assert.deepEqual(v7SubmissionIssues(record(), afterFlip, [kept], []), []);
  assert.deepEqual(v7EvidenceManifest([], afterFlip), []);
  assert.deepEqual(v7SubmissionIssues(record(), afterFlip, [], []), []);
});

test("the same image on two fields of one location is refused - 'remove or replace' for an optional one, the old wording for two findings", () => {
  const twoOptional = [photo(BATTERY, "a"), photo(CHARGER, "a")];
  assert.deepEqual(v7SubmissionIssues(record(), responses(), twoOptional, []), [`${BATTERY} and ${CHARGER} use the same photo; remove or replace one of them`]);
  const findingAndOptional = [photo(BATTERY, "a"), photo(MAIN_SUPPLY, "a")];
  assert.deepEqual(v7SubmissionIssues(record(), responses({ main: "not_good" }), findingAndOptional, []), [`${BATTERY} and ${MAIN_SUPPLY} use the same photo; remove or replace one of them`]);
  const twoFindings = [photo(MAIN_SUPPLY, "a"), photo(CYLINDER, "a")];
  assert.deepEqual(v7SubmissionIssues(record(), responses({ main: "not_good", cylinder: "complete_repair" }), twoFindings, []), [`${MAIN_SUPPLY} and ${CYLINDER} use the same photo; each finding needs its own photo`]);
  assert.deepEqual(duplicateV7PhotoIssues(twoFindings, [MAIN_SUPPLY, CYLINDER]), [`${MAIN_SUPPLY} and ${CYLINDER} use the same photo; each finding needs its own photo`], "the 2-argument call (other systems) is unchanged");
});

test("an optional photo clashing with another location's photo is refused and names that location", async () => {
  const sibling = { ...record("a"), syncStatus: "Draft", displaySequence: 1, inspectionSnapshot: { instance: { location: { displayName: "Room A" } } }, responses: responses({ main: "not_good" }) } as unknown as MasterSystemFormInstanceRecord;
  const attachments = [photo(MAIN_SUPPLY, "a", { inspectionClientUuid: "a" }), photo(BATTERY, "a")];
  const reader = <T>(rows: T[]) => ({ where: (index: string) => ({ equals: (value: string) => ({ toArray: async () => rows.filter((row) => (row as Record<string, unknown>)[index] === value) }) }) });
  const source: V7EvidenceSource = { masterSystemFormInstances: reader([sibling, record()]), inspectionAttachments: reader(attachments) };
  const siblings = await collectV7SiblingEvidence(record(), source);
  assert.deepEqual(siblings.map((entry) => [entry.clientUuid, entry.requiredFieldPaths, entry.optionalFieldPaths?.length]), [["a", [MAIN_SUPPLY], 4]]);
  const issues = v7SubmissionIssues(record(), responses(), [attachments[1]!], siblings);
  assert.deepEqual(issues, [`${BATTERY} and ${MAIN_SUPPLY} at Room A use the same photo; remove or replace one of them`]);
  // Without optional paths the 3-argument call behaves exactly as before.
  assert.deepEqual(crossInstanceV7PhotoIssues([attachments[1]!], [BATTERY], siblings), [`${BATTERY} and ${MAIN_SUPPLY} at Room A use the same photo; each finding needs its own photo`]);
});

test("a submitted (staged) optional photo is not 'no longer needed' while its field is Good / N.A.", () => {
  const submitted = photo(BATTERY, "a", { syncStatus: "Pending" });
  assert.deepEqual(v7SubmissionIssues(record(), responses(), [submitted], []), [], "kept in the manifest, so not stale");
  assert.equal(submittedPhotoIssues([submitted], [MAIN_SUPPLY]).length, 1, "the guard itself is unchanged for a path nothing needs");
});

test("a sibling already submitted does not clash with a Draft photo it never staged (left behind on a Good field)", async () => {
  const frozenSibling = { ...record("a"), syncStatus: "Pending", displaySequence: 1, inspectionSnapshot: { instance: { location: { displayName: "Room A" } } }, responses: responses({ main: "not_good" }) } as unknown as MasterSystemFormInstanceRecord;
  const reader = <T>(rows: T[]) => ({ where: (index: string) => ({ equals: (value: string) => ({ toArray: async () => rows.filter((row) => (row as Record<string, unknown>)[index] === value) }) }) });
  const leftBehind = photo(BATTERY, "a", { inspectionClientUuid: "a", syncStatus: "Draft" });
  const staged = photo(CHARGER, "c", { inspectionClientUuid: "a", syncStatus: "Pending" });
  const required = photo(MAIN_SUPPLY, "d", { inspectionClientUuid: "a", syncStatus: "Pending" });
  const source: V7EvidenceSource = { masterSystemFormInstances: reader([frozenSibling, record()]), inspectionAttachments: reader([leftBehind, staged, required]) };
  const [sibling] = await collectV7SiblingEvidence(record(), source);
  assert.deepEqual(sibling!.optionalFieldPaths, [CHARGER], "only the optional photo that was actually staged counts");
  assert.deepEqual(v7SubmissionIssues(record(), responses(), [photo(BATTERY, "a")], [sibling!]), [], "the same bytes as a left-behind Draft photo are fine");
  assert.equal(v7SubmissionIssues(record(), responses(), [photo(BATTERY, "c")], [sibling!]).length, 1, "the same bytes as a staged optional photo are not");
});
