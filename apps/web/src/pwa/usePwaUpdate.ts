import { useEffect, useRef, useState } from "react";
import { PwaUpdateCoordinator, type PwaUpdateState } from "./updateCoordinator";

export function usePwaUpdate(enabled: boolean, isSafeToReload: () => boolean) {
  const isSafeToReloadRef = useRef(isSafeToReload);
  isSafeToReloadRef.current = isSafeToReload;
  const coordinatorRef = useRef<PwaUpdateCoordinator | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = new PwaUpdateCoordinator(undefined, {
      isSafeToReload: () => isSafeToReloadRef.current()
    });
  }

  const coordinator = coordinatorRef.current;
  const [state, setState] = useState<PwaUpdateState>(coordinator.snapshot());

  useEffect(() => {
    const unsubscribe = coordinator.subscribe(setState);
    if (enabled) coordinator.start();
    return () => {
      unsubscribe();
      if (enabled) coordinator.stop();
    };
  }, [coordinator, enabled]);

  return { ...state, requestUpdate: () => coordinator.requestUpdate() };
}
