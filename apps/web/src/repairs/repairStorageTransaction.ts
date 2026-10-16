import Dexie, { type Table, type Transaction } from "dexie";

// A retryable local-storage deadline, independent of connectivity. Includes
// database opening and native transaction acquisition, not just the callback.
const repairStorageDeadlineMs = 5_000;

export function repairStorageTransaction<T>(db: Dexie, mode: "r" | "rw", tables: Table[], work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  let transaction: Transaction | undefined;
  let expired = false;
  const deadline = Date.now() + repairStorageDeadlineMs;
  let failure = new Error("REPAIR_LOCAL_STORAGE_TIMEOUT");
  const cancel = () => {
    expired = true;
    try { transaction?.abort(); }
    catch {
      // Native commit can precede Dexie's completion delivery. Abort cannot
      // undo that commit; neither rollback nor save success is confirmed here.
      failure = new Error("REPAIR_LOCAL_STORAGE_OUTCOME_UNKNOWN");
    }
  };
  const check = () => {
    if (expired || signal?.aborted || Date.now() >= deadline) {
      cancel();
      throw failure;
    }
  };
  return new Promise<T>((resolve, reject) => {
    const expire = () => {
      // Abort the actual IDB transaction, including one queued behind another
      // tab's writer. A late callback cannot run on this transaction or reopen it.
      cancel();
      cleanup();
      reject(failure);
    };
    const timer = setTimeout(expire, repairStorageDeadlineMs);
    signal?.addEventListener("abort", expire, { once: true });
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", expire); };
    if (signal?.aborted) { expire(); cleanup(); return; }
    // Start acquisition immediately, preserving the caller's database operation.
    // A synchronous creation failure must also release its timer/listener.
    let operation: PromiseLike<T>;
    try {
      operation = Dexie.ignoreTransaction(() => db.transaction(mode, tables, async tx => {
        transaction = tx;
        check(); // Also cancels a transaction created after a delayed db.open().
        const result = await work();
        check();
        return result;
      }));
    } catch (e) { cleanup(); reject(e); return; }
    // db.transaction resolves only after native commit, never merely after work().
    void operation.then(value => { cleanup(); if (!expired) resolve(value); }, error => {
      cleanup(); reject(expired ? failure : error);
    });
  });
}
