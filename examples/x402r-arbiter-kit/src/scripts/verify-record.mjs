import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { computePaymentInfoHash } from '@x402r/core';
import { getStoredPaymentInfo, getEvidence, getEscrowPeriodDuration, getPaymentState } from '@x402r/core/actions';
import { clients, CHAIN_ID, chainConfig, terms, json } from '../lib/shared.mjs';
const record = JSON.parse(await readFile('verification/chain.json', 'utf8'));
const ctx = JSON.parse(await readFile('verification/contracts.json', 'utf8'));
const setup = JSON.parse(await readFile('verification/setup-transactions.json', 'utf8'));
const { publicClient: p } = await clients();
assert.equal(record.chainId, CHAIN_ID);
const pi = await getStoredPaymentInfo(p, { contractAddress: ctx.refundRequestAddress, paymentInfoHash: record.paymentInfoHash });
assert.equal(computePaymentInfoHash(CHAIN_ID, chainConfig.authCaptureEscrow, pi), record.paymentInfoHash);
assert.equal(pi.salt, BigInt(`0x${terms.termsHash}`));
for (const entry of [...Object.values(record.receipts), ...setup]) {
  const receipt = await p.getTransactionReceipt({ hash: entry.hash });
  assert.equal(receipt.status, 'success');
  assert.equal(receipt.blockNumber, BigInt(entry.blockNumber));
  console.log(`confirmed https://sepolia.basescan.org/tx/${entry.hash}`);
}
for (const [name, address] of Object.entries(ctx)) {
  if (!name.endsWith('Address')) continue;
  assert((await p.getCode({ address }))?.length > 2, `${name} bytecode missing.`);
}
assert.equal(await getEscrowPeriodDuration(p, { escrowPeriodAddress: ctx.escrowPeriodAddress }), BigInt(record.holdSeconds));
const exhibit = await getEvidence(p, { contractAddress: ctx.refundRequestEvidenceAddress, paymentInfo: pi, index: 0n });
assert.equal(exhibit.submitter.toLowerCase(), pi.payer.toLowerCase());
const raw = Buffer.from(exhibit.cid.split(',')[1], 'base64');
assert.equal(createHash('sha256').update(raw).digest('hex'), record.evidence.sha256);
console.log(json({ paymentInfoHash: record.paymentInfoHash, currentPaymentState: await getPaymentState(p, { chainId: CHAIN_ID, operatorAddress: pi.operator, paymentInfo: pi }) }));
console.log('Recorded transactions and evidence verified. This read does not prove Award service or settlement.');
