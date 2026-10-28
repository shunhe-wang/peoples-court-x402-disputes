import assert from 'node:assert/strict';
import { clients, context, payment, sdkFor, readState, saveState, api, json, apiBase, required } from '../lib/shared.mjs';
const c = await clients();
const ctx = await context();
const { saved, pi } = await payment();
const state = await sdkFor(ctx, c).payment.getState(pi);
let handle; try { handle = await readState('case'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
let detail;
if (handle?.caseId) {
  const operator = process.argv.includes('--operator');
  if (operator) assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(apiBase).hostname), 'Operator observation is local-only.');
  detail = await api(`/api/disputes/${handle.caseId}`, { headers: operator
    ? { 'x-arb-admin-token': required('ARB_ADMIN_TOKEN') } : { 'x-arb-party-token': handle.claimantToken } });
  await saveState('observation', detail);
}
const disposition = detail?.disposition;
console.log(json({ chainId: 84532, paymentInfoHash: saved.paymentInfoHash, hasCollectedPayment: state[0],
  capturableAmount: state[1], refundableAmount: state[2], caseId: handle?.caseId,
  status: detail?.dispute?.status, awardHash: disposition?.awardHash, executeAfter: disposition?.executeAfter,
  releasedToParties: disposition?.releasedToParties ?? false,
  oversightReasons: detail?.dispute?.casePlan?.oversight?.reasonCodes,
  fundsInstructions: disposition?.fundsInstructions, execution: disposition?.settlementExecution,
  settlement: detail?.dispute?.settlement }));
console.log('Observe does not execute settlement. Keep the app executor running after finality; inspect case audit receipts and chain state.');
