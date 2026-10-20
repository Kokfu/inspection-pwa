import assert from "node:assert/strict";
import test from "node:test";
import { loadServerMasterSystemInspections, SERVER_SUMMARY_JOB_ID_LIMIT } from "../src/hoseReel/serverMasterSystemInspectionApi.js";

/** I-76: more cached jobs than the API's jobIds limit must not make the whole summary load fail with 400. */
const jobId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const summary = (index: number, performedAt: string) => ({
  clientUuid: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`, jobId: jobId(index), systemKey: "hose_reel", instanceKey: "primary",
  zoneId: null, locationId: null, displaySequence: 1, status: "submitted", performedAt,
  deviceReportedCreatorUsername: null, verifiedOriginalCreatorUsername: null, syncedByUsername: "tech"
});

function fakeApi(rows: Record<string, unknown>[]) {
  const requested: string[][] = [];
  const request = (async (url: string) => {
    const ids = (new URL(url, "http://x").searchParams.get("jobIds") ?? "").split(",").filter(Boolean);
    requested.push(ids);
    if (ids.length > SERVER_SUMMARY_JOB_ID_LIMIT) return new Response("{}", { status: 400 });
    return new Response(JSON.stringify({ inspections: rows.filter((row) => ids.includes(row.jobId as string)).sort((a, b) => String(b.performedAt).localeCompare(String(a.performedAt))), hasMore: false, nextCursor: null }), { status: 200 });
  }) as unknown as typeof fetch;
  return { request, requested };
}

test("jobIds beyond the API limit are requested in chunks and merged in server order", async () => {
  const ids = Array.from({ length: 230 }, (_, index) => jobId(index + 1));
  const rows = [summary(5, "2026-10-01T00:00:00.000000Z"), summary(150, "2026-10-03T00:00:00.000000Z"), summary(229, "2026-10-02T00:00:00.000000Z")];
  const { request, requested } = fakeApi(rows);
  const result = await loadServerMasterSystemInspections(ids, request);
  assert.equal(requested.length, 3);
  assert.ok(requested.every((chunk) => chunk.length <= SERVER_SUMMARY_JOB_ID_LIMIT));
  assert.deepEqual(requested.flat(), ids);
  assert.deepEqual(result.map((item) => item.jobId), [jobId(150), jobId(229), jobId(5)]);
});

test("duplicate ids are collapsed and a small list stays one request", async () => {
  const { request, requested } = fakeApi([summary(1, "2026-10-01T00:00:00.000000Z")]);
  const result = await loadServerMasterSystemInspections([jobId(1), jobId(1), jobId(2)], request);
  assert.equal(requested.length, 1);
  assert.deepEqual(requested[0], [jobId(1), jobId(2)]);
  assert.equal(result.length, 1);
});

test("no ids still sends an unfiltered request", async () => {
  const { request, requested } = fakeApi([]);
  await loadServerMasterSystemInspections([], request);
  assert.deepEqual(requested, [[]]);
});

test("a chunk failure still fails the load (fail closed)", async () => {
  const request = (async () => new Response("{}", { status: 400 })) as unknown as typeof fetch;
  await assert.rejects(() => loadServerMasterSystemInspections([jobId(1)], request));
});
