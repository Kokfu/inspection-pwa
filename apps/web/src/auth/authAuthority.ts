import type { AuthUser } from "./authApi";

function authorityIdentity(user: AuthUser) {
  return JSON.stringify([user.id, user.username, user.role]);
}

export class AuthAuthorityGuard {
  private generation = 0;
  private installedIdentity: string | undefined;

  get currentGeneration() {
    return this.generation;
  }

  get hasAuthority() {
    return this.installedIdentity !== undefined;
  }

  matches(user: AuthUser) {
    return this.installedIdentity === authorityIdentity(user);
  }

  install(user: AuthUser) {
    const identity = authorityIdentity(user);
    if (this.installedIdentity === identity) return false;
    this.installedIdentity = identity;
    this.generation += 1;
    return true;
  }

  revoke() {
    this.installedIdentity = undefined;
    this.generation += 1;
  }

  isCurrent(generation: number) {
    return this.hasAuthority && generation === this.generation;
  }
}
