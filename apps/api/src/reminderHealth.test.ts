import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readReminderHeartbeat, REMINDER_HEARTBEAT_MAX_AGE_MS, reminderHeartbeatFresh, writeReminderHeartbeat } from "./reminderHealth.js";

test("reminder heartbeat is fresh only inside the 40-minute window", () => {
  const now = Date.parse("2026-10-22T09:00:00Z");
  assert.equal(reminderHeartbeatFresh(undefined, now), false);
  assert.equal(reminderHeartbeatFresh(Number.NaN, now), false);
  assert.equal(reminderHeartbeatFresh(now, now), true);
  assert.equal(reminderHeartbeatFresh(now - REMINDER_HEARTBEAT_MAX_AGE_MS + 1, now), true);
  assert.equal(reminderHeartbeatFresh(now - REMINDER_HEARTBEAT_MAX_AGE_MS, now), false);
});

test("a missing heartbeat file reads as no beat; a written one reads back as recent", () => {
  const dir = mkdtempSync(join(tmpdir(), "reminder-heartbeat-"));
  try {
    const path = join(dir, "beat");
    assert.equal(readReminderHeartbeat(path), undefined);
    writeReminderHeartbeat(path);
    assert.equal(reminderHeartbeatFresh(readReminderHeartbeat(path), Date.now()), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
