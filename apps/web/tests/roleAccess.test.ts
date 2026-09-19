import assert from "node:assert/strict";
import test from "node:test";
import { isManagerRole, productRoleMatches, supervisorAllowsRoute } from "../src/manager/roleAccess";

const user = (role: "admin" | "inspector" | "supervisor") => ({ id: 1, username: role, role });

test("role chooser truth table: Manager is admin or supervisor, Technician is inspector only (T4)", () => {
  assert.deepEqual(
    (["admin", "supervisor", "inspector"] as const).map((role) => [role, productRoleMatches("manager", user(role)), productRoleMatches("technician", user(role))]),
    [["admin", true, false], ["supervisor", true, false], ["inspector", false, true]]
  );
  assert.equal(isManagerRole("inspector"), false);
});

test("supervisor screens are exactly the review screens", () => {
  const all = ["manager-home", "manager-operations", "manager-services-done", "manager-service-visit", "manager-final-report",
    "manager-technicians", "manager-technician", "manager-customers", "manager-customer", "manager-customer-service", "manager-upcoming-services"];
  assert.deepEqual(all.filter(supervisorAllowsRoute), ["manager-home", "manager-operations", "manager-services-done", "manager-service-visit", "manager-final-report"]);
});
