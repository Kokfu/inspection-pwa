import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { datePlusDays, decryptPassword, encryptPassword, encryptionKey, localClock, mailText, nextRunAt, validDate, validEmail } from "./reminderCore.js";

test("reminder clock uses Malaysian calendar boundaries", () => {
  assert.deepEqual(localClock(new Date("2026-09-28T00:59:59Z")), { date: "2026-09-28", time: "08:59" });
  assert.deepEqual(localClock(new Date("2026-09-28T01:00:00Z")), { date: "2026-09-28", time: "09:00" });
  assert.deepEqual(localClock(new Date("2026-09-28T15:59:59Z")), { date: "2026-09-28", time: "23:59" });
  assert.deepEqual(localClock(new Date("2026-09-28T16:00:00Z")), { date: "2026-09-29", time: "00:00" });
  assert.equal(datePlusDays("2026-12-31", 1), "2027-01-01");
  assert.equal(datePlusDays("2028-03-01", -1), "2028-02-29");
  assert.equal(nextRunAt(new Date("2026-09-28T00:59:00Z")).toISOString(), "2026-09-28T01:00:00.000Z");
  assert.equal(nextRunAt(new Date("2026-09-28T01:00:00Z")).toISOString(), "2026-09-29T01:00:00.000Z");
});

test("credential encryption uses fresh IV and fails closed on tamper and missing key", () => {
  const prior = process.env.SERVICE_DUE_EMAIL_ENCRYPTION_KEY;
  try {
    delete process.env.SERVICE_DUE_EMAIL_ENCRYPTION_KEY;
    assert.throws(encryptionKey);
    process.env.SERVICE_DUE_EMAIL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const first = encryptPassword("fake-test-secret");
    const second = encryptPassword("fake-test-secret");
    assert.notDeepEqual(first.iv, second.iv);
    assert.equal(decryptPassword(first.ciphertext, first.iv, first.tag), "fake-test-secret");
    first.tag[0] ^= 1;
    assert.throws(() => decryptPassword(first.ciphertext, first.iv, first.tag));
  } finally {
    if (prior === undefined) delete process.env.SERVICE_DUE_EMAIL_ENCRYPTION_KEY;
    else process.env.SERVICE_DUE_EMAIL_ENCRYPTION_KEY = prior;
  }
});

test("mail content is neutral and hostile header text is flattened", () => {
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validEmail("x@example.com\r\nBcc: stranger@example.com"), false);
  const mail = mailText("Client\r\nBcc: stranger@example.com", "2026-09-29");
  assert.equal(mail.subject.includes("\n"), false);
  assert.match(mail.body, /next service date is 2026-09-29/);
  assert.equal(/inspection|report/i.test(mail.body), false);
});
