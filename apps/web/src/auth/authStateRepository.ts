import {
  deviceDatabase,
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
  return deviceDatabase.authState.get(deviceAuthKey);
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
    || (state.role !== "admin" && state.role !== "inspector" && state.role !== "supervisor")
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
  const previous = await getDeviceAuthState();
  const lastVerifiedAt = new Date().toISOString();
  await deviceDatabase.authState.put({
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
  if (previous?.userId !== user.id || previous.explicitLogout) {
    localStorage.setItem("inspection-auth-change", crypto.randomUUID());
  }
  return lastVerifiedAt;
}

export async function clearLocalIdentity(serverLogoutPending = false) {
  if (serverLogoutPending) {
    await deviceDatabase.authState.put({
      key: deviceAuthKey,
      schemaVersion: 1,
      cachedAt: new Date().toISOString(),
      explicitLogout: true,
      serverLogoutPending: true
    });
    localStorage.setItem("inspection-auth-change", crypto.randomUUID());
    return;
  }

  await deviceDatabase.authState.delete(deviceAuthKey);
  localStorage.setItem("inspection-auth-change", crypto.randomUUID());
}
