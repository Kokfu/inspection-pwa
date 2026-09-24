import { createRoot } from "react-dom/client";
import { TechnicianHome } from "../src/jobs/TechnicianHome";
import type { InspectionJob, JobSystemSnapshot } from "../src/jobs/jobTypes";
import "../src/styles/app.css";

const system: JobSystemSnapshot = {
  enabledSystemId: "00000000-0000-4000-8000-000000000001",
  systemKey: "fm200_fire_suppression",
  displayName: "FM200 System",
  sortOrder: 1,
  definitionStatus: "confirmed",
  zones: [{ id: "00000000-0000-4000-8000-000000000002", enabledSystemId: "00000000-0000-4000-8000-000000000001", key: "zone", displayName: "Zone", sortOrder: 1 }],
  locations: [{ id: "00000000-0000-4000-8000-000000000003", enabledSystemId: "00000000-0000-4000-8000-000000000001", zoneId: "00000000-0000-4000-8000-000000000002", key: "panel", displayName: "FM200 Panel", presetRowCount: 1, rowPreset: {}, sortOrder: 1 }]
};
const job: InspectionJob = {
  id: "00000000-0000-4000-8000-000000000004",
  reference: "FM200-OPEN-TEST",
  title: "FM200 open test",
  status: "open",
  createdAt: "2026-09-24T00:00:00.000Z",
  serviceDate: null,
  serviceTime: null,
  site: null,
  configurationSnapshot: { schemaVersion: 1, customer: { id: "00000000-0000-4000-8000-000000000005", code: "TEST", displayName: "Test Customer" }, configuration: { revisionId: "00000000-0000-4000-8000-000000000006", revisionNumber: 1 }, template: { id: "00000000-0000-4000-8000-000000000007", code: "MFE-FSSR", name: "Test", version: 7 }, enabledSystems: [system] }
};
const unavailable = () => undefined;
createRoot(document.getElementById("view")!).render(<TechnicianHome
  authState={{ status: "verified", user: { id: 1, username: "technician", role: "inspector" }, lastVerifiedAt: "2026-09-24T00:00:00.000Z" }}
  jobs={[job]} inspections={[]} masterSystemInspections={[]} masterSystemInspectionGroups={[]} masterSystemFormInstances={[]} inspectionAttachments={[]} serverMasterSystemInspections={[]} serverMasterSystemProgressState="loaded" loading={false} message="" selectedJobId={job.id}
  onRefresh={async () => undefined} onSync={async () => undefined} onCloseJob={async () => undefined} onViewFinalReport={unavailable} onNewServiceVisit={unavailable} onSelectJob={unavailable} onSelectSystem={() => { document.body.dataset.opened = "overview"; }} onBackToJobs={unavailable} onBackToSystems={unavailable} onOpenHoseReel={unavailable} onOpenCo2={unavailable} onOpenFm200={() => { document.body.dataset.opened = "fm200"; }} onOpenAutomaticSprinkler={unavailable} onOpenDryWetRiser={unavailable} onOpenFireAlarm={unavailable} onOpenHydrant={unavailable} onOpenPortableFireExtinguisher={unavailable} onOpenSmokeVentilation={unavailable} onOpenFireIntercom={unavailable}
/>);
