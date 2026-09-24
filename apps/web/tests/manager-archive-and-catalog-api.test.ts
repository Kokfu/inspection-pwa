import assert from "node:assert/strict";
import test from "node:test";
import {
  ManagerApiError,
  archiveManagerCustomer,
  archiveManagerServiceVisit,
  loadArchivedManagerCustomers,
  loadManagerServiceCatalog,
  loadManagerServiceHistory,
  restoreManagerCustomer,
  restoreManagerServiceVisit,
  retireManagerServiceCatalogEntry,
  restoreManagerServiceCatalogEntry
} from "../src/manager/managerApi.js";

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

const minimalCustomer = (id: string, displayName: string) => ({
  customer: { id, code: "C1", displayName },
  sites: [],
  configuration: { id: "cfg1", revision: 1, enabledSystems: [] },
  supportedSystems: []
});

test("loadManagerServiceCatalog fetches the catalog endpoint and validates entries", async () => {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requested.push(typeof input === "string" ? input : input.toString());
      return jsonResponse({ systems: [{ key: "hose_reel", displayName: "Hose Reel", sortOrder: 1, assignable: true, retiredAt: null }] });
    }) as typeof fetch;
    const result = await loadManagerServiceCatalog();
    assert.deepEqual(result, [{ key: "hose_reel", displayName: "Hose Reel", sortOrder: 1, assignable: true, retiredAt: null }]);
    assert.equal(requested[0], "/api/manager/service-catalog");

    globalThis.fetch = (async () => jsonResponse({ systems: [
      { key: "hose_reel", displayName: "Hose Reel", sortOrder: 1, assignable: true, retiredAt: null },
      { key: "hydrant", displayName: "Hydrant", sortOrder: 2, assignable: false, retiredAt: "2026-01-01T00:00:00.000Z" }
    ] })) as typeof fetch;
    const includeRetired = await loadManagerServiceCatalog({ includeRetired: true });
    assert.equal(includeRetired[0].retiredAt, null);
    assert.equal(includeRetired[1].retiredAt, "2026-01-01T00:00:00.000Z");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("service catalog rejects malformed retirement state in both response modes", async () => {
  const originalFetch = globalThis.fetch;
  const base = { key: "hose_reel", displayName: "Hose Reel", sortOrder: 1 };
  try {
    for (const includeRetired of [false, true]) {
      for (const entry of [
        { ...base, assignable: true, retiredAt: "not-a-date" },
        { ...base, assignable: false, retiredAt: "2026-02-30T00:00:00.000Z" },
        { ...base, assignable: true, retiredAt: "2026-01-01T00:00:00.000Z" },
        { ...base, assignable: false, retiredAt: null },
        { ...base, assignable: true },
        { ...base, assignable: false }
      ]) {
        globalThis.fetch = (async () => jsonResponse({ systems: [entry] })) as typeof fetch;
        await assert.rejects(() => loadManagerServiceCatalog({ includeRetired }),
          (error: unknown) => error instanceof ManagerApiError && error.kind === "unavailable");
      }
      globalThis.fetch = (async () => jsonResponse({ systems: [{ ...base, assignable: false, retiredAt: "2026-01-01T00:00:00.000Z" }] })) as typeof fetch;
      if (includeRetired) assert.equal((await loadManagerServiceCatalog({ includeRetired }))[0].assignable, false);
      else await assert.rejects(() => loadManagerServiceCatalog({ includeRetired }));
      globalThis.fetch = (async () => jsonResponse({ systems: [{ ...base, assignable: true, retiredAt: null }] })) as typeof fetch;
      assert.equal((await loadManagerServiceCatalog({ includeRetired }))[0].assignable, true);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("loadManagerServiceCatalog rejects a malformed entry as unavailable", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => jsonResponse({ systems: [{ key: "hose_reel" }] })) as typeof fetch;
    await assert.rejects(() => loadManagerServiceCatalog(), (error: unknown) => error instanceof ManagerApiError && error.kind === "unavailable");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("archive/restore customer call the expected endpoints", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string | undefined }> = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: typeof input === "string" ? input : input.toString(), method: init?.method });
      return jsonResponse({});
    }) as typeof fetch;
    await archiveManagerCustomer("cust-1");
    await restoreManagerCustomer("cust-1");
    assert.deepEqual(calls, [
      { url: "/api/manager/customers/cust-1/archive", method: "PUT" },
      { url: "/api/manager/customers/cust-1/restore", method: "PUT" }
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loadArchivedManagerCustomers fetches the archived list endpoint", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => jsonResponse({ customers: [minimalCustomer("cust-2", "Archived Co")] })) as typeof fetch;
    const result = await loadArchivedManagerCustomers();
    assert.equal(result.length, 1);
    assert.equal(result[0].customer.displayName, "Archived Co");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("archive/restore service visit call the expected endpoints", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string | undefined }> = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: typeof input === "string" ? input : input.toString(), method: init?.method });
      return jsonResponse({});
    }) as typeof fetch;
    await archiveManagerServiceVisit("job-1");
    await restoreManagerServiceVisit("job-1");
    assert.deepEqual(calls, [
      { url: "/api/manager/service-visits/job-1/archive", method: "PUT" },
      { url: "/api/manager/service-visits/job-1/restore", method: "PUT" }
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("retire/restore catalog entry call the expected endpoints and validate the echoed system", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string | undefined }> = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: typeof input === "string" ? input : input.toString(), method: init?.method });
      const retiring = (typeof input === "string" ? input : input.toString()).endsWith("/retire");
      return jsonResponse({ system: { key: "hose_reel", displayName: "Hose Reel", sortOrder: 1, retiredAt: retiring ? "2026-01-01T00:00:00.000Z" : null } });
    }) as typeof fetch;
    const retired = await retireManagerServiceCatalogEntry("hose_reel");
    assert.equal(retired.retiredAt, "2026-01-01T00:00:00.000Z");
    const restored = await restoreManagerServiceCatalogEntry("hose_reel");
    assert.equal(restored.retiredAt, null);
    assert.deepEqual(calls, [
      { url: "/api/manager/service-catalog/hose_reel/retire", method: "PUT" },
      { url: "/api/manager/service-catalog/hose_reel/restore", method: "PUT" }
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("retireManagerServiceCatalogEntry rejects a response that does not actually show retiredAt set", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => jsonResponse({ system: { key: "hose_reel", displayName: "Hose Reel", sortOrder: 1, retiredAt: null } })) as typeof fetch;
    await assert.rejects(() => retireManagerServiceCatalogEntry("hose_reel"), (error: unknown) => error instanceof ManagerApiError && error.kind === "unavailable");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loadManagerServiceHistory omits includeArchived from the query string unless true", async () => {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requested.push(typeof input === "string" ? input : input.toString());
      return jsonResponse({ serviceVisits: [], nextCursor: null, totalCount: 0 });
    }) as typeof fetch;
    await loadManagerServiceHistory({ customerId: "cust-1" });
    assert.equal(requested[0].includes("includeArchived"), false);
    await loadManagerServiceHistory({ customerId: "cust-1", includeArchived: true });
    assert.equal(requested[1].includes("includeArchived=true"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
