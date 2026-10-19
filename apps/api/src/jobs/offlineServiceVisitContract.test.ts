import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isOfflineServiceVisitCreateRequest as serverAccepts } from "./offlineServiceVisitContract.js";

const uuid = "a0000000-0000-4000-8000-000000000001";
const request = {
  clientJobUuid: uuid, customerId: uuid, siteId: uuid, systemKeys: ["hose_reel"],
  configurationRevisionId: uuid, configurationRevision: 1,
  deviceCreatedAt: "2026-10-19T01:25:00.000Z", visitDate: "2026-10-19",
  arrivalTime: "09:25", serviceCallNumber: null
};

test("offline service call numbers stay within the existing report's 80-character limit", () => {
  for (const serviceCallNumber of [null, "SC-2A", "X".repeat(80)]) {
    assert.equal(serverAccepts({ ...request, serviceCallNumber }), true);
  }
  for (const serviceCallNumber of ["X".repeat(81), "X".repeat(100), " ", 123]) {
    assert.equal(serverAccepts({ ...request, serviceCallNumber }), false);
  }
});

test("phone and server offline request validators remain identical", async () => {
  const validator = (source: string) => source.slice(source.indexOf("export function isOfflineServiceVisitCreateRequest"),
    source.indexOf("export function isOfflineServiceVisitCreateResponse"));
  const server = await readFile(new URL("./offlineServiceVisitContract.ts", import.meta.url), "utf8");
  const phone = await readFile(new URL("../../../web/src/jobs/offlineServiceVisitTypes.ts", import.meta.url), "utf8");
  assert.equal(validator(phone).replaceAll("\r\n", "\n"), validator(server).replaceAll("\r\n", "\n"));
});
