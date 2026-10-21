import type { InspectionJob } from "./jobTypes";
import { ServiceJobCard, completedServiceJobs } from "./ServiceJobCard";

export function TechnicianCompletedServices({ jobs, canViewReport, jobProgress, onSelectJob, onViewFinalReport }: {
  jobs: InspectionJob[];
  canViewReport: boolean;
  jobProgress: (job: InspectionJob) => { complete: number; total: number };
  onSelectJob: (job: InspectionJob) => void;
  onViewFinalReport: (job: InspectionJob) => void;
}) {
  const completed = completedServiceJobs(jobs);
  return <section className="technician-home page-stack" aria-labelledby="technician-completed-title">
    <div className="workspace-heading"><div><p className="eyebrow">Technician workspace</p><h2 id="technician-completed-title">Completed Services</h2><p>Your completed service visits on this device.</p></div></div>
    {completed.length ? <ul className="job-card-list">{completed.map((job) =>
      <ServiceJobCard key={job.id} job={job} progress={jobProgress(job)} canViewReport={canViewReport}
        onSelectJob={onSelectJob} onViewFinalReport={onViewFinalReport} />
    )}</ul> : <p className="empty-state">No completed service visits yet.</p>}
  </section>;
}
