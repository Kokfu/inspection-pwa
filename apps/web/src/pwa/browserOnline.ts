import { useEffect, useState } from "react";
import type { ClientAuthState } from "../auth/authStateTypes";

/** How often the browser's own online flag is re-read, in case an `online` / `offline` event never reaches the page. */
export const BROWSER_ONLINE_POLL_MS = 2_000;

/**
 * The browser's own network flag (I-42). It only drives the header label: nothing is blocked by it, and it is
 * independent of the auth state, because a server probe can still succeed for a moment after the browser has gone
 * offline (a tunnel or proxy that is still up) and must not be able to put "Online" back on screen.
 */
export function useBrowserOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const read = () => setOnline(navigator.onLine !== false);
    read();
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    document.addEventListener("visibilitychange", read);
    const timer = setInterval(read, BROWSER_ONLINE_POLL_MS);
    return () => {
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
      document.removeEventListener("visibilitychange", read);
      clearInterval(timer);
    };
  }, []);
  return online;
}

export type ConnectionChip = { className: "online" | "unavailable" | "reconnecting" | "offline"; label: string };

export function headerConnectionChip(input: {
  authStatus: ClientAuthState["status"];
  serverUnreachable: boolean;
  connectivityRecoveryActive: boolean;
  browserOnline: boolean;
}): ConnectionChip {
  if (!input.browserOnline) return { className: "offline", label: "Offline" };
  if (input.authStatus === "verified") {
    return input.serverUnreachable
      ? { className: "unavailable", label: "Server unreachable" }
      : { className: "online", label: "Online" };
  }
  if (input.authStatus === "online-unavailable") return { className: "unavailable", label: "Server unavailable" };
  if (input.authStatus === "verifying" || input.connectivityRecoveryActive) return { className: "reconnecting", label: "Reconnecting" };
  return { className: "offline", label: "Offline" };
}
