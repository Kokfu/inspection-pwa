import { statSync, writeFileSync } from "node:fs";

// No config/env import: the Docker healthcheck runs this file on its own, without the worker's secrets.
export const REMINDER_HEARTBEAT_PATH = "/tmp/reminder-worker-heartbeat";
/** Cycles run every 15 minutes, so two missed cycles plus slack means the worker is hung or every cycle fails. */
export const REMINDER_HEARTBEAT_MAX_AGE_MS = 40 * 60 * 1000;

export function reminderHeartbeatFresh(lastBeatMs: number | undefined, nowMs: number) {
  return lastBeatMs !== undefined && Number.isFinite(lastBeatMs) && nowMs - lastBeatMs < REMINDER_HEARTBEAT_MAX_AGE_MS;
}

/** Called after a cycle that reached the database; a failing cycle leaves the old beat to go stale. */
export function writeReminderHeartbeat(path = REMINDER_HEARTBEAT_PATH, now = new Date()) {
  writeFileSync(path, now.toISOString());
}

export function readReminderHeartbeat(path = REMINDER_HEARTBEAT_PATH): number | undefined {
  try { return statSync(path).mtimeMs; } catch { return undefined; }
}

if (process.argv[1]?.endsWith("reminderHealth.js")) {
  process.exit(reminderHeartbeatFresh(readReminderHeartbeat(), Date.now()) ? 0 : 1);
}
