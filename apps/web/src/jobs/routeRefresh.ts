/**
 * I-23: a route effect re-resolves its inspection whenever the saved-inspection list changes, which happens after every
 * save (autosave included). Clearing the record first unmounted the open form, so the technician lost focus and scroll
 * position while typing. These two rules let the form stay mounted for a refresh of the SAME record under the SAME
 * authority, and never let a late, older resolution overwrite a newer save.
 */
type Versioned = { clientUuid: string; localUpdatedAt: string; syncStatus: string };

/**
 * True when the effect is only refreshing what is already on screen: the shown record is this route's record and the
 * previous resolution was made under exactly the same auth status, authority generation, verification and route.
 * Any change of those (sign-out, re-verification, offline, another route) is not a refresh and resets as before.
 */
export function isRouteRefresh(shown: Versioned | undefined, routeClientUuid: string, resolvedKey: string | undefined, currentKey: string) {
  return shown !== undefined && shown.clientUuid === routeClientUuid && resolvedKey === currentKey;
}

export function routeRefreshKey(parts: { authStatus: string; authorityGeneration: number; verifiedAt?: string; clientUuid: string }) {
  return `${parts.authStatus}|${parts.authorityGeneration}|${parts.verifiedAt ?? ""}|${parts.clientUuid}`;
}

/** Keep the record already shown when the resolution is older, or identical (same version and status). */
export function mergeResolvedRecord<T extends Versioned>(shown: T | undefined, resolved: T): T {
  if (!shown || shown.clientUuid !== resolved.clientUuid) return resolved;
  const shownAt = Date.parse(shown.localUpdatedAt);
  const resolvedAt = Date.parse(resolved.localUpdatedAt);
  if (Number.isNaN(shownAt) || Number.isNaN(resolvedAt)) return resolved;
  if (shownAt > resolvedAt) return shown;
  if (shownAt === resolvedAt && shown.syncStatus === resolved.syncStatus) return shown;
  return resolved;
}
