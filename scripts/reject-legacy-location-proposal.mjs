/** One-off, owner-approved rejection. No SQL writes, deletes or payload conversion.
 * CLI: set PWA_ADMIN_COOKIE securely in this process; node scripts/reject-legacy-location-proposal.mjs
 * Add --apply to write. HTTPS certificate trust must be configured normally (NODE_EXTRA_CA_CERTS).
 * The same runRejection function can run in the signed-in localhost browser with same-origin fetch.
 * Never print or persist the session cookie. Keep the returned report (it contains no credentials).
 */
export const TARGET_ID = '678f1e17-34b2-42f5-9674-2bd8d0392524';
export const EXPECTED_PAYLOAD = {
  zones: [{ key: '54ad152f7e95', sortOrder: 1, displayName: '1' }],
  locations: [{ key: '3319d2416c98', zoneId: '54ad152f7e95', rowPreset: {}, sortOrder: 1, displayName: '1', presetRowCount: 3 }]
};
const canonical = value => value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function checkIdentity(proposal) {
  if (!proposal || proposal.id !== TARGET_ID || proposal.systemKey !== 'fm200_fire_suppression'
    || proposal.customerDisplayName !== '28/9/2026 All Services' || proposal.submittedBy !== 'Technician1'
    || proposal.submittedAt !== '2026-09-28T18:10:05.637Z' || !same(proposal.payload, EXPECTED_PAYLOAD))
    throw new Error('Refused: proposal identity or full payload differs from the reviewed demo row.');
}
function checkPending(proposal) {
  checkIdentity(proposal);
  if (proposal.status !== 'pending' || proposal.decision !== null) throw new Error('Refused: proposal is no longer pending.');
}
export async function runRejection({ argv = [], request, log = console.log } = {}) {
  if (argv.some(arg => arg !== '--apply') || argv.length > 1) throw new Error('Only the optional --apply flag is allowed; the target cannot be changed.');
  const apply = argv.includes('--apply');
  const { user } = await request('/auth/me');
  if (!user || user.role !== 'admin' || !Number.isSafeInteger(user.id)) throw new Error('Refused: an authenticated admin is required.');
  const path = `/manager/location-proposals/${TARGET_ID}`;
  const before = (await request(path)).proposal;
  log(`BEFORE\n${JSON.stringify(before, null, 2)}`);
  checkPending(before);
  const report = { mode: apply ? 'apply' : 'dry-run', targetId: TARGET_ID, before, after: before };
  if (apply) {
    checkPending((await request(path)).proposal);
    const note = 'Owner-approved demo cleanup: legacy FM200 proposal contains generic zone/location names "1", three empty preset rows, and no active FM200 configuration. Original payload preserved; no deletion.';
    const confirmed = (await request(`${path}/decision`, { method: 'POST', body: { requestId: crypto.randomUUID(), decision: 'rejected', note } })).proposal;
    checkIdentity(confirmed);
    if (confirmed.status !== 'rejected' || confirmed.decision?.decision !== 'rejected'
      || confirmed.decision.decidedByRole !== 'admin' || confirmed.decision.note !== note)
      throw new Error('Rejection confirmation is malformed. Do not blindly retry; inspect the decision log.');
    report.after = (await request(path)).proposal;
    checkIdentity(report.after);
    if (!same(report.after, confirmed)) throw new Error('Authoritative reread differs from rejection confirmation. Inspect the decision log.');
  }
  log(`AFTER\n${JSON.stringify(report.after, null, 2)}`);
  log(apply ? 'Confirmed rejected; original immutable payload preserved.' : 'DRY RUN: no decision sent; status and payload unchanged.');
  return report;
}

// CLI entry point (excluded when executing the shared function in the authenticated browser).
if (typeof process !== 'undefined' && process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).href) {
  const cookie = process.env.PWA_ADMIN_COOKIE;
  if (!cookie) throw new Error('Set PWA_ADMIN_COOKIE securely in the process environment; never put it in arguments or a report.');
  const request = async (path, options = {}) => {
    const response = await fetch(`https://localhost/api${path}`, {
      method: options.method ?? 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });
    if (!response.ok) throw new Error(`API request failed (${response.status}); inspect state before retrying.`);
    return response.json();
  };
  await runRejection({ argv: process.argv.slice(2), request });
}
