import { localDatabase } from "../db/localDatabase";

export type UnsyncedWork = { waiting: number; failed: number };

/** Submitted work still on this device only: queued, in flight, or rejected (I-10). Drafts are not counted. */
export async function countUnsyncedWork(): Promise<UnsyncedWork> {
  const open = await localDatabase.syncOutbox.where("status").anyOf("Pending", "Syncing", "Failed").toArray();
  const failed = open.filter((item) => item.status === "Failed").length;
  return { waiting: open.length - failed, failed };
}

export function describeUnsyncedWork(work: UnsyncedWork, username: string | undefined, online: boolean): string | undefined {
  const total = work.waiting + work.failed;
  if (total === 0) return undefined;
  const parts = [work.waiting > 0 ? `${work.waiting} waiting to sync` : "", work.failed > 0 ? `${work.failed} need attention` : ""].filter(Boolean).join(", ");
  return [
    `You have ${total} submitted ${total === 1 ? "item" : "items"} not yet synced (${parts}).`,
    `They stay on this device and sync after you sign in again${username ? ` as ${username}` : ""}.`,
    online ? "" : "You are offline, so you will need a connection to sign in again.",
    "Sign out anyway?"
  ].filter(Boolean).join("\n\n");
}
