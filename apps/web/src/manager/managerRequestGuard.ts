export type ManagerRequest = {
  generation: number;
  authGeneration: number;
  signal: AbortSignal;
};

/** Invalidates Manager-only requests whenever server authority changes. */
export class ManagerRequestGuard {
  private generation = 0;
  private controller: AbortController | undefined;

  begin(authGeneration: number): ManagerRequest {
    this.controller?.abort();
    this.controller = new AbortController();
    return {
      generation: ++this.generation,
      authGeneration,
      signal: this.controller.signal
    };
  }

  invalidate() {
    this.generation += 1;
    this.controller?.abort();
    this.controller = undefined;
  }

  isCurrent(request: ManagerRequest, currentAuthGeneration: number, hasAuthority: boolean) {
    return hasAuthority
      && request.generation === this.generation
      && request.authGeneration === currentAuthGeneration;
  }
}
