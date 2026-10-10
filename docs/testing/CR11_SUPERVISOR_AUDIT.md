# CR-11 final wording audit

Executed and printed: `grep -rni supervisor apps/web/src apps/api/src docs/client` using installed GNU grep.

All 446 remaining matching lines are non-visible internal identifiers, internal-role comments, test names or fixtures; intentionally retained. CSS comments are non-visible and explicitly excluded from edits. Arbitrary stored usernames, display names and user-authored content are preserved. Each remaining hit is classified below.

Missed - fixed during the audit: raw correction/decision role displays in AcceptedCorrectionsPanel, ManagerCorrectionEditor, ManagerFinalReportView and ManagerLocationProposals; the ManagerTechnicians deactivation prompt; reference-data refusal notices; inspection-format notices across systems; API staff validation/errors and the PDF approval refusal. No remaining visible role-wording misses.

```text
apps/web/src/App.tsx:132:import { isManagerRole, productRoleMatches, supervisorAllowsRoute } from "./manager/roleAccess";
  => internal identifier - intentionally kept
apps/web/src/App.tsx:898:        if (isManagerRole(decision.user.role) && readManagerExperience()) setSelectedExperience((current) => current ?? (decision.user.role === "supervisor" ? "supervisor" : "manager"));
  => internal identifier - intentionally kept
apps/web/src/App.tsx:902:      if (decision.user.role !== "supervisor") await refreshServerWorkspace(decision.user, operation);
  => internal identifier - intentionally kept
apps/web/src/App.tsx:1181:  const managerExperience = (selectedExperience === "manager" || selectedExperience === "supervisor")
  => internal identifier - intentionally kept
apps/web/src/App.tsx:1184:  // A supervisor gets the review-only part of the Manager experience (T4).
  => internal identifier - intentionally kept
apps/web/src/App.tsx:1185:  const supervisorExperience = managerExperience && selectedExperience === "supervisor";
  => internal identifier - intentionally kept
apps/web/src/App.tsx:1197:      setRoleMessage(`This signed-in account does not have ${role === "manager" ? "Manager" : role === "supervisor" ? "Admin" : "Technician"} access. Choose the role for this account to continue.`);
  => internal identifier - intentionally kept
apps/web/src/App.tsx:1201:    if ((role === "manager" || role === "supervisor") && authState.status === "verified") navigate({ name: "manager-home" });
  => internal identifier - intentionally kept
apps/web/src/App.tsx:1318:    // A supervisor deep-linking to an admin-only Manager screen lands on Manager Home (T4).
  => internal identifier - intentionally kept
apps/web/src/App.tsx:1319:    if (supervisorExperience && !supervisorAllowsRoute(route.name)) { navigate({ name: "manager-home" }); return; }
  => internal identifier - intentionally kept
apps/web/src/App.tsx:1354:  }, [managerExperience, supervisorExperience, route]);
  => internal identifier - intentionally kept
apps/web/src/App.tsx:1576:          ? `This account is signed in, but it does not have ${selectedExperience === "manager" ? "Manager" : selectedExperience === "supervisor" ? "Admin" : "Technician"} access. Choose the role for this account to continue.`
  => internal identifier - intentionally kept
apps/web/src/App.tsx:1581:      if (selectedExperience === "manager" || selectedExperience === "supervisor") {
  => internal identifier - intentionally kept
apps/web/src/App.tsx:2286:            <h1 id="app-title">{managerExperience || selectedExperience === "manager" || selectedExperience === "supervisor" ? "Field Service Management" : "Field Service Inspections"}</h1>
  => internal identifier - intentionally kept
apps/web/src/App.tsx:2323:          <RoleSelection message={roleMessage || ((selectedExperience === "manager" || selectedExperience === "supervisor") && authState.status === "offline-unverified" ? `Reconnect to verify ${selectedExperience === "supervisor" ? "Admin" : "Manager"} access. Operations are not available offline.` : "")} onSelect={selectExperience} />
  => internal identifier - intentionally kept
apps/web/src/App.tsx:2332:          <LoginForm roleLabel={selectedExperience === "manager" ? "Manager" : selectedExperience === "supervisor" ? "Admin" : "Technician"} onLogin={handleLogin} />
  => internal identifier - intentionally kept
apps/web/src/App.tsx:2652:          navLinks={[["Home", "manager-home"], ...managerNavLinks(supervisorExperience)]}
  => internal identifier - intentionally kept
apps/web/src/App.tsx:2656:        {!route.name.startsWith("manager-") || (supervisorExperience && !supervisorAllowsRoute(route.name)) ? <p role="status">Opening Manager Home…</p>
  => internal identifier - intentionally kept
apps/web/src/App.tsx:2657:        : route.name === "manager-home" ? <ManagerHome navigate={navigate} supervisor={supervisorExperience} onAuthorityFailure={handleManagerRequestFailure} />
  => internal identifier - intentionally kept
apps/web/src/App.tsx:2677:        : route.name === "manager-services-done" ? <><button type="button" className="secondary-command mobile-only-back" onClick={() => navigate({ name: "manager-home" })}>Back to Home</button><ManagerServicesDone key={authAuthorityGuard.current.currentGeneration} supervisor={supervisorExperience} message={managerMessage} onAuthorityFailure={handleManagerRequestFailure} onViewServiceVisit={(jobId) => openManagerVisit("manager-service-visit", jobId, { hash: hashForRoute(route), label: "Back to Services Done" })} onViewReport={(jobId) => openManagerVisit("manager-final-report", jobId, { hash: hashForRoute(route), label: "Back to Services Done" })} onDownloadReport={downloadManagerReport} /></>
  => internal identifier - intentionally kept
apps/web/src/App.tsx:2680:          <ManagerFinalReportView jobId={route.jobId} backLabel={managerReturn?.label} currentUserRole={currentUser?.role === "admin" || currentUser?.role === "supervisor" ? currentUser.role : undefined} onBack={backFromManagerVisit} onAuthorizationFailure={handleManagerReportAuthorizationFailure} onServerUnavailable={(message) => failClosedManagerOperations(message, false)} />
  => internal identifier - intentionally kept
apps/web/src/App.tsx:2685:            canReview={supervisorExperience}
  => internal identifier - intentionally kept
apps/web/src/App.tsx:2719:            supervisor={supervisorExperience}
  => internal identifier - intentionally kept
apps/web/src/App.tsx:2728:            onDelete={supervisorExperience ? undefined : async (visit) => { try { await deleteManagerServiceVisit(visit.id); if (route.name === "manager-service-visit") navigate({ name: "manager-operations" }); await refreshManagerVisits(); } catch (error) { handleManagerRequestFailure(error); } }}
  => internal identifier - intentionally kept
apps/web/src/auth/authApi.ts:6:  role: "admin" | "inspector" | "supervisor";
  => internal identifier - intentionally kept
apps/web/src/auth/authApi.ts:12:/** Supervisors review; they never create inspections (T4), so they are never a creator. */
  => internal identifier - intentionally kept
apps/web/src/auth/authApi.ts:14:  return user && user.role !== "supervisor" ? { id: user.id, username: user.username, role: user.role } : undefined;
  => internal identifier - intentionally kept
apps/web/src/auth/authStateRepository.ts:29:    || (state.role !== "admin" && state.role !== "inspector" && state.role !== "supervisor")
  => internal identifier - intentionally kept
apps/web/src/corrections/AcceptedCorrectionsPanel.tsx:9: * Read-only for everyone (technicians see their own records; supervisors and admins see any). It is
  => internal identifier - intentionally kept
apps/web/src/corrections/AcceptedCorrectionsPanel.tsx:15:  reason: string; correctedBy: string; correctedByRole: "admin" | "supervisor"; correctedAt: string;
  => internal identifier - intentionally kept
apps/web/src/corrections/AcceptedCorrectionsPanel.tsx:44:      || (correction.correctedByRole !== "admin" && correction.correctedByRole !== "supervisor")
  => internal identifier - intentionally kept
apps/web/src/db/localDatabase.ts:40:  role?: "admin" | "inspector" | "supervisor";
  => internal identifier - intentionally kept
apps/web/src/fireRatedRollerShutter/FireRatedRollerShutterInspectionForm.tsx:78:   *  Supervisor work), and never over a proposal already made for this visit. The inspection itself
  => internal identifier - intentionally kept
apps/web/src/jobs/locationProposalShape.ts:1:/** Browser-side shape check shared by queued technician drafts and Supervisor review responses.
  => internal identifier - intentionally kept
apps/web/src/jobs/ReportApprovalChip.tsx:8: * what a supervisor or admin sees.
  => internal identifier - intentionally kept
apps/web/src/jobs/ReportApprovalChip.tsx:13:  decidedByRole: "admin" | "supervisor" | null;
  => internal identifier - intentionally kept
apps/web/src/jobs/ReportApprovalChip.tsx:23:    && (candidate.decidedByRole === null || candidate.decidedByRole === "admin" || candidate.decidedByRole === "supervisor")
  => internal identifier - intentionally kept
apps/web/src/jobs/TechnicianLocationProposal.tsx:12: * a Supervisor/Admin. Deliberately lightweight -- no row count, no row content -- because a genuinely
  => internal identifier - intentionally kept
apps/web/src/jobs/technicianLocationProposalDraft.ts:7: * Technician-proposed customer location patch, reviewed by a Supervisor/Admin before it's merged into
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:38: * explicit admin/supervisor decision, with an append-only history; a correction after approval
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:43:export type ReportApprovalRole = "admin" | "supervisor";
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:84: * What the review screens (Services Done, service history) read from a customer. A supervisor's
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:96:/** A field account on the Technician List: a technician (`inspector`) or, since T4, a supervisor. */
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:97:export type ManagerTechnician = { id: number; username: string; displayName: string | null; role: "inspector" | "supervisor"; isActive: boolean; createdAt: string };
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:98:export type AssignedManagerTechnician = ManagerTechnician & { supervisorIds: number[] };
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:102:export type ReminderStaff = { id: number; username: string; displayName: string | null; role: "inspector" | "supervisor"; isActive: boolean; email: string | null };
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:136:    && (row.displayName === null || typeof row.displayName === "string") && (row.role === "inspector" || row.role === "supervisor")
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:178:    && (value.role === "inspector" || value.role === "supervisor") && typeof value.isActive === "boolean"
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:183:  const supervisorIds = (value as unknown as Record<string, unknown>).supervisorIds;
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:184:  return Array.isArray(supervisorIds) && supervisorIds.every((id) => Number.isSafeInteger(id) && id > 0)
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:185:    && new Set(supervisorIds).size === supervisorIds.length;
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:201:export async function setTechnicianSupervisorAssignment(technicianId: number, supervisorId: number, assigned: boolean): Promise<void> {
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:203:    `/api/manager/technicians/${technicianId}/assignments${assigned ? "" : `/${supervisorId}`}`,
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:204:    assigned ? "POST" : "DELETE", null, assigned ? { supervisorId } : undefined
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:206:  if (result.technicianId !== technicianId || result.supervisorId !== supervisorId || result.assigned !== assigned) unavailable();
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:208:export async function createManagerTechnician(input: { username: string; password: string; displayName?: string | null; role?: "inspector" | "supervisor" }): Promise<ManagerTechnician> {
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:1075:  reason: string; correctedBy: string; correctedByRole: "admin" | "supervisor"; correctedAt: string; requestId: string;
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:1102:    && (value.correctedByRole === "admin" || value.correctedByRole === "supervisor")
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:1253:    && (value.decidedByRole === null || value.decidedByRole === "admin" || value.decidedByRole === "supervisor")
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:1265:    && (value.decidedByRole === "admin" || value.decidedByRole === "supervisor")
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:1294: * of what a technician actually typed into the live inspection form -- reviewed by an admin/supervisor.
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:1301:export type LocationProposalDecisionRole = "admin" | "supervisor";
  => internal identifier - intentionally kept
apps/web/src/manager/managerApi.ts:1353:    && (value.decidedByRole === "admin" || value.decidedByRole === "supervisor")
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerCorrectionEditor.tsx:11: * T5b: a supervisor or admin corrects one Accepted record. The accepted inspection is never changed —
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerEmailReminders.tsx:67:      <ul className="manager-technician-list">{visibleStaff.map((person) => <li key={person.id}><strong>{person.displayName ?? person.username}</strong> · {person.role === "supervisor" ? "Admin" : "Technician"} · {person.isActive ? "Active" : "Inactive"}
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerFinalReportView.tsx:27:  currentUserRole?: "admin" | "supervisor";
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerFinalReportView.tsx:82:  /** Admin/supervisor only; a supervisor can never withdraw (T6 §8 Q1). */
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerFinalReportView.tsx:83:  currentUserRole?: "admin" | "supervisor";
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerHome.tsx:10: * Single source of truth for the manager/supervisor top-level destinations, shared by the
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerHome.tsx:13:export function managerNavLinks(supervisor: boolean): Array<[string, ManagerDashboardRoute["name"]]> {
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerHome.tsx:14:  return supervisor
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerHome.tsx:34: * Cards a supervisor sees (T4): review only — no technician, customer or schedule management. The
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerHome.tsx:36: * Manager UI navigation split); that screen is off-limits to a supervisor (`roleAccess.ts`). A
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerHome.tsx:37: * supervisor's own "Services" card therefore points at the review/operations list instead — same
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerHome.tsx:53:  navigate, supervisor = false, onAuthorityFailure = () => undefined
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerHome.tsx:56:  supervisor?: boolean;
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerHome.tsx:59:  const links = managerNavLinks(supervisor);
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerHome.tsx:87:  // due-date column this reads). A supervisor never fetches or sees this -- review-only, cannot act on it.
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerHome.tsx:90:    if (supervisor) return;
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerHome.tsx:104:  }, [supervisor]);
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerHome.tsx:111:    <div className="workspace-heading"><div><p className="eyebrow">{supervisor ? "Admin workspace" : "Manager workspace"}</p><h2 id="manager-dashboard-title">Home</h2></div></div>
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerHome.tsx:124:    {!supervisor && reminders && reminders.overdue.length > 0 ? <section aria-label="Overdue"><h3>Overdue ({reminders.overdue.length})</h3>{reminderList(reminders.overdue)}</section> : null}
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerHome.tsx:125:    {!supervisor && reminders && reminders.dueSoon.length > 0 ? <section aria-label="Due soon"><h3>Due soon ({reminders.dueSoon.length})</h3>{reminderList(reminders.dueSoon)}</section> : null}
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerOperations.tsx:20:export function ManagerOperations({ visits, loading, message, selectedVisit, acceptedRecords = [], acceptedRecordsUnavailable = false, backLabel = "Back to Operations", supervisor = false, onRefresh, onSelect, onBack, onViewReport, onDownloadReport, onCorrect, onDelete }: {
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerOperations.tsx:25:  /** T5: the visit's accepted records, so a supervisor or admin can open one for correction. */
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerOperations.tsx:30:  supervisor?: boolean;
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerOperations.tsx:69:    {selectedVisit.status === "closed" ? <section className="report-summary"><h3>Completion</h3><p>Completed {selectedVisit.completion.completedAt ? formatMalaysiaDateTime(selectedVisit.completion.completedAt) : "at an unknown time"} by {selectedVisit.completion.completedBy?.username ?? "the recorded technician"}.</p><p><ReportApprovalChip visit={selectedVisit} /></p><button type="button" onClick={() => onViewReport(selectedVisit)}>View Final Report</button></section> : !supervisor && onDelete ? <div className="inline-actions"><button type="button" disabled={deletingId !== null || acceptedRecordsUnavailable || acceptedRecords.length > 0 || selectedVisit.hasAcceptedRecords === true || selectedVisit.inspectionProgress.accepted > 0} onClick={() => void deleteVisit(selectedVisit)}>Delete</button>{acceptedRecordsUnavailable ? <span className="support-metadata">Accepted records could not be checked.</span> : acceptedRecords.length > 0 || selectedVisit.hasAcceptedRecords === true || selectedVisit.inspectionProgress.accepted > 0 ? <span className="support-metadata">Cannot delete: accepted records exist.</span> : null}</div> : null}
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerOperations.tsx:78:  const visitCard = (visit: ManagerServiceVisit) => <li key={visit.id}><button type="button" className="job-card" onClick={() => onSelect(visit)}><div className="job-card-heading"><div><span className="job-card-label">Customer</span><strong>{visit.customer}</strong></div><span className={`status-badge status-badge--${visit.status === "closed" ? "complete" : "draft"}`}>{visit.status === "closed" ? "Service Completed" : "In Progress"}</span></div><div className="job-service-line"><span className="job-card-label">Site / Service</span><strong>{visit.site}</strong></div><div className="job-card-meta"><span><small>Created Date & Time</small><strong>{formatMalaysiaDateTime(visit.createdAt)}</strong></span><span><small>Inspection progress</small><strong>{visit.inspectionProgress.accepted}/{visit.inspectionProgress.required} complete</strong></span></div><span className="job-reference">{visit.reference}</span></button>{visit.status === "closed" ? <div className="inline-actions manager-report-actions"><ReportApprovalChip visit={visit} /><button type="button" className="secondary-command" onClick={() => onViewReport(visit)}>View Final Report</button><button type="button" onClick={() => void onDownloadReport(visit)}>Download PDF</button></div> : !supervisor && onDelete ? <div className="inline-actions manager-report-actions"><button type="button" disabled={deletingId !== null || (visit.hasAcceptedRecords !== false || visit.inspectionProgress.accepted > 0)} title={(visit.hasAcceptedRecords !== false || visit.inspectionProgress.accepted > 0) ? "Accepted records prevent deletion." : undefined} onClick={() => void deleteVisit(visit)}>Delete</button>{(visit.hasAcceptedRecords !== false || visit.inspectionProgress.accepted > 0) ? <span className="support-metadata">Cannot delete: accepted records exist.</span> : null}</div> : null}</li>;
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerOperations.tsx:79:  return <section className="manager-home" aria-labelledby="manager-home-title"><div className="home-toolbar"><div><p className="eyebrow">{supervisor ? "Admin workspace" : "Manager workspace"}</p><h2 id="manager-home-title">Operations</h2><p>{supervisor ? "Read-only service visit visibility." : "Service visit visibility and management."}</p></div><button type="button" className="secondary-command" disabled={loading} onClick={() => void onRefresh()}>{loading ? "Refreshing…" : "Refresh"}</button></div>
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerReminderPlan.tsx:43:              {person.displayName ?? person.username} · {person.role === "supervisor" ? "Admin" : "Technician"}{person.email ? ` · ${person.email}` : " · add email in Email reminders Settings"}
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerServicesDone.tsx:7:  supervisor?: boolean;
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerServicesDone.tsx:33:export function ManagerServicesDone({ supervisor = false, message = "", onAuthorityFailure, onViewServiceVisit, onViewReport, onDownloadReport }: Props) {
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerServicesDone.tsx:50:      // Supervisors never create visits, so only technicians are offered as a "created by" filter.
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerServicesDone.tsx:91:        canManageVisits={!supervisor}
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerTechnicians.tsx:2:import { createManagerTechnician, deactivateManagerTechnician, deleteManagerTechnician, loadManagerTechnicians, resetManagerTechnicianPassword, setTechnicianSupervisorAssignment, updateManagerTechnicianDisplayName, ManagerApiError, type AssignedManagerTechnician, type ManagerTechnician } from "./managerApi";
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerTechnicians.tsx:39:  const [role, setRole] = useState<"inspector" | "supervisor">("inspector");
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerTechnicians.tsx:64:  const supervisors = technicians.filter((row) => row.role === "supervisor");
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerTechnicians.tsx:79:      <label>Role<select value={role} onChange={(event) => setRole(event.target.value === "supervisor" ? "supervisor" : "inspector")}>
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerTechnicians.tsx:81:        <option value="supervisor">Admin (review only)</option>
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerTechnicians.tsx:83:      <button disabled={busy} type="submit">{role === "supervisor" ? "Add Admin" : "Add Technician"}</button>
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerTechnicians.tsx:104:      {technician.role === "supervisor" && <span className="status-badge status-badge--neutral">Admin</span>}
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerTechnicians.tsx:108:        {supervisors.length ? supervisors.map((supervisor) => <label key={supervisor.id} className="checkbox-label">
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerTechnicians.tsx:109:          <input type="checkbox" checked={technician.supervisorIds.includes(supervisor.id)} onChange={(event) => void mutate(() => setTechnicianSupervisorAssignment(technician.id, supervisor.id, event.target.checked))} />
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerTechnicians.tsx:110:          {supervisor.displayName ?? supervisor.username}{supervisor.isActive ? "" : " (inactive)"}
  => internal identifier - intentionally kept
apps/web/src/manager/ManagerTechnicians.tsx:126:        if (window.confirm(`Deactivate this ${technician.role === "supervisor" ? "Admin" : "technician"}? They will no longer be able to log in.`)) void mutate(() => deactivateManagerTechnician(technician.id));
  => internal identifier - intentionally kept
apps/web/src/manager/roleAccess.ts:4:/** Roles that may use the operations workspace: admin and supervisor (review only, T4). */
  => internal identifier - intentionally kept
apps/web/src/manager/roleAccess.ts:6:  return role === "admin" || role === "supervisor";
  => internal identifier - intentionally kept
apps/web/src/manager/roleAccess.ts:13:  return user.role === "supervisor";
  => internal identifier - intentionally kept
apps/web/src/manager/roleAccess.ts:17: * Manager screens a supervisor may open (T4): Home, Services (operations), Current Services Done, a
  => internal identifier - intentionally kept
apps/web/src/manager/roleAccess.ts:20: * the authority, this only keeps a supervisor off screens that would fail.
  => internal identifier - intentionally kept
apps/web/src/manager/roleAccess.ts:22:const supervisorRoutes: ReadonlySet<string> = new Set([
  => internal identifier - intentionally kept
apps/web/src/manager/roleAccess.ts:26:export function supervisorAllowsRoute(routeName: string) {
  => internal identifier - intentionally kept
apps/web/src/manager/roleAccess.ts:27:  return supervisorRoutes.has(routeName);
  => internal identifier - intentionally kept
apps/web/src/manager/roleAccess.ts:31:export function reviewerRoleLabel(role: "admin" | "supervisor" | null): string {
  => internal identifier - intentionally kept
apps/web/src/manager/RoleSelection.tsx:1:export type ProductRole = "technician" | "manager" | "supervisor";
  => internal identifier - intentionally kept
apps/web/src/manager/RoleSelection.tsx:23:      <button type="button" className="role-card" onClick={() => onSelect("supervisor")}>
  => internal identifier - intentionally kept
apps/web/src/portableFireExtinguisher/portableFireExtinguisher.ts:15:export async function getOrCreatePortable(job:InspectionJob,system:JobSystemSnapshot,catalog:InspectionCatalog,creator:AuthUser|undefined){const portableStore = localDatabase.masterSystemInspections as any;const jobSystemKey=`${job.id}:${key}`,stored=await portableStore.where("jobSystemKey").equals(jobSystemKey).first();if(stored){if(stored.systemKey!==key)throw Error("Stored Portable Fire Extinguisher identity is invalid");return stored as PortableRecord;}const definition=compatibleCatalogSystem(catalog,job.configurationSnapshot.template,key)?.system.definition;if(!definition||system.systemKey!==key||system.zones.length||system.locations.length)throw Error("Cached compatible Portable Fire Extinguisher definition is unavailable. Refresh jobs online first.");const t=now(),record:PortableRecord={schemaVersion:1,clientUuid:crypto.randomUUID(),jobSystemKey,jobId:job.id,systemKey:key,instanceKey:"primary",configuredZoneId:null,configuredLocationId:null,displaySequence:1,originalCreatorSnapshot:creator&&creator.role!=="supervisor"?{source:"device_reported",userId:creator.id,username:creator.username,role:creator.role,capturedAt:t}:null,masterTemplate:{id:job.configurationSnapshot.template.id,code:"MFE-FSSR",version:job.configurationSnapshot.template.version},configuration:job.configurationSnapshot.configuration,inspectionSnapshot:{schemaVersion:1,capturedAt:t,job:{id:job.id,reference:job.reference,title:job.title},customer:job.configurationSnapshot.customer,configuration:job.configurationSnapshot.configuration,template:job.configurationSnapshot.template,system:{...system,definition,repetitionMode:"single_quantity_summary"}},responses:empty(),performedAt:t,localCreatedAt:t,localUpdatedAt:t,syncStatus:"Draft"};await portableStore.add(record);return record;}
  => internal identifier - intentionally kept
apps/web/src/styles/app.css:374:/* Supervisor proposal review: each saved row is a small block, one labelled value per line. */
  => internal identifier - intentionally kept
apps/api/src/auth/authTypes.ts:1:export type UserRole = "admin" | "inspector" | "supervisor";
  => internal identifier - intentionally kept
apps/api/src/cli/adminCli.integration.test.ts:19:async function insertUser(username: string, role: "admin" | "inspector" | "supervisor", active = true, password = oldPassword) {
  => internal identifier - intentionally kept
apps/api/src/cli/adminCli.integration.test.ts:84:    await t.test("d. reset refuses technicians, supervisors and missing users and changes nothing", async () => {
  => internal identifier - intentionally kept
apps/api/src/cli/adminCli.integration.test.ts:85:      const supervisorId = await insertUser("review-lead", "supervisor");
  => internal identifier - intentionally kept
apps/api/src/cli/adminCli.integration.test.ts:87:      await insertSession(supervisorId);
  => internal identifier - intentionally kept
apps/api/src/cli/adminCli.integration.test.ts:97:      assert.equal(await activeSessions(techId), 1); assert.equal(await activeSessions(supervisorId), 1);
  => internal identifier - intentionally kept
apps/api/src/db/migrations.ts:125:const supervisorRoleMigrationUrl = new URL(
  => internal identifier - intentionally kept
apps/api/src/db/migrations.ts:126:  "../../migrations/039_supervisor_role.sql", import.meta.url
  => internal identifier - intentionally kept
apps/api/src/db/migrations.ts:134:const technicianSupervisorAssignmentsMigrationUrl = new URL(
  => internal identifier - intentionally kept
apps/api/src/db/migrations.ts:135:  "../../migrations/042_technician_supervisor_assignments.sql", import.meta.url
  => internal identifier - intentionally kept
apps/api/src/db/migrations.ts:573:  // include 'supervisor'; a CHECK that already names 'supervisor' is the replay marker.
  => internal identifier - intentionally kept
apps/api/src/db/migrations.ts:574:  const supervisorRole = await database.query<{ exists: boolean }>(
  => internal identifier - intentionally kept
apps/api/src/db/migrations.ts:576:      AND conrelid='users'::regclass AND pg_get_constraintdef(oid) LIKE '%''supervisor''%') AS exists`
  => internal identifier - intentionally kept
