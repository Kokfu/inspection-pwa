import { useEffect, useRef, useState, type ComponentProps } from "react";
import { ManagerOperations } from "./ManagerOperations";
import { loadManagerServiceHistory, type ManagerServiceVisit } from "./managerApi";

type Props = Pick<ComponentProps<typeof ManagerOperations>, "onSelect" | "onViewReport" | "onDownloadReport" | "onBack"> & { onAuthorityFailure: (error: unknown) => void };

export function ManagerServicesDone({ onAuthorityFailure, ...actions }: Props) {
  const mounted = useRef(false);
  const [visits, setVisits] = useState<ManagerServiceVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  async function refresh(signal?: AbortSignal, after?: string) {
    setLoading(true);
    try {
      const result = await loadManagerServiceHistory({ status: "closed", ...(after ? { cursor: after } : {}) }, signal);
      if (!mounted.current || signal?.aborted) return;
      setVisits((current) => after ? [...current, ...result.serviceVisits] : result.serviceVisits);
      setCursor(result.nextCursor);
    } catch (error) { if (mounted.current && !signal?.aborted) { setVisits([]); setCursor(null); onAuthorityFailure(error); } }
    finally { if (mounted.current && !signal?.aborted) setLoading(false); }
  }
  useEffect(() => { mounted.current = true; const controller = new AbortController(); void refresh(controller.signal); return () => { mounted.current = false; controller.abort(); }; }, []);
  return <section aria-label="Current Services Done"><h2>Current Services Done</h2>
    <ManagerOperations visits={visits} loading={loading} message="" onRefresh={() => refresh()} {...actions} />
    {cursor && <button type="button" disabled={loading} onClick={() => void refresh(undefined, cursor)}>Load more completed services</button>}
  </section>;
}
