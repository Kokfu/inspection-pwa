import { useEffect, useState } from "react";
import { isGatewayUnreachableStatus } from "./serverReachability";

export const SERVER_PROBE_TIMEOUT_MS = 4000;
export const SERVER_PROBE_INTERVAL_MS = 20_000;

/**
 * One lightweight health probe (I-01). "unreachable" means the request did not reach the API at all (network error,
 * timeout, or a 502/504 from the reverse proxy); any other answer, even an error status, means the server is there.
 */
export async function probeServerHealth(
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = SERVER_PROBE_TIMEOUT_MS
): Promise<"reachable" | "unreachable"> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl("/api/health", { cache: "no-store", signal: controller.signal });
    return isGatewayUnreachableStatus(response.status) ? "unreachable" : "reachable";
  } catch {
    return "unreachable";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * True while the browser reports a network but the server cannot be reached. Probes on enable, on reconnect, when the
 * tab becomes visible, and every 20 s while visible. Never blocks anything; it only drives the header label.
 */
export function useServerUnreachable(enabled: boolean): boolean {
  const [unreachable, setUnreachable] = useState(false);
  useEffect(() => {
    if (!enabled) { setUnreachable(false); return; }
    let active = true;
    const run = async () => {
      if (navigator.onLine === false) return;
      const result = await probeServerHealth();
      if (active) setUnreachable(result === "unreachable");
    };
    void run();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void run(); }, SERVER_PROBE_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void run(); };
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; clearInterval(timer); window.removeEventListener("online", run); document.removeEventListener("visibilitychange", onVisible); };
  }, [enabled]);
  return unreachable;
}
