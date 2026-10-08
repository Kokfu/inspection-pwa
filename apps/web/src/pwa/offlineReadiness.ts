import { useEffect, useState } from "react";

export type OfflineReadiness = "ready" | "preparing" | "unavailable";

/**
 * "Offline Ready" (I-05): the service worker controls this page AND the app shell is in the precache. A worker only
 * finishes installing once its precache is complete, so a controlling worker plus a precache cache means the shell
 * will load with no network.
 */
export function computeOfflineReadiness(input: { supported: boolean; controlled: boolean; precached: boolean }): OfflineReadiness {
  if (!input.supported) return "unavailable";
  return input.controlled && input.precached ? "ready" : "preparing";
}

export const offlineReadinessLabel: Record<OfflineReadiness, string> = {
  ready: "Offline ready",
  preparing: "Preparing offline use",
  unavailable: "Offline not available"
};

async function readOfflineReadiness() {
  const supported = typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof caches !== "undefined";
  if (!supported) return computeOfflineReadiness({ supported: false, controlled: false, precached: false });
  let precached = false;
  try { precached = (await caches.keys()).some((key) => key.includes("precache")); } catch { precached = false; }
  return computeOfflineReadiness({ supported: true, controlled: Boolean(navigator.serviceWorker.controller), precached });
}

/** Only meaningful for the production build (the dev server has no service worker). Pass `enabled=false` to hide it. */
export function useOfflineReadiness(enabled: boolean, recheckKey: unknown): OfflineReadiness | undefined {
  const [state, setState] = useState<OfflineReadiness>();
  useEffect(() => {
    if (!enabled) { setState(undefined); return; }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      const next = await readOfflineReadiness();
      if (!active) return;
      setState(next);
      if (next === "preparing") timer = setTimeout(() => void check(), 3000);
    };
    void check();
    const onControllerChange = () => void check();
    navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);
    return () => { active = false; if (timer) clearTimeout(timer); navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange); };
  }, [enabled, recheckKey]);
  return state;
}
