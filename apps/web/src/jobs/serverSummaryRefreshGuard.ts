export type ServerSummaryRefreshToken = Readonly<{
  refreshGeneration: number;
  authGeneration: number;
  jobContextKey: string;
}>;

export class ServerSummaryRefreshGuard {
  private refreshGeneration = 0;

  begin(authGeneration: number, jobContextKey: string): ServerSummaryRefreshToken {
    return {
      refreshGeneration: ++this.refreshGeneration,
      authGeneration,
      jobContextKey
    };
  }

  invalidate() {
    this.refreshGeneration += 1;
  }

  continueWithJobContext(
    token: ServerSummaryRefreshToken,
    authGeneration: number,
    currentJobContextKey: string,
    nextJobContextKey: string
  ) {
    if (!this.isCurrent(token, authGeneration, currentJobContextKey)) {
      return undefined;
    }
    return currentJobContextKey === nextJobContextKey
      ? token
      : this.begin(authGeneration, nextJobContextKey);
  }

  isCurrent(token: ServerSummaryRefreshToken, authGeneration: number, jobContextKey: string) {
    return token.refreshGeneration === this.refreshGeneration
      && token.authGeneration === authGeneration
      && token.jobContextKey === jobContextKey;
  }
}
