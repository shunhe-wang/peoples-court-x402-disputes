// Operator-only local demo control, ported from scripts/demo-x402r-full.mjs.
// This closes the Record at real current time and never changes finality.
import assert from 'node:assert/strict';
import { apiBase, required, readState, api } from '../lib/shared.mjs';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(apiBase).hostname), 'This helper is local-only.');
assert(process.argv.includes('--close-record'), 'Review both pleadings, then pass --close-record.');
const handle = await readState('case');
const headers = { 'x-arb-admin-token': required('ARB_ADMIN_TOKEN') };
let d = (await api(`/api/disputes/${handle.caseId}`, { headers })).dispute;
await api(`/api/disputes/${handle.caseId}/exchange`, { method: 'POST', headers,
  body: { expectedRevision: d.revision, effectiveAt: new Date().toISOString(), reason: 'Local testnet operator closes the completed exchange.' } });
d = (await api(`/api/disputes/${handle.caseId}`, { headers })).dispute;
// Closing the Record can already enqueue a run through the app's clock.
const queuedRun = async () => (await api('/api/adjudication-runs?limit=200', { headers })).runs
  .find(r => r.disputeId === handle.caseId && r.status === 'queued');
const queued = await queuedRun();
if (queued) await api(`/api/adjudication-runs/${queued.id}/process`, { method: 'POST', headers, body: {} });
else {
  try { await api(`/api/disputes/${handle.caseId}/adjudicate`, { method: 'POST', headers, body: { expectedRevision: d.revision } }); }
  catch (e) {
    if (e.status !== 409) throw e;
    const winner = await queuedRun();
    if (!winner) throw e;
    await api(`/api/adjudication-runs/${winner.id}/process`, { method: 'POST', headers, body: {} });
  }
}
const detail = await api(`/api/disputes/${handle.caseId}`, { headers });
assert.equal(detail.dispute.status, 'served_awaiting_execution', `App stopped at ${detail.dispute.status}; no served Award verified. Inspect operator audit trail.`);
assert(detail.disposition?.executeAfter, 'Served Award has no execution date.');
console.log(`Award served for ${handle.caseId}. Execution not before ${detail.disposition.executeAfter}, later if stayed. Run npm run observe.`);