apps/api/src/db/migrations.ts:578:  if (!supervisorRole.rows[0]?.exists) {
  => internal identifier - intentionally kept
apps/api/src/db/migrations.ts:579:    await database.query(await readFile(supervisorRoleMigrationUrl, "utf8"));
  => internal identifier - intentionally kept
apps/api/src/db/migrations.ts:596:  const technicianSupervisorAssignments = await database.query<{ exists: boolean }>(
  => internal identifier - intentionally kept
apps/api/src/db/migrations.ts:597:    `SELECT to_regclass('public.technician_supervisor_assignments') IS NOT NULL AS exists`
  => internal identifier - intentionally kept
apps/api/src/db/migrations.ts:599:  if (!technicianSupervisorAssignments.rows[0]?.exists) {
  => internal identifier - intentionally kept
apps/api/src/db/migrations.ts:600:    await database.query(await readFile(technicianSupervisorAssignmentsMigrationUrl, "utf8"));
  => internal identifier - intentionally kept
apps/api/src/inspections/locationProposal.test.ts:10:  decidedByRole: "supervisor",
  => internal identifier - intentionally kept
apps/api/src/inspections/locationProposal.ts:5: * Technician-proposed, Supervisor/Admin-approved customer zone/location configuration
  => internal identifier - intentionally kept
apps/api/src/inspections/locationProposal.ts:19:export type LocationProposalDecisionRole = "admin" | "supervisor";
  => internal identifier - intentionally kept
apps/api/src/jobs/technicianOwnership.ts:61: * T5c: a supervisor reviews every accepted record, so read-only review routes skip the technician
  => internal identifier - intentionally kept
apps/api/src/jobs/technicianOwnership.ts:62: * ownership check for that role only. `technicianOwns` itself gains no supervisor branch — no write path
  => internal identifier - intentionally kept
apps/api/src/jobs/technicianOwnership.ts:70:    if (request.currentUser?.role === "supervisor") { next(); return; }
  => internal identifier - intentionally kept
apps/api/src/middleware/requireRole.ts:28: * `requireRole` for the Manager routers: identical decision, and a supervisor who is refused leaves an
  => internal identifier - intentionally kept
apps/api/src/middleware/requireRole.ts:36:    if (user?.role === "supervisor" && !roles.includes("supervisor")) {
  => internal identifier - intentionally kept
apps/api/src/reminderWorker.integration.test.ts:35:    const supervisor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role,reminder_email) VALUES('reminder-supervisor','x','supervisor','supervisor@example.test') RETURNING id::int AS id")).rows[0]!.id;
  => internal identifier - intentionally kept
apps/api/src/reminderWorker.integration.test.ts:40:    await database.query("INSERT INTO service_due_reminder_recipients(plan_id,staff_user_id) VALUES($1,$2),($1,$3)", [plan, technician, supervisor]);
  => internal identifier - intentionally kept
apps/api/src/reminderWorker.integration.test.ts:43:    const app = express(); app.use(express.json()); app.use((request, _response, next) => { if (role) request.currentUser = { id: role === "admin" ? admin : supervisor, username: role, role }; next(); });
  => internal identifier - intentionally kept
apps/api/src/reminderWorker.integration.test.ts:55:      role = "supervisor"; assert.equal((await request("/manager/reminders/settings")).status, 403);
  => internal identifier - intentionally kept
apps/api/src/reminderWorker.integration.test.ts:84:      assert.deepEqual(sent.sort(), ["supervisor@example.test", "tech@example.test"]);
  => internal identifier - intentionally kept
apps/api/src/reminderWorker.integration.test.ts:92:      await database.query("INSERT INTO service_due_reminder_recipients(plan_id,staff_user_id) VALUES($1,$2),($1,$3)", [nextPlan, technician, supervisor]);
  => internal identifier - intentionally kept
apps/api/src/reminderWorker.integration.test.ts:95:      assert.deepEqual(outcomes, [{ recipient_email: "supervisor@example.test", status: "unknown" }, { recipient_email: "tech@example.test", status: "failed" }]);
  => internal identifier - intentionally kept
apps/api/src/reminderWorker.ts:20:      AND (recipient.staff_user_id IS NULL OR (staff.is_active=true AND staff.role IN ('inspector','supervisor')))
  => internal identifier - intentionally kept
apps/api/src/reminderWorker.ts:37:        ((recipient.staff_user_id=$3::bigint AND staff.is_active=true AND staff.role IN ('inspector','supervisor') AND lower(staff.reminder_email)=$4)
  => internal identifier - intentionally kept
apps/api/src/reports/reportApproval.test.ts:10:  decidedByRole: "supervisor",
  => internal identifier - intentionally kept
apps/api/src/reports/reportApproval.test.ts:34:  assert.equal(state.decidedByRole, "supervisor");
  => internal identifier - intentionally kept
apps/api/src/reports/reportApproval.ts:5: * "awaiting approval" to "approved" only by an explicit admin/supervisor decision, recorded as an
  => internal identifier - intentionally kept
apps/api/src/reports/reportApproval.ts:17:export type ReportApprovalRole = "admin" | "supervisor";
  => internal identifier - intentionally kept
apps/api/src/reports/reportReview.test.ts:15:test("V7 report pages print the technician and current supervisor review state", () => {
  => internal identifier - intentionally kept
apps/api/src/routes/authSecurity.integration.test.ts:44:    const users = (await pool.query("INSERT INTO users(username,password_hash,role,is_active) VALUES('security-admin',$1,'admin',true),('security-supervisor',$1,'supervisor',true),('security-a',$1,'inspector',true),('security-b',$1,'inspector',true),('security-inactive',$1,'inspector',false) RETURNING id,username",[hash])).rows;
  => internal identifier - intentionally kept
apps/api/src/routes/authSecurity.integration.test.ts:75:      for(const name of ["security-admin","security-supervisor","security-a","security-b"]) assert.equal((await login(name)).status,200);
  => internal identifier - intentionally kept
apps/api/src/routes/authSecurity.integration.test.ts:100:      const adminLogin=await login("security-admin"), techLogin=await login("security-a"), supervisorLogin=await login("security-supervisor");
  => internal identifier - intentionally kept
apps/api/src/routes/authSecurity.integration.test.ts:102:      const admin=cookie(adminLogin), tech=cookie(techLogin), supervisor=cookie(supervisorLogin);
  => internal identifier - intentionally kept
apps/api/src/routes/authSecurity.integration.test.ts:106:      for(const actor of [tech,supervisor]) for(const path of ["/manager/technicians",`/manager/technicians/${users[3].id}/password`,`/manager/technicians/${users[3].id}/deactivate`]) assert.equal((await request(path,"POST",{},actor,{"x-role":"admin"})).status,403);
  => internal identifier - intentionally kept
apps/api/src/routes/authSecurity.integration.test.ts:120:      assert.equal((await request("/inspection-jobs","GET",undefined,supervisor)).status,401);
  => internal identifier - intentionally kept
apps/api/src/routes/finalReportCaptureSource.test.ts:28:  await handler({ params: { jobId }, currentUser: { role: "supervisor" } } as never, response as never, (error: unknown) => { throw error; });
  => internal identifier - intentionally kept
apps/api/src/routes/inspectionAttachments.ts:664:  requireRole("admin", "inspector", "supervisor"),
  => internal identifier - intentionally kept
apps/api/src/routes/inspectionAttachments.ts:704:  requireRole("admin", "inspector", "supervisor"),
  => internal identifier - intentionally kept
apps/api/src/routes/inspectionJobs.ts:166:  // the admin, or (T4) a supervisor on the Manager report routes, which see the same
  => internal identifier - intentionally kept
apps/api/src/routes/inspectionJobs.ts:167:  // visits as the admin; the technician report routes never admit a supervisor.
  => internal identifier - intentionally kept
apps/api/src/routes/inspectionJobs.ts:169:  return role === "admin" || role === "supervisor" ? "manager" as const : "technician" as const;
  => internal identifier - intentionally kept
apps/api/src/routes/inspectionJobs.ts:240:      // T6 (owner decision): a report may not be downloaded until an admin or supervisor approves
  => internal identifier - intentionally kept
apps/api/src/routes/locationProposals.integration.test.ts:16: * Supervisor/Admin, and (on Approve) merged into the customer's CURRENT configuration fresh at
  => internal identifier - intentionally kept
apps/api/src/routes/locationProposals.integration.test.ts:47:    const supervisor = await user("lpp-review", "supervisor"), admin = await user("lpp-admin", "admin");
  => internal identifier - intentionally kept
apps/api/src/routes/locationProposals.integration.test.ts:49:    const actors: Record<string, { id: number; username: string; role: "admin" | "inspector" | "supervisor" }> = {
  => internal identifier - intentionally kept
apps/api/src/routes/locationProposals.integration.test.ts:51:      supervisor: { id: supervisor, username: "lpp-review", role: "supervisor" },
  => internal identifier - intentionally kept
apps/api/src/routes/locationProposals.integration.test.ts:90:      assert.equal((await submit("supervisor", addPatchNewZone("tnb-room", "TNB Room", "zone-tnb", "TNB Zone"))).status, 403);
  => internal identifier - intentionally kept
apps/api/src/routes/locationProposals.integration.test.ts:123:      const tnbApprove = await decide(tnbProposalId, "supervisor", { requestId: id(), decision: "approved" });
  => internal identifier - intentionally kept
apps/api/src/routes/locationProposals.integration.test.ts:143:      assert.equal((await decide(formatProposalId, "supervisor", { requestId: id(), decision: "rejected" })).status, 400);
  => internal identifier - intentionally kept
apps/api/src/routes/locationProposals.integration.test.ts:145:      const formatApprove = await decide(formatProposalId, "supervisor", { requestId: id(), decision: "approved" });
  => internal identifier - intentionally kept
apps/api/src/routes/locationProposals.integration.test.ts:199:      const firstShutterApproval = await decide(firstShutterId, "supervisor", { requestId: id(), decision: "approved" });
  => internal identifier - intentionally kept
apps/api/src/routes/locationProposals.integration.test.ts:230:      assert.equal((await decide(zonedShutterId, "supervisor", { requestId: id(), decision: "approved" })).status, 201);
  => internal identifier - intentionally kept
apps/api/src/routes/locationProposals.integration.test.ts:247:      assert.equal((await decide(firstHoseId, "supervisor", { requestId: id(), decision: "approved" })).status, 201);
  => internal identifier - intentionally kept
apps/api/src/routes/locationProposals.integration.test.ts:295:        const addFirstApprove = await decide(addFirstId, "supervisor", { requestId: id(), decision: "approved" });
  => internal identifier - intentionally kept
apps/api/src/routes/locationProposals.integration.test.ts:321:        assert.equal((await decide(secondFormatId, "supervisor", { requestId: id(), decision: "approved" })).status, 201);
  => internal identifier - intentionally kept
apps/api/src/routes/locationProposals.integration.test.ts:356:        assert.equal((await decide(firstPrimaryId, "supervisor", { requestId: id(), decision: "approved" })).status, 201);
  => internal identifier - intentionally kept
apps/api/src/routes/locationProposals.integration.test.ts:386:        assert.equal((await decide(secondPrimaryId, "supervisor", { requestId: id(), decision: "approved" })).status, 201);
  => internal identifier - intentionally kept
apps/api/src/routes/locationProposals.integration.test.ts:428:        const approved = await decide(proposalId, "supervisor", { requestId: id(), decision: "approved" });
  => internal identifier - intentionally kept
apps/api/src/routes/locationProposals.integration.test.ts:465:      const decisions = raceIds.map((proposalId) => decide(proposalId, "supervisor", { requestId: id(), decision: "approved" }));
  => internal identifier - intentionally kept
apps/api/src/routes/locationProposals.ts:20: * Technician-proposed, Supervisor/Admin-approved customer zone/location configuration.
  => internal identifier - intentionally kept
apps/api/src/routes/locationProposals.ts:219:  router.get("/manager/location-proposals", requireManagerRole("admin", "supervisor"), async (request, response, next) => {
  => internal identifier - intentionally kept
apps/api/src/routes/locationProposals.ts:235:  router.get("/manager/location-proposals/:id", requireManagerRole("admin", "supervisor"), async (request, response, next) => {
  => internal identifier - intentionally kept
apps/api/src/routes/locationProposals.ts:246:  router.post("/manager/location-proposals/:id/decision", requireManagerRole("admin", "supervisor"), async (request, response, next) => {
  => internal identifier - intentionally kept
apps/api/src/routes/managerCompanyProfile.test.ts:22:    if (role === "admin" || role === "supervisor" || role === "inspector") request.currentUser = { id: 1, username: String(role), role };
  => internal identifier - intentionally kept
apps/api/src/routes/managerCompanyProfile.test.ts:51:      assert.equal((await get("/manager/company-profile", "supervisor")).status, 403, "a supervisor has no access (admin-only, like Service Catalog)");
  => internal identifier - intentionally kept
apps/api/src/routes/managerCompanyProfile.test.ts:52:      assert.equal((await put("/manager/company-profile", {}, "supervisor")).status, 403);
  => internal identifier - intentionally kept
apps/api/src/routes/managerCompanyProfile.test.ts:99:      assert.equal((await get("/manager/company-profile/logo", "supervisor")).status, 403);
  => internal identifier - intentionally kept
apps/api/src/routes/managerCompanyProfile.test.ts:100:      assert.equal((await putImage("/manager/company-profile/logo", Buffer.from("x"), "image/png", "supervisor")).status, 403);
  => internal identifier - intentionally kept
apps/api/src/routes/managerCompanyProfile.test.ts:132:      assert.equal((await put("/manager/company-profile/logo/reset", {}, "supervisor")).status, 403);
  => internal identifier - intentionally kept
apps/api/src/routes/managerComplianceReminders.integration.test.ts:27:    const supervisor = await database.query<{ id: number }>("INSERT INTO users (username,password_hash,role) VALUES ('compliance-supervisor','not-used','supervisor') RETURNING id");
  => internal identifier - intentionally kept
apps/api/src/routes/managerComplianceReminders.integration.test.ts:28:    const supervisorId = supervisor.rows[0]!.id;
  => internal identifier - intentionally kept
apps/api/src/routes/managerComplianceReminders.integration.test.ts:62:      else if (role === "supervisor") request.currentUser = { id: supervisorId, username: "compliance-supervisor", role: "supervisor" };
  => internal identifier - intentionally kept
apps/api/src/routes/managerComplianceReminders.integration.test.ts:70:    const request = (role?: "admin" | "supervisor" | "inspector") =>
  => internal identifier - intentionally kept
apps/api/src/routes/managerComplianceReminders.integration.test.ts:75:      assert.equal((await request("supervisor")).status, 403, "supervisor is refused (T7 is admin-only, matching Next Upcoming Service)");
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:44:    const inspector = await user("corr-tech", "inspector"), supervisor = await user("corr-review", "supervisor"), admin = await user("corr-admin", "admin");
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:47:    // A supervisor reads a visit only through an active technician-supervisor assignment (migration 042).
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:48:    await pool.query("INSERT INTO technician_supervisor_assignments(technician_id,supervisor_id,created_by_user_id) VALUES($1,$2,$3)", [inspector, supervisor, admin]);
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:53:    const actors: Record<string, { id: number; username: string; role: "admin" | "inspector" | "supervisor" }> = {
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:54:      supervisor: { id: supervisor, username: "corr-review", role: "supervisor" }, admin: { id: admin, username: "corr-admin", role: "admin" },
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:66:    const dashboardStatus = async () => (await (await call("/manager/dashboard/inspection-status?from=2026-09-01&to=2026-09-30", "supervisor")).json()) as { passed: number; notOk: number; na: number };
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:71:      const view = await (await call(`/manager/inspections/${client}/corrections`, "supervisor")).json() as { supported: boolean; fields: Array<{ fieldPath: string; kind: string; value: unknown; label: string }> };
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:78:      assert.equal((await review("supervisor", 0, firstReviewId)).status, 201);
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:79:      assert.equal((await review("supervisor", 0, firstReviewId)).status, 200, "review replay is idempotent");
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:81:      assert.equal(((await (await call(`/manager/inspections/${client}/corrections`, "supervisor")).json()) as { review: { status: string; reviewedBy: string } }).review.status, "reviewed");
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:94:      const created = await post("supervisor", first);
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:97:      assert.equal(((await (await call(`/manager/inspections/${client}/corrections`, "supervisor")).json()) as { review: { status: string } }).review.status, "pending", "correction invalidates the prior review");
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:98:      assert.equal((await review("supervisor", 0)).status, 409, "stale review cannot approve a corrected record");
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:101:        [mainRemarks, 1, "", "Battery terminal corroded", "supervisor"], [mainSupply, 1, "good", "not_good", "supervisor"]
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:106:      const replay = await post("supervisor", first);
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:109:      assert.equal((await post("supervisor", { ...first, reason: "Something else entirely" })).status, 409);
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:137:      assert.equal((await review("supervisor", 3)).status, 201, "supervisor approves the corrected revision");
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:144:      const visit = await (await call(`/manager/service-visits/${job}/corrections`, "supervisor")).json() as { corrections: Array<{ clientUuid: string; label: string; reason: string }> };
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:167:      assert.equal((await call(`/inspections/${fireClient}/corrections`, "supervisor")).status, 200);
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:168:      const fireView = await (await call(`/manager/inspections/${fireClient}/corrections`, "supervisor")).json() as { supported: boolean; fields: unknown[] };
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:170:      const fireRefused = await call(`/manager/inspections/${fireClient}/corrections`, "supervisor", "POST", { requestId: id(), reason: "Should be refused outright", changes: [{ fieldPath: "controlPanelLocation", expectedCurrentValue: "Panel A", newValue: "Panel B" }] });
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:175:      // T5c: a supervisor reviews any accepted record and its evidence; a technician sees only their own.
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:177:        [`/wet-chemical-inspections/${client}`, "supervisor", 200],
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:180:        [`/v7-evidence/accepted?inspectionClientUuid=${client}`, "supervisor", 200],
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:181:        [`/master-system-inspections?jobId=${job}`, "supervisor", 200],
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:182:        [`/inspections/${client}/corrections`, "supervisor", 200],
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:209:      const reportResponse = await call(`/manager/service-visits/${job}/final-report`, "supervisor");
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:221:      assert.equal((await post("supervisor", { requestId: id(), reason: "Wording fix after closure", changes: [{ fieldPath: "comments", expectedCurrentValue: "", newValue: "Checked with site lead" }] })).status, 201);
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:222:      const afterLateCorrection = (await (await call(`/manager/service-visits/${job}/final-report`, "supervisor")).json()) as typeof correctedReport;
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.integration.test.ts:223:      assert.equal(afterLateCorrection.report.sections[0]?.review.status, "pending", "later correction requires another supervisor review");
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.ts:13:/** T5a: supervisor/admin corrections to Accepted V7 inspections (docs/autopilot/designs/T5.md §3.3). */
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.ts:66:  correctedBy: string; correctedByRole: "admin" | "supervisor"; correctedAt: string; requestId: string; requestFingerprint: string;
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.ts:126:  router.get("/manager/inspections/:clientUuid/corrections", requireRole("admin", "supervisor"), async (request, response, next) => {
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.ts:149:  /** Explicit supervisor approval of the current accepted+corrected revision. */
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.ts:150:  router.post("/manager/inspections/:clientUuid/review", requireRole("supervisor"), async (request, response, next) => {
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.ts:194:  router.post("/manager/inspections/:clientUuid/corrections", requireRole("admin", "supervisor"), async (request, response, next) => {
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.ts:263:  router.get("/manager/service-visits/:jobId/accepted-records", requireRole("admin", "supervisor"), async (request, response, next) => {
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.ts:307:  router.get("/manager/service-visits/:jobId/corrections", requireRole("admin", "supervisor"), async (request, response, next) => {
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.ts:334:   * synced it (own records only), an admin, or a supervisor (T5 §9 Q4 — read-only for technicians).
  => internal identifier - intentionally kept
apps/api/src/routes/managerCorrections.ts:336:  router.get("/inspections/:clientUuid/corrections", requireRole("admin", "inspector", "supervisor"),
  => internal identifier - intentionally kept
apps/api/src/routes/managerCustomers.ts:504:/** The read-only customer view a supervisor receives from the customer list (T4). */
  => internal identifier - intentionally kept
apps/api/src/routes/managerCustomers.ts:505:export function supervisorCustomerSummary(value: NonNullable<Awaited<ReturnType<typeof loadManagerCustomer>>>) {
  => internal identifier - intentionally kept
apps/api/src/routes/managerCustomers.ts:714:  // Every Manager route decision goes through the audited guard (supervisor refusals are logged).
  => internal identifier - intentionally kept
apps/api/src/routes/managerCustomers.ts:752:  router.get("/manager/customers", requireRole("admin", "supervisor"), async (request, response, next) => {
  => internal identifier - intentionally kept
apps/api/src/routes/managerCustomers.ts:756:      // A supervisor may search customers for Services Done only: identity, sites and the system
  => internal identifier - intentionally kept
apps/api/src/routes/managerCustomers.ts:758:      response.json({ customers: request.currentUser?.role === "supervisor" ? customers.flatMap((customer) => customer ? [supervisorCustomerSummary(customer)] : []) : customers });
  => internal identifier - intentionally kept
apps/api/src/routes/managerDashboard.test.ts:17:    if (role === "admin" || role === "supervisor" || role === "inspector") request.currentUser = { id: 1, username: String(role), role };
  => internal identifier - intentionally kept
apps/api/src/routes/managerDashboard.test.ts:27:    assert.equal((await get("/manager/dashboard/clients", "supervisor")).status, 200);
  => internal identifier - intentionally kept
apps/api/src/routes/managerDashboard.test.ts:34:    assert.equal((await get("/manager/dashboard/inspections-per-day?from=2026-09-01&to=2026-09-30", "supervisor")).status, 200);
  => internal identifier - intentionally kept
apps/api/src/routes/managerDashboard.test.ts:43:    assert.deepEqual(await (await get("/manager/dashboard/inspection-status?from=2026-09-01&to=2026-09-30", "supervisor")).json(), { passed: 0, notOk: 0, na: 0 });
  => internal identifier - intentionally kept
apps/api/src/routes/managerDashboard.ts:37:  const requireManager = requireRoleAudited(database, "admin", "supervisor");
  => internal identifier - intentionally kept
apps/api/src/routes/managerReminders.ts:76:      const updated = await client.query("UPDATE users SET reminder_email=$2,updated_at=now() WHERE id=$1 AND role IN ('inspector','supervisor') AND hidden_at IS NULL RETURNING id", [id, email]);
  => internal identifier - intentionally kept
apps/api/src/routes/managerReminders.ts:86:      const staff = await database.query(`SELECT id::int AS id,username,display_name AS "displayName",role,is_active AS "isActive",reminder_email AS email FROM users WHERE role IN ('inspector','supervisor') AND hidden_at IS NULL ORDER BY username`);
  => internal identifier - intentionally kept
apps/api/src/routes/managerReminders.ts:99:        WHERE recipient.plan_id=$1 AND (recipient.staff_user_id IS NULL OR (staff.is_active=true AND staff.role IN ('inspector','supervisor'))) AND COALESCE(staff.reminder_email,recipient.extra_email) IS NOT NULL
  => internal identifier - intentionally kept
apps/api/src/routes/managerReminders.ts:121:      const staff = await client.query<{ id: number; reminder_email: string | null }>("SELECT id::int AS id,reminder_email FROM users WHERE id=ANY($1::bigint[]) AND role IN ('inspector','supervisor') AND is_active=true", [staffIds]);
  => internal identifier - intentionally kept
apps/api/src/routes/managerReminders.ts:198:        WHERE recipient.plan_id=plan.id AND (recipient.extra_email IS NOT NULL OR (staff.is_active=true AND staff.role IN ('inspector','supervisor') AND staff.reminder_email IS NOT NULL))
  => internal identifier - intentionally kept
apps/api/src/routes/managerServiceVisits.test.ts:53:      return { rows: approvalsPresent && (id === closedId || id === openId) ? [{ id: "approval-1", decision: "approved", note: null, decidedBy: "approver", decidedByRole: "supervisor", decidedAt: "2026-08-21T00:00:00.000Z", sequence: 1, requestId: "request-1", requestFingerprint: "fingerprint-1" }] : [] };
  => internal identifier - intentionally kept
apps/api/src/routes/managerServiceVisits.test.ts:291:  const scoped = buildOperationalListQuery({ technicianId: 17, supervisorId: 29, limit: 1 });
  => internal identifier - intentionally kept
apps/api/src/routes/managerServiceVisits.test.ts:294:  assert.match(scoped.sql, /assignment\.supervisor_id = \$2::bigint/);
  => internal identifier - intentionally kept
apps/api/src/routes/managerServiceVisits.test.ts:296:  assert.ok(!scoped.sql.includes("29"), "supervisor authority must be bound, never interpolated");
  => internal identifier - intentionally kept
apps/api/src/routes/managerServiceVisits.ts:212:  supervisorId?: number;
  => internal identifier - intentionally kept
apps/api/src/routes/managerServiceVisits.ts:382:  if (filters.supervisorId !== undefined) {
  => internal identifier - intentionally kept
apps/api/src/routes/managerServiceVisits.ts:383:    values.push(filters.supervisorId);
  => internal identifier - intentionally kept
apps/api/src/routes/managerServiceVisits.ts:385:      SELECT 1 FROM technician_supervisor_assignments assignment
  => internal identifier - intentionally kept
apps/api/src/routes/managerServiceVisits.ts:387:        AND assignment.supervisor_id = $${values.length}::bigint
  => internal identifier - intentionally kept
apps/api/src/routes/managerServiceVisits.ts:473:async function supervisorCanReadVisit(database: Pick<typeof pool, "query">, jobId: string, supervisorId: number) {
  => internal identifier - intentionally kept
apps/api/src/routes/managerServiceVisits.ts:476:     JOIN technician_supervisor_assignments assignment ON assignment.technician_id=job.created_by_user_id
  => internal identifier - intentionally kept
apps/api/src/routes/managerServiceVisits.ts:477:     WHERE job.id=$1 AND assignment.supervisor_id=$2 AND assignment.archived_at IS NULL`,
  => internal identifier - intentionally kept
apps/api/src/routes/managerServiceVisits.ts:478:    [jobId, supervisorId]
  => internal identifier - intentionally kept
apps/api/src/routes/managerServiceVisits.ts:494:      if (request.currentUser!.role === "supervisor" && !await supervisorCanReadVisit(database, jobId, request.currentUser!.id)) {
  => internal identifier - intentionally kept
apps/api/src/routes/managerServiceVisits.ts:515:  // Every Manager route decision goes through the audited guard (supervisor refusals are logged).
  => internal identifier - intentionally kept
apps/api/src/routes/managerServiceVisits.ts:518:  router.get("/manager/service-visits", requireRole("admin", "supervisor"), async (request, response, next) => {
  => internal identifier - intentionally kept
apps/api/src/routes/managerServiceVisits.ts:532:      request.currentUser!.role === "supervisor" ? { ...filters, supervisorId: request.currentUser!.id } : filters);
  => internal identifier - intentionally kept
apps/api/src/routes/managerServiceVisits.ts:543:  requireRole("admin", "supervisor"),
  => internal identifier - intentionally kept
apps/api/src/routes/managerServiceVisits.ts:549:  requireRole("admin", "supervisor"),
  => internal identifier - intentionally kept
apps/api/src/routes/managerServiceVisits.ts:653:  router.get("/manager/service-visits/:jobId", requireRole("admin", "supervisor"), async (request, response, next) => {
  => internal identifier - intentionally kept
apps/api/src/routes/managerServiceVisits.ts:660:    if (request.currentUser!.role === "supervisor" && !await supervisorCanReadVisit(database, jobId, request.currentUser!.id)) {
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.integration.test.ts:39:        [{ supervisorId: "20" }, 400, { error: "INVALID_SUPERVISOR_ID", message: "Admin ID must be a positive numeric ID." }],
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.integration.test.ts:40:        [{ supervisorId: 999999 }, 404, { error: "SUPERVISOR_NOT_FOUND", message: "Admin was not found." }],
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.integration.test.ts:41:        [{ supervisorId: Number(admin.id) }, 400, { error: "INVALID_ROLE", message: "Assignment requires a technician and an Admin." }]
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.integration.test.ts:108:      // --- Admin sets a new password for a technician/supervisor (POST /manager/technicians/:id/password) ---
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.integration.test.ts:113:      const pwTech = await addUser("pw-tech", "inspector"); const pwSup = await addUser("pw-sup", "supervisor"); const pwInactive = await addUser("pw-inactive", "inspector", false);
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.integration.test.ts:114:      const pwHidden = await addUser("pw-hidden", "inspector", true, true); const pwBystander = await addUser("pw-bystander", "inspector"); await addUser("pw-caller-sup", "supervisor");
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.integration.test.ts:121:      // Authorization: unauthenticated 401; technician and supervisor callers 403.
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.integration.test.ts:151:      // Supervisor reset.
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.integration.test.ts:164:      assert.equal(resets.length - resetsBefore, 5); // two boundary resets (bystander), technician, supervisor, inactive account
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.integration.test.ts:166:        [["user", String(pwTech), "role=inspector", String(admin.id), "success"], ["user", String(pwSup), "role=supervisor", String(admin.id), "success"], ["user", String(pwInactive), "role=inspector", String(admin.id), "success"]]);
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.test.ts:9:  app.use((request, _response, next) => { const role = request.headers["x-role"]; if (role === "admin" || role === "inspector" || role === "supervisor") request.currentUser = { id: 1, username: role, role }; next(); });
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.test.ts:41:    for (const role of ["", "inspector", "supervisor"]) {
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.test.ts:42:      assert.equal((await request("/manager/technicians/2/assignments", "POST", { supervisorId: 3 }, role)).status, role ? 403 : 401);
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.test.ts:46:      assert.equal((await request(path, "POST", { supervisorId: 3 })).status, 400);
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.test.ts:48:    for (const body of [{}, { supervisorId: 0 }, { supervisorId: "3" }, { supervisorId: 3, role: "supervisor" }]) {
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.test.ts:61:    if (sql.includes("SELECT id, role FROM users")) return { rows: [{ id: "2", role: "inspector" }, { id: "3", role: "supervisor" }] };
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.test.ts:62:    if (sql.includes("INSERT INTO technician_supervisor_assignments")) return { rows: [{ id: "7" }] };
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.test.ts:67:    assert.equal((await request("/manager/technicians/2/assignments", "POST", { supervisorId: 3 })).status, 500);
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.test.ts:94:  // The audited guard records supervisor refusals through query(); no write transaction (connect) may ever open.
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.test.ts:96:    for (const role of ["", "inspector", "supervisor"]) assert.equal((await request("/manager/technicians/2/password", "POST", { password: "valid-password-1" }, role)).status, role ? 403 : 401);
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.test.ts:112:    assert.ok(queries.some((sql) => /role IN \('inspector','supervisor'\) AND hidden_at IS NULL/.test(sql)));
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:13:const assignedSupervisorColumns = `ARRAY(
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:14:  SELECT assignment.supervisor_id::int
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:15:  FROM technician_supervisor_assignments assignment
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:17:  ORDER BY assignment.supervisor_id
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:18:) AS "supervisorIds"`;
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:19:/** Field accounts this screen manages: technicians and (T4) supervisors. Admins are never listed or changed here. */
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:20:const managedRoles = ["inspector", "supervisor"] as const;
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:48:  // Every Manager route decision goes through the audited guard (supervisor refusals are logged).
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:50:  router.get("/manager/technicians", requireRole("admin", "supervisor"), async (request, response, next) => {
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:52:      const supervisor = request.currentUser!.role === "supervisor";
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:54:        `SELECT ${technicianColumns}, ${assignedSupervisorColumns} FROM users
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:55:         WHERE ${supervisor
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:56:    ? "role='inspector' AND EXISTS (SELECT 1 FROM technician_supervisor_assignments assignment WHERE assignment.technician_id=users.id AND assignment.supervisor_id=$1 AND assignment.archived_at IS NULL)"
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:57:    : "role IN ('inspector','supervisor')"} AND hidden_at IS NULL
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:59:        supervisor ? [request.currentUser!.id] : []
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:71:      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, "supervisorId")) {
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:74:      if (typeof (body as Record<string, unknown>).supervisorId !== "number") {
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:75:        throw new ManagerTechnicianError("INVALID_SUPERVISOR_ID", "Admin ID must be a positive numeric ID.");
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:77:      const supervisorId = numericUserId((body as Record<string, unknown>).supervisorId, "INVALID_SUPERVISOR_ID");
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:80:      const users = await client.query<{ id: string; role: UserRole }>("SELECT id, role FROM users WHERE id = ANY($1::bigint[]) AND hidden_at IS NULL ORDER BY id FOR UPDATE", [[technicianId, supervisorId]]);
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:83:      if (!roles.has(supervisorId)) throw new ManagerTechnicianError("SUPERVISOR_NOT_FOUND", "Admin was not found.", 404);
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:84:      if (roles.get(technicianId) !== "inspector" || roles.get(supervisorId) !== "supervisor") {
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:88:        `INSERT INTO technician_supervisor_assignments AS assignment (technician_id, supervisor_id, created_by_user_id)
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:90:         ON CONFLICT (technician_id, supervisor_id) DO UPDATE SET archived_at=NULL
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:92:        [technicianId, supervisorId, request.currentUser!.id]
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:94:      if (assigned.rows[0]) await audit(client, request.currentUser!.id, "technician_assignment_created", "user", String(technicianId), `supervisorId=${supervisorId}`);
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:97:      response.status(assigned.rows[0] ? 201 : 200).json({ technicianId, supervisorId, assigned: true });
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:102:  router.delete("/manager/technicians/:technicianId/assignments/:supervisorId", requireRole("admin"), async (request, response, next) => {
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:106:      const supervisorId = numericUserId(request.params.supervisorId, "INVALID_SUPERVISOR_ID");
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:113:        "UPDATE technician_supervisor_assignments SET archived_at=now() WHERE technician_id=$1 AND supervisor_id=$2 AND archived_at IS NULL RETURNING id",
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:114:        [technicianId, supervisorId]
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:116:      if (removed.rows[0]) await audit(client, request.currentUser!.id, "technician_assignment_removed", "user", String(technicianId), `supervisorId=${supervisorId}`);
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:119:      response.json({ technicianId, supervisorId, assigned: false });
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:173:      const result = await client.query(`UPDATE users SET display_name=$2, updated_at=now() WHERE id=$1 AND role IN ('inspector','supervisor') AND hidden_at IS NULL RETURNING ${technicianColumns}`, [id, name]);
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:194:      const result = await client.query(`UPDATE users SET is_active=false, updated_at=now() WHERE id=$1 AND role IN ('inspector','supervisor') AND hidden_at IS NULL RETURNING ${technicianColumns}`, [id]);
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:204:  // Admin sets a new password for a technician/supervisor. Admin accounts are recovered offline (see cli/resetAdminPassword.ts).
  => internal identifier - intentionally kept
apps/api/src/routes/managerTechnicians.ts:222:        "UPDATE users SET password_hash=$2, updated_at=now() WHERE id=$1 AND role IN ('inspector','supervisor') AND hidden_at IS NULL RETURNING role", [id, passwordHash]
  => internal identifier - intentionally kept
apps/api/src/routes/masterSystemInspections.ts:77:      AND ($3::text IN ('admin','supervisor') OR instance.snapshot_schema_version<>2 OR instance.synced_by_user_id=$4)`,
  => internal identifier - intentionally kept
apps/api/src/routes/masterSystemInspections.ts:127:masterSystemInspectionsRouter.get("/hose-reel-inspections/:clientUuid", requireRole("admin", "inspector", "supervisor"),
  => internal identifier - intentionally kept
apps/api/src/routes/masterSystemInspections.ts:145:masterSystemInspectionsRouter.get("/co2-inspections/:clientUuid", requireRole("admin", "inspector", "supervisor"),
  => internal identifier - intentionally kept
apps/api/src/routes/masterSystemInspections.ts:158:// supervisor read-widening (requireReviewerOrOwnership) was designed for the other 8 V7
  => internal identifier - intentionally kept
apps/api/src/routes/masterSystemInspections.ts:161:// grants supervisor reads.
  => internal identifier - intentionally kept
apps/api/src/routes/masterSystemInspections.ts:162:masterSystemInspectionsRouter.get("/fm200-inspections/:clientUuid", requireRole("admin", "inspector", "supervisor"),
  => internal identifier - intentionally kept
apps/api/src/routes/masterSystemInspections.ts:174:masterSystemInspectionsRouter.get("/wet-chemical-inspections/:clientUuid", requireRole("admin", "inspector", "supervisor"),
  => internal identifier - intentionally kept
apps/api/src/routes/masterSystemInspections.ts:188:  requireRole("admin", "inspector", "supervisor"),
  => internal identifier - intentionally kept
apps/api/src/routes/masterSystemInspections.ts:194:      const result=await pool.query(`SELECT instance.client_uuid AS "clientUuid",instance.id AS "serverFormInstanceId",instance.inspection_group_id AS "inspectionGroupId",inspection.id AS "parentId",job.id AS "jobId",job.job_reference AS "jobReference",job.title AS "jobTitle",customer.id AS "customerId",customer.customer_code AS "customerCode",customer.display_name AS "customerName",inspection.system_key AS "systemKey",instance.instance_key AS "instanceKey",instance.zone_id AS "zoneId",instance.location_id AS "locationId",instance.display_sequence AS "displaySequence",instance.status,to_char(instance.performed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "performedAt",to_char(instance.received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "receivedAt",instance.master_template_version_id AS "templateId",instance.customer_configuration_revision_id AS "configurationRevisionId",instance.snapshot_schema_version AS "snapshotSchemaVersion",instance.response_schema_version AS "responseSchemaVersion",instance.inspection_snapshot AS "inspectionSnapshot",instance.response_payload AS responses,instance.original_creator_snapshot AS "originalCreatorSnapshot",instance.original_creator_snapshot->>'username' AS "deviceReportedCreatorUsername",creator.username AS "verifiedOriginalCreatorUsername",syncer.username AS "syncedByUsername" FROM master_system_form_instances instance INNER JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id INNER JOIN inspection_jobs job ON job.id=inspection.job_id INNER JOIN customers customer ON customer.id=job.customer_id LEFT JOIN users creator ON creator.id=instance.original_created_by_user_id INNER JOIN users syncer ON syncer.id=instance.synced_by_user_id WHERE instance.client_uuid=$1 AND instance.status='submitted' AND inspection.system_key='fire_alarm_detector' AND ($2::text IN ('admin','supervisor') OR instance.snapshot_schema_version<>2 OR instance.synced_by_user_id=$3)`,[clientUuid,request.currentUser!.role,request.currentUser!.id]);
  => internal identifier - intentionally kept
apps/api/src/routes/masterSystemInspections.ts:206:  requireRole("admin", "inspector", "supervisor"),
  => internal identifier - intentionally kept
apps/api/src/routes/masterSystemInspections.ts:286:  // A supervisor reviews every job's accepted records; the inspector filter below keeps technicians to theirs.
  => internal identifier - intentionally kept
apps/api/src/routes/masterSystemInspections.ts:287:  requireRole("admin", "inspector", "supervisor"),
  => internal identifier - intentionally kept
apps/api/src/routes/masterSystemInspections.ts:315:      // A supervisor reviews any job (read-only); technicians stay scoped to jobs they own.
  => internal identifier - intentionally kept
apps/api/src/routes/masterSystemInspections.ts:316:      if (jobId && request.currentUser!.role !== "supervisor" && !await technicianOwns(request, "job", jobId)) {
  => internal identifier - intentionally kept
apps/api/src/routes/masterSystemInspections.ts:499:  requireRole("admin", "inspector", "supervisor"),
  => internal identifier - intentionally kept
apps/api/src/routes/reportApprovals.integration.test.ts:45:    const inspector = await user("ra-tech", "inspector"), supervisor = await user("ra-review", "supervisor"), admin = await user("ra-admin", "admin");
  => internal identifier - intentionally kept
apps/api/src/routes/reportApprovals.integration.test.ts:49:    const actors: Record<string, { id: number; username: string; role: "admin" | "inspector" | "supervisor" }> = {
  => internal identifier - intentionally kept
apps/api/src/routes/reportApprovals.integration.test.ts:50:      supervisor: { id: supervisor, username: "ra-review", role: "supervisor" }, admin: { id: admin, username: "ra-admin", role: "admin" },
  => internal identifier - intentionally kept
apps/api/src/routes/reportApprovals.integration.test.ts:64:      assert.equal((await post("supervisor", { requestId: id(), decision: "approved", expectedStatus: "awaiting_approval" })).status, 409);
  => internal identifier - intentionally kept
apps/api/src/routes/reportApprovals.integration.test.ts:65:      const openRefusal = await post("supervisor", { requestId: id(), decision: "approved", expectedStatus: "awaiting_approval" });
  => internal identifier - intentionally kept
apps/api/src/routes/reportApprovals.integration.test.ts:73:      const initial = await (await get("supervisor")).json() as { reportApproval: { status: string }; events: unknown[] };
  => internal identifier - intentionally kept
apps/api/src/routes/reportApprovals.integration.test.ts:87:      // Supervisor approves.
  => internal identifier - intentionally kept
apps/api/src/routes/reportApprovals.integration.test.ts:89:      const approved = await post("supervisor", { requestId: approveRequestId, decision: "approved", expectedStatus: "awaiting_approval" });
  => internal identifier - intentionally kept
apps/api/src/routes/reportApprovals.integration.test.ts:94:      assert.equal(approvedBody.reportApproval.decidedByRole, "supervisor");
  => internal identifier - intentionally kept
apps/api/src/routes/reportApprovals.integration.test.ts:98:      const replay = await post("supervisor", { requestId: approveRequestId, decision: "approved", expectedStatus: "awaiting_approval" });
  => internal identifier - intentionally kept
apps/api/src/routes/reportApprovals.integration.test.ts:102:      const reused = await post("supervisor", { requestId: approveRequestId, decision: "approved", expectedStatus: "approved" });
  => internal identifier - intentionally kept
apps/api/src/routes/reportApprovals.integration.test.ts:124:      // A supervisor may never withdraw.
  => internal identifier - intentionally kept
apps/api/src/routes/reportApprovals.integration.test.ts:125:      const supervisorWithdraw = await post("supervisor", { requestId: id(), decision: "withdrawn", note: "Trying to withdraw", expectedStatus: "approved" });
  => internal identifier - intentionally kept
apps/api/src/routes/reportApprovals.integration.test.ts:126:      assert.equal(supervisorWithdraw.status, 403);
  => internal identifier - intentionally kept
apps/api/src/routes/reportApprovals.integration.test.ts:127:      assert.equal((await supervisorWithdraw.json() as { error: string }).error, "REPORT_APPROVAL_WITHDRAW_FORBIDDEN");
  => internal identifier - intentionally kept
apps/api/src/routes/reportApprovals.integration.test.ts:146:      const reapproved = await post("supervisor", { requestId: id(), decision: "approved", expectedStatus: "awaiting_approval" });
  => internal identifier - intentionally kept
apps/api/src/routes/reportApprovals.integration.test.ts:157:        VALUES ($1,$2,$3,'wet_chemical','controlPanelLocation',1,'"Kitchen A"'::jsonb,'"Kitchen B"'::jsonb,'Site walkthrough correction',$4,'supervisor',$5,$6)`,
  => internal identifier - intentionally kept
apps/api/src/routes/reportApprovals.integration.test.ts:158:      [id(), formInstance.id, job, supervisor, id(), "x".repeat(64)]);
  => internal identifier - intentionally kept
apps/api/src/routes/reportApprovals.integration.test.ts:167:      const staleAfterCorrection = await post("supervisor", { requestId: id(), decision: "approved", expectedStatus: "approved" });
  => internal identifier - intentionally kept
apps/api/src/routes/reportApprovals.ts:69:  router.get("/manager/service-visits/:jobId/report-approval", requireRole("admin", "supervisor"), async (request, response, next) => {
  => internal identifier - intentionally kept
apps/api/src/routes/reportApprovals.ts:84:  router.post("/manager/service-visits/:jobId/report-approval", requireRole("admin", "supervisor"), async (request, response, next) => {
  => internal identifier - intentionally kept
apps/api/src/routes/stagedEvidence.ts:44:stagedEvidenceRouter.get("/v6-evidence/accepted", requireRole("admin", "inspector", "supervisor"),
  => internal identifier - intentionally kept
apps/api/src/routes/stagedEvidence.ts:55:        AND ($2::text IN ('admin','supervisor') OR job.technician_visible=true)
  => internal identifier - intentionally kept
apps/api/src/routes/stagedEvidence.ts:61:stagedEvidenceRouter.get("/v6-evidence/accepted/:photoUuid/content", requireRole("admin", "inspector", "supervisor"),
  => internal identifier - intentionally kept
apps/api/src/routes/stagedEvidence.ts:72:        AND ($2::text IN ('admin','supervisor') OR job.technician_visible=true)`, [photoUuid, request.currentUser!.role]);
  => internal identifier - intentionally kept
apps/api/src/routes/stagedEvidence.ts:88:stagedEvidenceRouter.get("/v7-evidence/accepted", requireRole("admin", "inspector", "supervisor"),
  => internal identifier - intentionally kept
apps/api/src/routes/stagedEvidence.ts:99:        AND ($2::text IN ('admin','supervisor') OR (job.technician_visible=true AND form.synced_by_user_id=$3))
  => internal identifier - intentionally kept
apps/api/src/routes/stagedEvidence.ts:105:stagedEvidenceRouter.get("/v7-evidence/accepted/:photoUuid/content", requireRole("admin", "inspector", "supervisor"),
  => internal identifier - intentionally kept
apps/api/src/routes/stagedEvidence.ts:115:        AND ($2::text IN ('admin','supervisor') OR (job.technician_visible=true AND form.synced_by_user_id=$3))`, [photoUuid, request.currentUser!.role, request.currentUser!.id]);
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:27: * T4 supervisor role (docs/autopilot/designs/T4.md). Every route of every role-guarded router is
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:29: * a supervisor may call exactly the review reads below and receives 403 everywhere else (a Manager
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:32:const supervisorReads = new Set([
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:39:  // T5a: corrections are review work, so a supervisor may read and write these.
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:45:  // T6: report approval is review/sign-off work, so a supervisor may read and write it.
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:68:const params: Record<string, string> = { jobId: unknownJob, customerId: unknownJob, clientUuid: unknownJob, photoUuid: unknownJob, id: unknownJob, technicianId: "2147480000", supervisorId: "2147480000", systemKey: "hose_reel" };
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:75:test("supervisor role: migration 031, account lifecycle, customer summary and a closed route matrix", { skip: !process.env.SEED_INTEGRATION_DATABASE_URL }, async () => {
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:83:    assert.match(roleCheck!, /'admin'.*'inspector'.*'supervisor'/);
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:108:      // Admin creates a supervisor from the technician form; the role never defaults to anything but inspector.
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:109:      const created = await request("/manager/technicians", "POST", { username: "review-lead", password: "supervisor-test-password", role: "supervisor" }, admin);
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:111:      const { technician: supervisorRow } = await created.json() as { technician: { id: number; role: string; isActive: boolean } };
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:112:      assert.equal(supervisorRow.role, "supervisor"); assert.equal(supervisorRow.isActive, true);
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:117:      assert.deepEqual((await pool.query("SELECT reason FROM audit_events WHERE action='manager_technician_created' ORDER BY id")).rows.map((row) => row.reason), ["role=supervisor", "role=inspector"]);
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:119:      assert.deepEqual(listed.technicians.map((row) => [row.username, row.role]), [["field-tech", "inspector"], ["review-lead", "supervisor"]]);
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:121:      const customer = await request("/manager/customers", "POST", { displayName: "Supervisor Matrix", siteDisplayName: "Primary", systemKeys: ["hose_reel"], contactPhone: "0123", contactPerson: "Site Lead" }, admin);
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:124:      const supervisor = await loginAs("review-lead", "supervisor-test-password");
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:125:      const me = await (await request("/auth/me", "GET", undefined, supervisor)).json() as { user: { role: string } };
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:126:      assert.equal(me.user.role, "supervisor");
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:128:      // The customer list is a summary for a supervisor: identity, sites, system catalogue only.
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:129:      const summary = await (await request("/manager/customers", "GET", undefined, supervisor)).json() as { customers: Array<Record<string, unknown>> };
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:132:      assert.ok(summary.customers.some((row) => (row.customer as { displayName: string }).displayName === "Supervisor Matrix"));
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:142:      for (const key of supervisorReads) assert.ok(all.some((route) => `${route.method} ${route.path}` === key), `allowed route exists: ${key}`);
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:148:        const response = await request(path, route.method, route.method === "GET" ? undefined : {}, supervisor);
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:149:        if (supervisorReads.has(key)) {
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:150:          assert.ok(response.status !== 401 && response.status !== 403, `${key} is open to a supervisor (got ${response.status})`);
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:152:          assert.equal(response.status, 403, `${key} must refuse a supervisor`);
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:158:      assert.ok(denials.every((row) => row.actor === supervisorRow.id && row.result === "failure"));
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:160:      // An admin-created visit has no assigned technician and is outside the supervisor's scope.
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:167:        const asSupervisor = await request(path, "GET", undefined, supervisor);
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:169:        assert.equal(asSupervisor.status, 404, `${path}: unassigned visit is hidden`);
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:171:      // A refused supervisor write changed nothing.
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:174:      // Admin deactivates the supervisor; the session stops working.
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:175:      assert.equal((await request(`/manager/technicians/${supervisorRow.id}/deactivate`, "POST", undefined, admin)).status, 200);
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:176:      assert.equal((await request("/auth/me", "GET", undefined, supervisor)).status, 401);
  => internal identifier - intentionally kept
apps/api/src/routes/supervisorRole.integration.test.ts:177:      assert.equal((await pool.query("SELECT reason FROM audit_events WHERE action='manager_technician_deactivated'")).rows[0].reason, "role=supervisor");
  => internal identifier - intentionally kept
apps/api/src/routes/technicianSupervisorAssignments.integration.test.ts:16:test("admin assignments are audited and reversible; supervisor visit and technician lists stay scoped", { skip: !databaseUrl }, async () => {
  => internal identifier - intentionally kept
apps/api/src/routes/technicianSupervisorAssignments.integration.test.ts:31:    const supervisorA = await user("assignment-supervisor-a", "supervisor");
  => internal identifier - intentionally kept
apps/api/src/routes/technicianSupervisorAssignments.integration.test.ts:32:    const supervisorB = await user("assignment-supervisor-b", "supervisor");
  => internal identifier - intentionally kept
apps/api/src/routes/technicianSupervisorAssignments.integration.test.ts:54:    type TechnicianList = { technicians: Array<{ id: number; role: UserRole; supervisorIds: number[] }> };
  => internal identifier - intentionally kept
apps/api/src/routes/technicianSupervisorAssignments.integration.test.ts:89:      as(undefined, admin); assert.equal((await request(path, "POST", { supervisorId: supervisorA })).status, 401);
  => internal identifier - intentionally kept
apps/api/src/routes/technicianSupervisorAssignments.integration.test.ts:90:      as("inspector", technicianA); assert.equal((await request(path, "POST", { supervisorId: supervisorA })).status, 403);
  => internal identifier - intentionally kept
apps/api/src/routes/technicianSupervisorAssignments.integration.test.ts:91:      as("supervisor", supervisorA); assert.equal((await request(path, "POST", { supervisorId: supervisorA })).status, 403);
  => internal identifier - intentionally kept
apps/api/src/routes/technicianSupervisorAssignments.integration.test.ts:93:      for (const body of [{}, { supervisorId: "x" }, { supervisorId: String(supervisorA) }, { supervisorId: supervisorA, role: "admin" }]) {
  => internal identifier - intentionally kept
apps/api/src/routes/technicianSupervisorAssignments.integration.test.ts:96:      assert.deepEqual(await (await request(path, "POST", { supervisorId: admin })).json(), { error: "INVALID_ROLE" });
  => internal identifier - intentionally kept
apps/api/src/routes/technicianSupervisorAssignments.integration.test.ts:97:      assert.deepEqual(await (await request(`/manager/technicians/${supervisorA}/assignments`, "POST", { supervisorId: supervisorB })).json(), { error: "INVALID_ROLE" });
  => internal identifier - intentionally kept
apps/api/src/routes/technicianSupervisorAssignments.integration.test.ts:98:      assert.equal((await request(path, "POST", { supervisorId: supervisorA })).status, 201);
  => internal identifier - intentionally kept
apps/api/src/routes/technicianSupervisorAssignments.integration.test.ts:99:      assert.equal((await request(path, "POST", { supervisorId: supervisorA })).status, 200, "retry is idempotent");
  => internal identifier - intentionally kept
apps/api/src/routes/technicianSupervisorAssignments.integration.test.ts:100:      assert.equal((await request(path, "POST", { supervisorId: supervisorB })).status, 201, "many-to-many");
  => internal identifier - intentionally kept
apps/api/src/routes/technicianSupervisorAssignments.integration.test.ts:101:      assert.deepEqual((await technicians()).technicians.find((row) => row.id === technicianA)?.supervisorIds, [supervisorA, supervisorB]);
  => internal identifier - intentionally kept
apps/api/src/routes/technicianSupervisorAssignments.integration.test.ts:103:      assert.equal((await pool.query("SELECT count(*)::int AS n FROM technician_supervisor_assignments WHERE technician_id=$1", [technicianA])).rows[0].n, 2);
  => internal identifier - intentionally kept
apps/api/src/routes/technicianSupervisorAssignments.integration.test.ts:106:      as("supervisor", supervisorA);
  => internal identifier - intentionally kept
apps/api/src/routes/technicianSupervisorAssignments.integration.test.ts:121:      const removal = `${path}/${supervisorA}`;
  => internal identifier - intentionally kept
apps/api/src/routes/technicianSupervisorAssignments.integration.test.ts:124:      assert.equal((await pool.query("SELECT archived_at IS NOT NULL AS archived FROM technician_supervisor_assignments WHERE technician_id=$1 AND supervisor_id=$2", [technicianA, supervisorA])).rows[0].archived, true);
  => internal identifier - intentionally kept
apps/api/src/routes/technicianSupervisorAssignments.integration.test.ts:126:      as("supervisor", supervisorA);
  => internal identifier - intentionally kept
apps/api/src/routes/technicianSupervisorAssignments.integration.test.ts:130:      assert.equal((await request(path, "POST", { supervisorId: supervisorA })).status, 201, "assigning again restores the same row");
  => internal identifier - intentionally kept
apps/api/src/routes/technicianSupervisorAssignments.integration.test.ts:131:      assert.equal((await pool.query("SELECT count(*)::int AS n FROM technician_supervisor_assignments WHERE technician_id=$1 AND supervisor_id=$2", [technicianA, supervisorA])).rows[0].n, 1);
  => internal identifier - intentionally kept
apps/api/src/sync/fm200V7.integration.test.ts:54:    const supervisorActor = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x','supervisor') RETURNING id", [`fm200-supervisor-${id()}`])).rows[0]!.id;
  => internal identifier - intentionally kept
apps/api/src/sync/fm200V7.integration.test.ts:60:    const app = express(); app.use(express.json()); app.use((request, _response, next) => { const requested = request.header("x-test-actor"); if (requested !== "none") { const userId = requested === "admin" ? adminActor : requested === "supervisor" ? supervisorActor : requested === "foreign" ? foreignActor : actor; request.currentUser = { id: userId, username: "fm200", role: requested === "admin" ? "admin" : requested === "supervisor" ? "supervisor" : "inspector" }; } next(); }); app.use(stagedEvidenceRouter); app.use(masterSystemInspectionsRouter); app.use(syncRouter);
  => internal identifier - intentionally kept
apps/api/src/sync/fm200V7.integration.test.ts:94:      // T5c-equivalent (owner decision, merge review): a supervisor reviews any accepted
  => internal identifier - intentionally kept
apps/api/src/sync/fm200V7.integration.test.ts:98:      const supervisorDetail = await fetch(`${origin}/fm200-inspections/${clientUuid}`, { headers: { "x-test-actor": "supervisor" } });
  => internal identifier - intentionally kept
apps/api/src/sync/fm200V7.integration.test.ts:99:      assert.equal(supervisorDetail.status, 200, "supervisor reads accepted FM200 V7 detail for a job they do not own");
  => internal identifier - intentionally kept
apps/api/src/sync/fm200V7.integration.test.ts:100:      const supervisorDetailBody = await supervisorDetail.json() as { inspection?: { systemLabel?: string } };
  => internal identifier - intentionally kept
apps/api/src/sync/fm200V7.integration.test.ts:101:      assert.equal(supervisorDetailBody.inspection?.systemLabel, "FM200 System");
  => internal identifier - intentionally kept
```
