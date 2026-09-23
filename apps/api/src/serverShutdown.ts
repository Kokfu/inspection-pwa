type Signal = "SIGTERM" | "SIGINT";

export interface ShutdownSignalSource {
  on(signal: Signal, listener: () => void): unknown;
  exitCode?: number;
}

export interface ShutdownServer {
  close(callback: (error?: Error) => void): void;
}

interface ShutdownDependencies {
  server: ShutdownServer;
  closePdfEngine: () => Promise<void>;
  closeDatabase: () => Promise<void>;
  signals?: ShutdownSignalSource;
  logError?: (message: string, error: unknown) => void;
}

/** Registers the production signal path and returns the same idempotent path for tests. */
export function registerGracefulShutdown(dependencies: ShutdownDependencies): () => Promise<void> {
  const signals = dependencies.signals ?? process;
  const logError = dependencies.logError ?? ((message, error) => console.error(message, error));
  let pending: Promise<void> | undefined;

  const shutdown = () => {
    if (pending) return pending;
    pending = (async () => {
      const errors: unknown[] = [];

      await new Promise<void>(resolve => {
        try {
          dependencies.server.close(error => {
            if (error) errors.push(error);
            resolve();
          });
        } catch (error) {
          errors.push(error);
          resolve();
        }
      });

      try { await dependencies.closePdfEngine(); }
      catch (error) { errors.push(error); }

      try { await dependencies.closeDatabase(); }
      catch (error) { errors.push(error); }

      if (errors.length > 0) {
        const error = errors.length === 1
          ? errors[0]
          : new AggregateError(errors, "Multiple graceful shutdown steps failed");
        logError("Graceful shutdown failed", error);
        signals.exitCode = 1;
      }
    })();
    return pending;
  };

  signals.on("SIGTERM", () => { void shutdown(); });
  signals.on("SIGINT", () => { void shutdown(); });
  return shutdown;
}
