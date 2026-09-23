import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { registerGracefulShutdown, type ShutdownSignalSource } from "./serverShutdown.js";

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  test(`${signal} initiates shutdown and closes HTTP, Chromium, then PostgreSQL`, async () => {
    const emitter = new EventEmitter();
    const signals = Object.assign(emitter, { exitCode: undefined as number | undefined }) as EventEmitter & ShutdownSignalSource;
    const calls: string[] = [];
    let resolveComplete!: () => void;
    const complete = new Promise<void>(resolve => { resolveComplete = resolve; });
    registerGracefulShutdown({
      signals,
      server: { close(callback) { calls.push("http"); callback(); } },
      closePdfEngine: async () => { calls.push("chromium"); },
      closeDatabase: async () => { calls.push("postgres"); resolveComplete(); }
    });

    emitter.emit(signal);
    await complete;
    assert.deepEqual(calls, ["http", "chromium", "postgres"]);
    assert.equal(signals.exitCode, undefined);
  });
}

test("repeated signals share one shutdown", async () => {
  const emitter = new EventEmitter();
  const signals = Object.assign(emitter, { exitCode: undefined as number | undefined }) as EventEmitter & ShutdownSignalSource;
  let closeCount = 0;
  let resolveComplete!: () => void;
  const complete = new Promise<void>(resolve => { resolveComplete = resolve; });
  registerGracefulShutdown({
    signals,
    server: { close(callback) { closeCount += 1; callback(); } },
    closePdfEngine: async () => {},
    closeDatabase: async () => { resolveComplete(); }
  });

  emitter.emit("SIGTERM");
  emitter.emit("SIGINT");
  await complete;
  assert.equal(closeCount, 1);
});

test("shutdown attempts every cleanup after failures, logs them, and sets a failing exit code", async () => {
  const emitter = new EventEmitter();
  const signals = Object.assign(emitter, { exitCode: undefined as number | undefined }) as EventEmitter & ShutdownSignalSource;
  const calls: string[] = [];
  const errors: unknown[] = [];
  let resolveLogged!: () => void;
  const logged = new Promise<void>(resolve => { resolveLogged = resolve; });
  registerGracefulShutdown({
    signals,
    server: { close(callback) { calls.push("http"); callback(new Error("HTTP close failed")); } },
    closePdfEngine: async () => { calls.push("chromium"); throw new Error("Chromium close failed"); },
    closeDatabase: async () => { calls.push("postgres"); throw new Error("PostgreSQL close failed"); },
    logError: (_message, error) => { errors.push(error); resolveLogged(); }
  });

  emitter.emit("SIGINT");
  await logged;
  assert.deepEqual(calls, ["http", "chromium", "postgres"]);
  assert.equal(signals.exitCode, 1);
  assert.equal(errors.length, 1);
  assert(errors[0] instanceof AggregateError);
  assert.deepEqual(
    errors[0].errors.map(error => (error as Error).message),
    ["HTTP close failed", "Chromium close failed", "PostgreSQL close failed"]
  );
});
