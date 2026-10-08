import type { InspectionJob } from "./jobTypes";
import { formatMalaysiaDateTime, jobStatusLabel } from "../uiPresentation";

export function completedServiceJobs(jobs: InspectionJob[]) {
  return jobs.filter((job) => job.status === "closed")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export function ServiceJobCard({ job, progress, canViewReport, offlineReady, onSelectJob, onViewFinalReport }: {
  job: InspectionJob;
  progress: { complete: number; total: number };
  canViewReport: boolean;
  /** I-02: true when the server confirmed this job recently enough to start its systems offline; undefined hides the line. */
  offlineReady?: boolean;
  onSelectJob: (job: InspectionJob) => void;
  onViewFinalReport: (job: InspectionJob) => void;
}) {
  return <li>
    <button type="button" className="job-card" onClick={() => onSelectJob(job)}>
      <div className="job-card-heading"><div><span className="job-card-label">Customer</span><strong>{job.configurationSnapshot.customer.displayName}</strong></div><span className={`status-badge status-badge--${job.status === "closed" ? "complete" : "draft"}`}>{jobStatusLabel(job.status)}</span></div>
      <div className="job-service-line"><span className="job-card-label">Site / Service</span><strong>{job.site?.displayName ?? job.title}</strong></div>
      <div className="job-card-meta"><span><small>Service date</small><strong>{job.serviceDate ?? formatMalaysiaDateTime(job.createdAt)}</strong></span><span><small>Inspection progress</small><strong>{progress.complete} of {progress.total} systems</strong></span></div>
      <div className="progress-track" aria-label={`${progress.complete} of ${progress.total} inspections complete`}><span style={{ width: progress.total ? `${(progress.complete / progress.total) * 100}%` : "0%" }} /></div>
      {job.status !== "closed" && offlineReady !== undefined ? <span className={`job-offline-readiness job-offline-readiness--${offlineReady ? "ready" : "not-ready"}`}>{offlineReady ? "Ready for offline use" : "Not ready for offline: reconnect and refresh"}</span> : null}
      <span className="job-reference">{job.reference}</span>
    </button>
    {job.status === "closed" ? <button type="button" className="job-report-action"
      aria-label={`View Report for ${job.reference}`} disabled={!canViewReport}
      title={canViewReport ? undefined : "Reconnect to view the final report"}
      onClick={() => onViewFinalReport(job)}>View Report</button> : null}
  </li>;
}
