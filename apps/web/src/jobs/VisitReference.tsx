import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { localDatabase } from "../db/localDatabase";
import { isLocalVisitReference } from "./offlineServiceVisitStore";

/**
 * The visit reference shown on an open form. A form's frozen snapshot keeps the placeholder it was created with, so once the
 * server confirms the visit the number comes live from the stored receipt. Display only: the snapshot is never changed.
 */
export function VisitReference({ job }: { job: { id: string; reference: string } }) {
  const [confirmed, setConfirmed] = useState<string>();
  const placeholder = isLocalVisitReference(job.reference);
  useEffect(() => {
    if (!placeholder) return;
    const subscription = liveQuery(() => localDatabase.offlineServiceVisits.get(job.id)).subscribe({
      next: (visit) => setConfirmed(visit?.receipt?.visitNumber),
      error: () => setConfirmed(undefined)
    });
    return () => subscription.unsubscribe();
  }, [job.id, placeholder]);
  return <>{placeholder && confirmed ? confirmed : job.reference}</>;
}
