import {
  localDatabase,
  type DeviceAuthState
} from "../db/localDatabase";
import type { AuthUser } from "./authApi";

const deviceAuthKey = "device-auth" as const;

export type CachedIdentity = {
  user: AuthUser;
  lastVerifiedAt: string;
};

export async function getDeviceAuthState() {
  return localDatabase.authState.get(deviceAuthKey);
}

export function identityFromDeviceState(
  state: DeviceAuthState | undefined
): CachedIdentity | undefined {
  if (
    !state
    || state.serverLogoutPending
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
    lastVerifiedAt: state.lastVerifiedAt
  };
}

export async function storeVerifiedIdentity(user: AuthUser) {
  const lastVerifiedAt = new Date().toISOString();
  await localDatabase.authState.put({
    key: deviceAuthKey,
    userId: user.id,
    username: user.username,
    role: user.role,
    lastVerifiedAt,
    serverLogoutPending: false
  });
  return lastVerifiedAt;
}

export async function clearLocalIdentity(serverLogoutPending = false) {
  if (serverLogoutPending) {
    await localDatabase.authState.put({
      key: deviceAuthKey,
      serverLogoutPending: true
    });
    return;
  }

  await localDatabase.authState.delete(deviceAuthKey);
}
