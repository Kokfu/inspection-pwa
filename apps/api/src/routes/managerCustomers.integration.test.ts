import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { seedMasterServiceReport } from "../db/seedMasterServiceReport.js";
import { createServiceVisit } from "../jobs/serviceVisits.js";
import { createManagerCustomersRouter, ManagerCustomerError } from "./managerCustomers.js";
import { createInspectionReferenceRouter } from "./inspectionReference.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
const makSitiId = "00000000-0000-4000-8000-000000000830";
const makSitiSiteId = "00000000-0000-4000-8000-000000000832";
const v5 = "00000000-0000-4000-8000-000000000805";
const v6 = "00000000-0000-4000-8000-000000000806";

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("manager customer transaction integration", { skip: !databaseUrl }, async () => {
  assert.equal(new URL(databaseUrl!).pathname, "/phase6_seed_integration", "manager integration only permits its dedicated database");
  const database = new pg.Pool({ connectionString: databaseUrl });
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(database);
    const user = await database.query<{ id: number }>("INSERT INTO users (username,password_hash,role) VALUES ('manager-integration','not-used','admin') RETURNING id");
    const userId = user.rows[0]!.id;
    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { const role = request.headers["x-role"]; if (role === "admin" || role === "inspector") request.currentUser = { id: userId, username: String(role), role }; next(); });
    app.use(createManagerCustomersRouter(database));
    app.use(createInspectionReferenceRouter(database));
    app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      if (error instanceof ManagerCustomerError) response.status(error.status).json({ error: error.code });
      else response.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
    });
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address() as { port: number };
    const request = async (path: string, method: "GET" | "POST", role?: "admin" | "inspector", body?: unknown) => fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers: { ...(role ? { "x-role": role } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    try {
      const allPaths: Array<[string, "GET" | "POST", unknown?]> = [
        ["/manager/customers", "GET"], ["/manager/customers/00000000-0000-4000-8000-000000000830", "GET"],
        ["/manager/customers/00000000-0000-4000-8000-000000000830/configuration", "GET"],
        ["/manager/customers", "POST", { displayName: "Auth Matrix", siteDisplayName: "Primary", systemKeys: ["hose_reel"] }],
        ["/manager/customers/00000000-0000-4000-8000-000000000830/sites", "POST", { displayName: "Matrix Site" }],
        ["/manager/customers/00000000-0000-4000-8000-000000000830/configuration-revisions", "POST", { systemKeys: ["hose_reel"] }]
      ];
      for (const [path, method, body] of allPaths) {
        assert.equal((await request(path, method, undefined, body)).status, 401, `${method} ${path} unauthenticated`);
        assert.equal((await request(path, method, "inspector", body)).status, 403, `${method} ${path} inspector`);
      }
      assert.equal((await request("/manager/customers", "GET", "admin")).status, 200);
      const catalogResponse = await request("/inspection-catalog", "GET", "inspector");
      assert.equal(catalogResponse.status, 200);
      const catalog = await catalogResponse.json() as {
        templates: Array<{
          id: string;
          version: number;
          systems: Array<{
            key: string;
            definitionStatus: string;
            resolvedRuntimeControls?: { source?: { templateVersion?: number } };
          }>;
        }>;
      };
      assert.deepEqual(catalog.templates.map((template) => template.version), [1, 2, 3, 4, 5, 6]);
      const publishedV6FireAlarm = catalog.templates.find((template) => template.id === v6)?.systems
        .find((system) => system.key === "fire_alarm_detector");
      assert.equal(publishedV6FireAlarm?.definitionStatus, "confirmed");
      assert.equal(publishedV6FireAlarm?.resolvedRuntimeControls?.source?.templateVersion, 6);
      const hokuden = await request("/customers/00000000-0000-4000-8000-000000000840/configuration", "GET", "admin");
      assert.deepEqual((await hokuden.json() as { configuration: { enabledSystems: Array<{ key: string }> } }).configuration.enabledSystems.map((system) => system.key), ["automatic_sprinkler", "hose_reel", "fire_alarm_detector", "hydrant"], "technician configuration omits unassignable Hokuden services");
      await database.query(`INSERT INTO customer_enabled_systems (id,configuration_revision_id,template_version_id,system_key,sort_order) VALUES ('a3000000-0000-4000-8000-000000000001',(SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active'),$2,'co2_fire_extinguisher',4)`, [makSitiId, v5]);
      const malformed = await request(`/customers/${makSitiId}/configuration`, "GET", "admin");
      assert.deepEqual((await malformed.json() as { configuration: { enabledSystems: Array<{ key: string }> } }).configuration.enabledSystems.map((system) => system.key), ["hose_reel", "fire_alarm_detector", "portable_fire_extinguisher"], "technician endpoint omits malformed legacy CO2 while retaining valid systems");

      const create = await request("/manager/customers", "POST", "admin", { displayName: "  Integration Customer  ", siteDisplayName: "Primary Service Site", systemKeys: ["hose_reel"] });
      assert.equal(create.status, 201); const created = await create.json() as { customer: { customer: { id: string; displayName: string } } }; const createdId = created.customer.customer.id;
      assert.equal(created.customer.customer.displayName, "Integration Customer");
      assert.deepEqual((await database.query(`SELECT (SELECT count(*)::int FROM customers WHERE id=$1) customer, (SELECT count(*)::int FROM customer_sites WHERE customer_id=$1) site, (SELECT count(*)::int FROM customer_configuration_revisions WHERE customer_id=$1 AND revision=1 AND status='active') revision, (SELECT count(*)::int FROM audit_events WHERE entity_id=$1::text AND action='manager_customer_created') audit`, [createdId])).rows[0], { customer: 1, site: 1, revision: 1, audit: 1 });
      const createdConfigurationBeforeSite = await database.query<{ id: string; systems: string[] }>(`SELECT revision.id, array_agg(enabled.system_key ORDER BY enabled.sort_order) AS systems FROM customer_configuration_revisions revision INNER JOIN customer_enabled_systems enabled ON enabled.configuration_revision_id=revision.id WHERE revision.customer_id=$1 AND revision.status='active' GROUP BY revision.id`, [createdId]);
      const createdPrimarySite = (await database.query<{ id: string }>("SELECT id FROM customer_sites WHERE customer_id=$1 AND site_code='PRIMARY'", [createdId])).rows[0]!.id;
      const createdVisitClient = await database.connect(); let createdVisitId: string;
      try { createdVisitId = (await createServiceVisit(createdVisitClient, { requestId: "a1000000-0000-4000-8000-000000000099", customerId: createdId, siteId: createdPrimarySite, systemKeys: ["hose_reel"] }, userId)).id; } finally { createdVisitClient.release(); }
      assert.deepEqual((await database.query(`SELECT revision.template_version_id AS "revisionTemplateId", job.master_template_version_id AS "jobTemplateId", job.configuration_snapshot->'template' AS "frozenTemplate" FROM inspection_jobs job INNER JOIN customer_configuration_revisions revision ON revision.id=job.customer_configuration_revision_id WHERE job.id=$1`, [createdVisitId])).rows[0], { revisionTemplateId: v6, jobTemplateId: v6, frozenTemplate: { id: v6, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 6 } }, "new normal customer configuration and service visit freeze the current V6 authority");
      const addSite = await request(`/manager/customers/${createdId}/sites`, "POST", "admin", { displayName: " Miri Branch " });
      assert.equal(addSite.status, 201); const addedSite = await addSite.json() as { site: { id: string; code: string; displayName: string }; customer: { sites: Array<{ displayName: string }>; configuration: { id: string } } };
      assert.equal(addedSite.site.displayName, "Miri Branch"); assert.match(addedSite.site.code, /^SITE-[A-F0-9]{8}$/);
      assert.deepEqual(addedSite.customer.sites.map((site) => site.displayName), ["Miri Branch", "Primary Service Site"], "response refreshes the authoritative customer detail");
      assert.equal(addedSite.customer.configuration.id, createdConfigurationBeforeSite.rows[0]?.id, "site creation does not mutate the active configuration revision");
      assert.deepEqual((await database.query<{ id: string; systems: string[] }>(`SELECT revision.id, array_agg(enabled.system_key ORDER BY enabled.sort_order) AS systems FROM customer_configuration_revisions revision INNER JOIN customer_enabled_systems enabled ON enabled.configuration_revision_id=revision.id WHERE revision.customer_id=$1 AND revision.status='active' GROUP BY revision.id`, [createdId])).rows, createdConfigurationBeforeSite.rows, "site creation preserves active revision services");
      assert.equal((await database.query("SELECT count(*)::int AS count FROM inspection_jobs WHERE id=$1 AND customer_id=$2 AND site_id=$3", [createdVisitId, createdId, createdPrimarySite])).rows[0]?.count, 1, "site creation leaves existing visits untouched");
      const technicianSites = await request(`/customers/${createdId}/sites`, "GET", "inspector");
      assert.equal(technicianSites.status, 200); assert.deepEqual((await technicianSites.json() as { sites: Array<{ displayName: string }> }).sites.map((site) => site.displayName), ["Miri Branch", "Primary Service Site"], "normal Technician site endpoint sees Manager-created site");
      assert.equal((await request(`/manager/customers/${createdId}/sites`, "POST", "admin", { displayName: "miri branch" })).status, 409, "normalized duplicate active site is rejected");
      assert.equal((await request("/manager/customers", "POST", "admin", { displayName: "integration customer", siteDisplayName: "Another", systemKeys: ["hose_reel"] })).status, 409, "normalized duplicate name rejected");
      const rejected = await request("/manager/customers", "POST", "admin", { displayName: "Invalid CO2 Customer", siteDisplayName: "Primary", systemKeys: ["co2_fire_extinguisher"] });
      assert.equal(rejected.status, 409); assert.equal((await database.query("SELECT count(*)::int AS count FROM customers WHERE display_name='Invalid CO2 Customer'")).rows[0]?.count, 0, "invalid create rolls back all rows");
      await database.query(`INSERT INTO customer_enabled_systems (id,configuration_revision_id,template_version_id,system_key,sort_order) VALUES ('a2000000-0000-4000-8000-000000000001',(SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active'),$2,'co2_fire_extinguisher',2)`, [createdId, v6]);
      await database.query("INSERT INTO customer_system_zones (id,enabled_system_id,zone_key,display_name,sort_order) VALUES ('a2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001','retained-zone','Retained Zone',1)");
      await database.query("INSERT INTO customer_system_locations (id,enabled_system_id,zone_id,location_key,display_name,preset_row_count,row_preset,sort_order) VALUES ('a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','retained-location','Retained Location',1,'{}',1)");
      assert.equal((await request(`/manager/customers/${createdId}/configuration-revisions`, "POST", "admin", { systemKeys: ["hose_reel", "co2_fire_extinguisher"] })).status, 201, "existing valid CO2 authority may be retained");
      assert.deepEqual((await database.query(`SELECT (SELECT count(*)::int FROM customer_system_zones zone INNER JOIN customer_enabled_systems enabled ON enabled.id=zone.enabled_system_id WHERE enabled.configuration_revision_id=(SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active')) zones, (SELECT count(*)::int FROM customer_system_locations location INNER JOIN customer_enabled_systems enabled ON enabled.id=location.enabled_system_id WHERE enabled.configuration_revision_id=(SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active')) locations`, [createdId])).rows[0], { zones: 1, locations: 1 }, "retained CO2 configuration copies authoritative zones and locations");
      const wetOldEnabled = "a2000000-0000-4000-8000-000000000011";
      const wetOldZone = "a2000000-0000-4000-8000-000000000012";
      const wetOldLocation = "a2000000-0000-4000-8000-000000000013";
      await database.query(`INSERT INTO customer_enabled_systems (id,configuration_revision_id,template_version_id,system_key,sort_order) VALUES ($1,(SELECT id FROM customer_configuration_revisions WHERE customer_id=$2 AND status='active'),$3,'wet_chemical',3)`, [wetOldEnabled, createdId, v6]);
      await database.query("INSERT INTO customer_system_zones (id,enabled_system_id,zone_key,display_name,sort_order) VALUES ($1,$2,'wet-zone','Wet Zone',1)", [wetOldZone, wetOldEnabled]);
      await database.query("INSERT INTO customer_system_locations (id,enabled_system_id,zone_id,location_key,display_name,preset_row_count,row_preset,sort_order) VALUES ($1,$2,$3,'wet-location','Wet Location',1,'{}',1)", [wetOldLocation, wetOldEnabled, wetOldZone]);
      assert.equal((await request(`/manager/customers/${createdId}/configuration-revisions`, "POST", "admin", { systemKeys: ["hose_reel", "co2_fire_extinguisher", "wet_chemical"] })).status, 201, "existing valid Wet Chemical authority may be retained");
      const wetCopied = await database.query<{ zone_id: string; old_zone: string; location_id: string; old_location: string }>(`SELECT location.zone_id::text AS zone_id, $2::text AS old_zone, location.id::text AS location_id, $3::text AS old_location FROM customer_system_locations location INNER JOIN customer_enabled_systems enabled ON enabled.id=location.enabled_system_id WHERE enabled.configuration_revision_id=(SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active') AND enabled.system_key='wet_chemical'`, [createdId, wetOldZone, wetOldLocation]);
      assert.notEqual(wetCopied.rows[0]?.zone_id, wetCopied.rows[0]?.old_zone); assert.notEqual(wetCopied.rows[0]?.location_id, wetCopied.rows[0]?.old_location);

      const visitClient = await database.connect(); let visitId: string;
      try { visitId = (await createServiceVisit(visitClient, { requestId: "a1000000-0000-4000-8000-000000000001", customerId: makSitiId, siteId: makSitiSiteId, systemKeys: ["hose_reel"] }, userId)).id; } finally { visitClient.release(); }
      const before = await database.query<{ revision: string; snapshot: unknown; templateId: string }>("SELECT customer_configuration_revision_id::text AS revision, configuration_snapshot AS snapshot, master_template_version_id AS \"templateId\" FROM inspection_jobs WHERE id=$1", [visitId]);
      assert.equal(before.rows[0]?.templateId, v5, "existing historical configuration continues to create its V5-frozen visit before an explicit new revision is activated");
      const revision = await request(`/manager/customers/${makSitiId}/configuration-revisions`, "POST", "admin", { systemKeys: ["hose_reel", "automatic_sprinkler"] });
      assert.equal(revision.status, 201);
      const technicianConfiguration = await request(`/customers/${makSitiId}/configuration`, "GET", "admin");
      assert.equal((await technicianConfiguration.json() as { configuration: { revision: number } }).configuration.revision, 2, "normal technician endpoint returns N+1");
      const revisions = await database.query<{ revision: number; status: string; systems: string[] }>(`SELECT revision.revision, revision.status, array_agg(enabled.system_key ORDER BY enabled.sort_order) AS systems FROM customer_configuration_revisions revision LEFT JOIN customer_enabled_systems enabled ON enabled.configuration_revision_id=revision.id WHERE revision.customer_id=$1 GROUP BY revision.id ORDER BY revision.revision`, [makSitiId]);
      assert.deepEqual(revisions.rows, [{ revision: 1, status: "superseded", systems: ["hose_reel", "fire_alarm_detector", "portable_fire_extinguisher", "co2_fire_extinguisher"] }, { revision: 2, status: "active", systems: ["automatic_sprinkler", "hose_reel"] }]);
      assert.deepEqual((await database.query("SELECT customer_configuration_revision_id::text AS revision, configuration_snapshot AS snapshot, master_template_version_id AS \"templateId\" FROM inspection_jobs WHERE id=$1", [visitId])).rows[0], before.rows[0], "existing V5 visit snapshot remains frozen at N after V6 current selection creates N+1");
      const nextVisitClient = await database.connect();
      try { await createServiceVisit(nextVisitClient, { requestId: "a1000000-0000-4000-8000-000000000002", customerId: makSitiId, siteId: makSitiSiteId, systemKeys: ["automatic_sprinkler"] }, userId); } finally { nextVisitClient.release(); }
      assert.equal((await database.query("SELECT count(*)::int AS count FROM inspection_jobs WHERE customer_id=$1 AND customer_configuration_revision_id=(SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active')", [makSitiId])).rows[0]?.count, 1, "new technician visit uses N+1");
      for (const key of ["co2_fire_extinguisher", "wet_chemical"]) assert.equal((await request(`/manager/customers/${makSitiId}/configuration-revisions`, "POST", "admin", { systemKeys: ["hose_reel", key] })).status, 409, `${key} without locations rejected`);

      const rollbackCustomer = await request("/manager/customers", "POST", "admin", { displayName: "Post Write Rollback", siteDisplayName: "Primary", systemKeys: ["hose_reel"] });
      assert.equal(rollbackCustomer.status, 201); const rollbackId = (await rollbackCustomer.json() as { customer: { customer: { id: string } } }).customer.customer.id;
      await database.query("INSERT INTO customer_configuration_revisions (id,customer_id,template_version_id,revision,status) VALUES ('a4000000-0000-4000-8000-000000000001',$1,$2,2,'superseded')", [rollbackId, v5]);
      const activationAuditsBeforeRollback = await database.query("SELECT count(*)::int AS count FROM audit_events WHERE action='manager_customer_configuration_activated'");
      assert.equal((await request(`/manager/customers/${rollbackId}/configuration-revisions`, "POST", "admin", { systemKeys: ["hose_reel", "automatic_sprinkler"] })).status, 500, "conflicting N+1 forces post-write production rollback");
      assert.deepEqual((await database.query("SELECT revision,status FROM customer_configuration_revisions WHERE customer_id=$1 ORDER BY revision", [rollbackId])).rows, [{ revision: 1, status: "active" }, { revision: 2, status: "superseded" }], "post-write failure restores N active with no partial activation");
      assert.deepEqual((await database.query("SELECT count(*)::int AS count FROM audit_events WHERE action='manager_customer_configuration_activated'")).rows, activationAuditsBeforeRollback.rows, "post-write failure rolls back its audit event");

      const first = request(`/manager/customers/${makSitiId}/configuration-revisions`, "POST", "admin", { systemKeys: ["hose_reel"] });
      const second = request(`/manager/customers/${makSitiId}/configuration-revisions`, "POST", "admin", { systemKeys: ["hose_reel", "automatic_sprinkler"] });
      assert.deepEqual((await Promise.all([first, second])).map((response) => response.status).sort(), [201, 201]);
      assert.deepEqual((await database.query("SELECT count(*)::int AS active, count(*) FILTER (WHERE revision IN (3,4))::int AS later_revisions FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active'", [makSitiId])).rows[0], { active: 1, later_revisions: 1 }, "concurrent activation leaves exactly one active revision");
      const activeBeforeSeed = (await database.query<{ id: string }>("SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active'", [makSitiId])).rows[0]!.id;
      const servicesBeforeSeed = await database.query("SELECT system_key FROM customer_enabled_systems WHERE configuration_revision_id=$1 ORDER BY sort_order", [activeBeforeSeed]);
      const sitesBeforeSeed = await database.query("SELECT site_code,display_name FROM customer_sites WHERE customer_id=$1 ORDER BY site_code", [makSitiId]);
      const createdConfigurationBeforeSeed = await database.query<{ id: string; systems: string[] }>(`SELECT revision.id, array_agg(enabled.system_key ORDER BY enabled.sort_order) AS systems FROM customer_configuration_revisions revision INNER JOIN customer_enabled_systems enabled ON enabled.configuration_revision_id=revision.id WHERE revision.customer_id=$1 AND revision.status='active' GROUP BY revision.id`, [createdId]);
      await seedMasterServiceReport(database);
      assert.equal((await database.query<{ id: string }>("SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active'", [makSitiId])).rows[0]!.id, activeBeforeSeed, "seed restart does not reset Manager revision");
      assert.deepEqual((await database.query("SELECT system_key FROM customer_enabled_systems WHERE configuration_revision_id=$1 ORDER BY sort_order", [activeBeforeSeed])).rows, servicesBeforeSeed.rows, "seed restart preserves Manager services");
      assert.deepEqual((await database.query("SELECT site_code,display_name FROM customer_sites WHERE customer_id=$1 ORDER BY site_code", [makSitiId])).rows, sitesBeforeSeed.rows, "seed restart preserves sites");
      assert.deepEqual((await database.query("SELECT site_code,display_name FROM customer_sites WHERE customer_id=$1 ORDER BY site_code", [createdId])).rows, [{ site_code: "PRIMARY", display_name: "Primary Service Site" }, { site_code: addedSite.site.code, display_name: "Miri Branch" }], "seed restart preserves Manager-created sites without duplicates");
      assert.deepEqual((await database.query<{ id: string; systems: string[] }>(`SELECT revision.id, array_agg(enabled.system_key ORDER BY enabled.sort_order) AS systems FROM customer_configuration_revisions revision INNER JOIN customer_enabled_systems enabled ON enabled.configuration_revision_id=revision.id WHERE revision.customer_id=$1 AND revision.status='active' GROUP BY revision.id`, [createdId])).rows, createdConfigurationBeforeSeed.rows, "seed restart preserves the Manager customer's active revision services");
      assert.deepEqual((await database.query("SELECT customer_code,is_active FROM customers WHERE customer_code IN ('DEMO-SINGLE-ZONE','DEMO-MULTI-ZONE') ORDER BY customer_code")).rows, [{ customer_code: "DEMO-MULTI-ZONE", is_active: false }, { customer_code: "DEMO-SINGLE-ZONE", is_active: false }], "seed restart retains demo deactivation");
    } finally { await close(server); }
  } finally { await database.end(); }
});
