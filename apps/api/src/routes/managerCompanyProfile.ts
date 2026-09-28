import { readFileSync } from "node:fs";
import express, { Router } from "express";
import type { Pool } from "pg";
import { pool } from "../db/pool.js";
import {
  clearCompanyLogo, companyLogoMaxBytes, CompanyLogoError, CompanyProfileError, currentCompanyProfile,
  resolveCompanyLogoFile, saveCompanyLogo, saveCompanyProfile, type CompanyProfile
} from "../reports/companyProfile.js";
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

  // Logo image byte size is validated by `saveCompanyLogo` itself; this raw-body cap only
  // stops an oversized request from being buffered into memory at all. Kept comfortably
  // above `companyLogoMaxBytes` so a legitimate max-size upload is never rejected here first.
  const rawLogoBody = express.raw({ type: ["image/png", "image/jpeg"], limit: companyLogoMaxBytes * 2 });

  router.get("/manager/company-profile/logo", requireRole("admin"), async (_request, response, next) => {
    try {
      const found = resolveCompanyLogoFile(currentCompanyProfile().logoFile);
      if (!found) { response.status(404).json({ error: "LOGO_NOT_FOUND", message: "No company logo is configured." }); return; }
      response.setHeader("Cache-Control", "private, no-store");
      response.type(found.mime).send(readFileSync(found.path));
    } catch (error) { next(error); }
  });

  router.put("/manager/company-profile/logo", requireRole("admin"), rawLogoBody, async (request, response, next) => {
    try {
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        throw new CompanyLogoError("LOGO_MISSING", "No logo image was received. Set Content-Type to image/png or image/jpeg.");
      }
      const companyProfile = await saveCompanyLogo(request.body);
      await audit(database, request.currentUser!.id, "manager_company_logo_updated", `bytes=${request.body.length}`);
      response.status(200).json({ companyProfile: publicProfile(companyProfile) });
    } catch (error) { next(error); }
  });

  router.put("/manager/company-profile/logo/reset", requireRole("admin"), async (request, response, next) => {
    try {
      const companyProfile = clearCompanyLogo();
      await audit(database, request.currentUser!.id, "manager_company_logo_reset", "");
      response.status(200).json({ companyProfile: publicProfile(companyProfile) });
    } catch (error) { next(error); }
  });

  router.use((error: unknown, _request: import("express").Request, response: import("express").Response, next: import("express").NextFunction) => {
    if (error instanceof CompanyProfileError || error instanceof CompanyLogoError) { response.status(error.status).json({ error: error.code, message: error.message }); return; }
    // A raw-body-parser payload-too-large error (`err.type === "entity.too.large"`) has no
    // `.status`/`.code` of our own shape; surface it as a normal logo-size validation failure
    // instead of falling through to the generic 500 handler.
    if (typeof error === "object" && error !== null && (error as { type?: string }).type === "entity.too.large") {
      response.status(400).json({ error: "LOGO_SIZE_INVALID", message: "Logo image is too large." });
      return;
    }
    next(error);
  });

  return router;
}

export const managerCompanyProfileRouter = createManagerCompanyProfileRouter();
