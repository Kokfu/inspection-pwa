// This scope owns readonly verification only. Never put a freeze/write in work.
// Blob reads, WebCrypto and bitmap decode cannot be aborted. A late result is
// consumed but its continuation is invalidated before any subsequent phase.
export function repairVerification<T>(work: (check: () => void) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const deadline = Date.now() + 5_000;
  let expired = false;
  const failure = new Error("REPAIR_PHOTO_VERIFICATION_TIMEOUT");
  const check = () => {
    if (expired || signal?.aborted || Date.now() >= deadline) throw failure;
  };
  return new Promise<T>((resolve, reject) => {
    const expire = () => { expired = true; cleanup(); reject(failure); };
    const timer = setTimeout(expire, 5_000);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", expire); };
    signal?.addEventListener("abort", expire, { once: true });
    if (signal?.aborted) { expire(); return; }
    void Promise.resolve().then(() => { check(); return work(check); }).then(value => {
      try { check(); cleanup(); resolve(value); } catch (e) { cleanup(); reject(e); }
    }, error => { cleanup(); reject(expired ? failure : error); });
  });
}
