import type { CompanyProfile } from "../../reports/companyProfile.js";
import type { RepairVisitFieldIdentity, RepairVisitOutcome, RepairVisitBeforeSnapshot } from "../repairVisitContract.js";

/** Server authority only: caller resolves frozen Before and bound After bytes.
 * A missing downloaded phone photo never affects this model. Renderer is pure. */
export type RepairVisitReportPhoto = { content: Buffer; width: number; height: number; caption: string | null };
export type RepairVisitReportItem = {
  no: number; clientUuid: string; identity: RepairVisitFieldIdentity;
  systemLabel: string; unitLabel: string; sectionLabel: string; fieldLabel: string;
  before: { snapshot: RepairVisitBeforeSnapshot; photo: RepairVisitReportPhoto | null } | null;
  outcome: RepairVisitOutcome; remark: string; afterPhoto: RepairVisitReportPhoto;
};
export type RepairVisitReportModel = {
  company: CompanyProfile;
  cover: {
    visitUuid: string; visitNumber: string; visitDate: string; arrivalTime: string;
    customer: string; site: string; siteAddress: string | null; contactPerson: string | null;
    telephone: string | null; fax: string | null; contractNumber: string | null; serviceCallNumber: string | null;
    technician: string; technicians: string[];
    previousVisit: { kind: "service" | "repair"; visitNumber: string; visitDate: string } | null;
    acknowledgement: { name: string | null; designation: string | null; signedAt: string | null; signature: RepairVisitReportPhoto | null };
  };
  items: RepairVisitReportItem[];
} & ({ mode: "preview"; reportNumber: null; approvedBy: null; approvedAt: null }
  | { mode: "final"; reportNumber: string; approvedBy: string; approvedAt: string });
