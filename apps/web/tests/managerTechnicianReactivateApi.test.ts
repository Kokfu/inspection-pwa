import assert from "node:assert/strict";
import test from "node:test";
import { reactivateManagerTechnician, ManagerApiError } from "../src/manager/managerApi";

test("reactivation client validates exact active account and exposes domain refusal", async () => {
  const original = globalThis.fetch;
  const technician = { id: 12, username: "fr08-target", displayName: null, role: "inspector", isActive: true, createdAt: "2026-10-22T00:00:00.000Z" };
  try {
    globalThis.fetch = async (path, init) => {
      assert.equal(path, "/api/manager/technicians/12/reactivate"); assert.equal(init?.method, "POST"); assert.equal(init?.credentials, "same-origin"); assert.equal(init?.cache, "no-store"); assert.equal(init?.body, undefined);
      return Response.json({ technician });
    };
    assert.deepEqual(await reactivateManagerTechnician(12), technician);
    for (const invalid of [{ ...technician, id: 13 }, { ...technician, isActive: false }, { ...technician, role: "admin" }, {}]) {
      globalThis.fetch = async () => Response.json({ technician: invalid });
      await assert.rejects(reactivateManagerTechnician(12), (error: unknown) => error instanceof ManagerApiError && error.kind === "unavailable");
    }
    globalThis.fetch = async () => Response.json({ error: "ACCOUNT_NAME_CLASH", message: "Another active account uses this name." }, { status: 409 });
    await assert.rejects(reactivateManagerTechnician(12), (error: unknown) => error instanceof ManagerApiError && error.kind === "domain" && error.message === "Another active account uses this name.");
  } finally { globalThis.fetch = original; }
});
