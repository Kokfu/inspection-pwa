import { Router } from "express";
import type { Pool } from "pg";
import { pool } from "../db/pool.js";
import { CompanyProfileError, currentCompanyProfile, saveCompanyProfile, type CompanyProfile } from "../reports/companyProfile.js";
import type { UserRole } from "../auth/authTypes.js";
import { requireRoleAudited } from "../middleware/requireRole.js";

async function audit(client: Pick<Pool, "query">, actorUserId: number, action: string, reason: string) {
  await client.query(`INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, result, reason) VALUES ($1,$2,'company_profile','company_profile','success',$3)`, [actorUserId, action, reason]);
}

/** Drops the internal `source` discriminant (checked-in asset vs. saved runtime file) — an
 *  implementation detail of `companyProfile.ts`, never part of the Manager-facing contract. */
function publicProfile(profile: CompanyProfile) {
  const { source: _source, ...rest } = profile;
  return rest;
}

/**
 * The single, global report letterhead (company name/address/contact/report-number
 * format) shown on every PDF's cover page — not per-customer, so unlike every other
 * Manager settings screen there is exactly one row and no `:customerId`. Backed by a
 * JSON file (`apps/api/src/reports/companyProfile.ts`), not Postgres: no migration,
 * and it lives in the same `/srv/operational` bind mount the acceptance manifests use,
 * so a save survives a container rebuild.
 */
export function createManagerCompanyProfileRouter(database: Pick<Pool, "query"> = pool) {
  const router = Router();
  const requireRole = (...roles: UserRole[]) => requireRoleAudited(database, ...roles);

  router.get("/manager/company-profile", requireRole("admin"), async (_request, response, next) => {
    try {
      response.setHeader("Cache-Control", "private, no-store");
      response.json({ companyProfile: publicProfile(currentCompanyProfile()) });
    } catch (error) { next(error); }
  });

  router.put("/manager/company-profile", requireRole("admin"), async (request, response, next) => {
    try {
      const body = request.body;
      if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, "companyProfile")) {
        throw new CompanyProfileError("INVALID_REQUEST", "Request body must contain only companyProfile.");
      }
      const companyProfile = saveCompanyProfile((body as Record<string, unknown>).companyProfile);
      await audit(database, request.currentUser!.id, "manager_company_profile_updated", `legalName=${companyProfile.legalName}`);
      response.status(200).json({ companyProfile: publicProfile(companyProfile) });
    } catch (error) { next(error); }
  });

  router.use((error: unknown, _request: import("express").Request, response: import("express").Response, next: import("express").NextFunction) => {
    if (error instanceof CompanyProfileError) { response.status(error.status).json({ error: error.code, message: error.message }); return; }
    next(error);
  });

  return router;
}

export const managerCompanyProfileRouter = createManagerCompanyProfileRouter();
