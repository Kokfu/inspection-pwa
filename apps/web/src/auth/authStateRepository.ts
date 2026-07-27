import {
  localDatabase,
  type DeviceAuthState
} from "../db/localDatabase";
import type { AuthUser } from "./authApi";

const deviceAuthKey = "device-auth" as const;

export type CachedIdentity = {
  user: AuthUser;
  lastVerifiedAt: string;
  cachedAt: string;
};

export async function getDeviceAuthState() {
  return localDatabase.authState.get(deviceAuthKey);
}

export function identityFromDeviceState(
  state: DeviceAuthState | undefined
): CachedIdentity | undefined {
  if (
    !state
    || state.explicitLogout === true
    || state.serverLogoutPending
    || (state.schemaVersion !== undefined && state.schemaVersion !== 1)
    || typeof state.userId !== "number"
    || typeof state.username !== "string"
    || (state.role !== "admin" && state.role !== "inspector")
    || typeof state.lastVerifiedAt !== "string"
  ) {
    return undefined;
  }

  return {
    user: {
      id: state.userId,
      username: state.username,
      role: state.role
    },
    lastVerifiedAt: state.lastVerifiedAt,
    cachedAt: state.cachedAt ?? state.lastVerifiedAt
  };
}

export async function storeVerifiedIdentity(user: AuthUser) {
  const lastVerifiedAt = new Date().toISOString();
  await localDatabase.authState.put({
    key: deviceAuthKey,
    schemaVersion: 1,
    userId: user.id,
    username: user.username,
    role: user.role,
    lastVerifiedAt,
    cachedAt: lastVerifiedAt,
    explicitLogout: false,
    serverLogoutPending: false
  });
  return lastVerifiedAt;
}

export async function clearLocalIdentity(serverLogoutPending = false) {
  if (serverLogoutPending) {
    await localDatabase.authState.put({
      key: deviceAuthKey,
      schemaVersion: 1,
      cachedAt: new Date().toISOString(),
      explicitLogout: true,
      serverLogoutPending: true
    });
    return;
  }

  await localDatabase.authState.delete(deviceAuthKey);
}
