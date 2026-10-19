import type { PoolClient } from "pg";
import { isOfflineServiceVisitCreateRequest, type OfflineServiceVisitCreateResponse } from "./offlineServiceVisitContract.js";
import { activeConfiguration, buildSnapshot, selectedSystems, ServiceVisitError } from "./serviceVisits.js";
import { rvObject } from "../repairVisits/repairVisitContract.js";

type ExistingVisit = { id: string; creator: string | number | null; requestId: string | null;
  customerId: string; siteId: string; revisionId: string; snapshot: unknown; device: Date | null;
  date: string; arrival: string | null; serviceCallNumber: string | null; reference: string };
type SnapshotCustomer = Parameters<typeof buildSnapshot>[1];
type SnapshotSite = Parameters<typeof buildSnapshot>[2];

/** Separate from online creation: online dates, response and replay rules stay unchanged. */
export async function createOfflineServiceVisit(
  client: PoolClient, value: unknown, actorUserId: number, actorRole: string
): Promise<OfflineServiceVisitCreateResponse> {
  if (!isOfflineServiceVisitCreateRequest(value)) {
    throw new ServiceVisitError("INVALID_OFFLINE_SERVICE_VISIT_REQUEST", "The offline service visit request is invalid.");
  }
  if (actorRole !== "inspector" && actorRole !== "admin") {
    throw new ServiceVisitError("FORBIDDEN", "Service visit creation is not permitted.", 403);
  }
  const input = value;
  await client.query("BEGIN");
  try {
    // Serialise globally by job UUID, including attempts by different technicians.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('offline_service_visit:' || $1))", [input.clientJobUuid]);
    const existing = await client.query<ExistingVisit>(`SELECT id, created_by_user_id AS creator,
      creation_request_id AS "requestId", customer_id AS "customerId", site_id AS "siteId",
      customer_configuration_revision_id AS "revisionId", configuration_snapshot AS snapshot,
      created_on_device_at AS device, service_date::text AS date,
      to_char(arrival_time, 'HH24:MI') AS arrival, service_call_number AS "serviceCallNumber",
      job_reference AS reference
      FROM inspection_jobs WHERE id=$1 OR (created_by_user_id=$2 AND creation_request_id=$1)
      FOR UPDATE`, [input.clientJobUuid, actorUserId]);
    const row = existing.rows[0];
    if (row) {
      if (Number(row.creator) !== actorUserId) {
        throw new ServiceVisitError("JOB_NOT_FOUND", "Service visit was not found.", 404);
      }
      const snapshot = rvObject(row.snapshot) ? row.snapshot : {};
      const configuration = rvObject(snapshot.configuration) ? snapshot.configuration : {};
      const keys = Array.isArray(snapshot.enabledSystems)
        ? snapshot.enabledSystems.map((system: unknown) => rvObject(system) ? system.systemKey : undefined) : undefined;
      if (existing.rows.length !== 1 || row.id !== input.clientJobUuid || row.requestId !== input.clientJobUuid
        || row.customerId !== input.customerId || row.siteId !== input.siteId || row.revisionId !== input.configurationRevisionId
        || configuration.revisionNumber !== input.configurationRevision
        || !(row.device instanceof Date) || row.device.toISOString() !== input.deviceCreatedAt
        || row.date !== input.visitDate || row.arrival !== input.arrivalTime || row.serviceCallNumber !== input.serviceCallNumber
        || !keys || new Set(keys).size !== keys.length || keys.length !== input.systemKeys.length
        || !keys.every(key => typeof key === "string" && input.systemKeys.includes(key))) {
        throw new ServiceVisitError("IDEMPOTENCY_MISMATCH", "This create request was already used for another service visit.", 409);
      }
      // Retry precedes current configuration/activity/date checks: a committed visit stays acknowledged.
      await client.query("COMMIT");
      return receipt(row.reference, true);
    }
    const clock = await client.query<{ now: Date; today: string }>(`SELECT now() AS now,
      to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') AS today`);
    const { now, today } = clock.rows[0]!;
    const day = 86_400_000;
    const deviceDelta = Date.parse(input.deviceCreatedAt) - now.getTime();
    const dateDelta = Date.parse(input.visitDate) - Date.parse(today);
    if (deviceDelta > day || dateDelta > day) {
      throw new ServiceVisitError("DEVICE_DATE_IN_FUTURE", "Device date/time is more than one day in the future.", 422);
    }
    if (deviceDelta < -30 * day || dateDelta < -30 * day) {
      throw new ServiceVisitError("DEVICE_DATE_TOO_OLD", "Device date/time is older than thirty days.", 422);
    }
    const customer = (await client.query<SnapshotCustomer & { active: boolean }>(`SELECT id, customer_code AS code, display_name AS "displayName",
      contact_phone AS "contactPhone", contact_person AS "contactPerson", fax,
      contract_number AS "contractNumber", service_frequency AS "serviceFrequency", is_active AS active
      FROM customers WHERE id=$1 FOR SHARE`, [input.customerId])).rows[0];
    if (!customer) throw new ServiceVisitError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
    if (!customer.active) throw new ServiceVisitError("CUSTOMER_INACTIVE", "Customer is inactive.", 409);
    const site = (await client.query<SnapshotSite & { active: boolean }>(`SELECT id, customer_id AS "customerId", display_name AS "displayName",
      address, is_active AS active FROM customer_sites WHERE id=$1 AND customer_id=$2 FOR SHARE`,
      [input.siteId, input.customerId])).rows[0];
    if (!site) throw new ServiceVisitError("SITE_NOT_FOUND", "Site was not found for the selected customer.", 404);
    if (!site.active) throw new ServiceVisitError("SITE_INACTIVE", "Site is inactive.", 409);
    const configuration = await activeConfiguration(client, input.customerId);
    if (!configuration || configuration.revisionId !== input.configurationRevisionId
      || configuration.revisionNumber !== input.configurationRevision) {
      throw new ServiceVisitError("CONFIGURATION_CHANGED", "Customer configuration has changed. Review the downloaded setup.", 409);
    }
    let systems;
    try { systems = await selectedSystems(client, configuration.revisionId, input.systemKeys); }
    catch (error) {
      if (error instanceof ServiceVisitError) throw new ServiceVisitError("CONFIGURATION_CHANGED", "Selected systems no longer match the customer configuration.", 409);
      throw error;
    }
    // Only server records enter the frozen snapshot. Activity flags aren't snapshot fields.
    const { active: _customerActive, ...customerSnapshot } = customer;
    const { active: _siteActive, ...siteSnapshot } = site;
    const snapshot = await buildSnapshot(client, customerSnapshot, siteSnapshot, configuration, systems);
    const sequence = (await client.query<{ next: string }>("SELECT nextval('service_visit_reference_sequence')::text AS next")).rows[0]!.next;
    const reference = `SV-${input.visitDate.replaceAll("-", "")}-${sequence}`;
    await client.query(`INSERT INTO inspection_jobs (id, template_id, master_template_version_id,
      job_reference, title, status, is_sample, customer_id, customer_configuration_revision_id,
      configuration_snapshot, site_id, service_date, service_time, creation_request_id,
      created_by_user_id, service_call_number, arrival_time, created_on_device_at)
      VALUES ($1,NULL,$2,$3,$4,'open',false,$5,$6,$7,$8,$9::date,$10::time,$1,$11,$12,$10::time,$13::timestamptz)`,
      [input.clientJobUuid, configuration.templateId, reference, site.displayName, input.customerId,
        configuration.revisionId, JSON.stringify(snapshot), input.siteId, input.visitDate, input.arrivalTime,
        actorUserId, input.serviceCallNumber, input.deviceCreatedAt]);
    await client.query("COMMIT");
    return receipt(reference, false);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      throw new ServiceVisitError("IDEMPOTENCY_MISMATCH", "This create request was already used for another service visit.", 409);
    }
    throw error;
  }
  function receipt(visitNumber: string, idempotent: boolean): OfflineServiceVisitCreateResponse {
    return { clientJobUuid: input.clientJobUuid, jobId: input.clientJobUuid, visitNumber,
      configurationRevisionId: input.configurationRevisionId, deviceCreatedAt: input.deviceCreatedAt,
      visitDate: input.visitDate, arrivalTime: input.arrivalTime, idempotent };
  }
}
