import {
  canonicalize,
  hashCanonical,
} from "@x402/extensions/offer-receipt";

import type {
  PeopleCourtDisputeAcceptanceStatementV1,
  X402DisputePacketV1,
} from "./types.js";

export { canonicalize as canonicalJson };

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function canonicalSha256(value: unknown): Promise<string> {
  return bytesToHex(await hashCanonical(value));
}

export function packetHashPayload(
  packet: X402DisputePacketV1,
): Omit<X402DisputePacketV1, "packetHash"> {
  const { packetHash: _packetHash, ...payload } = packet;
  return payload;
}

export function acceptanceSigningMessage(
  statement: PeopleCourtDisputeAcceptanceStatementV1,
  statementHash: string,
): string {
  return [
    "People's Court x402 dispute terms acceptance",
    `Statement hash: ${statementHash}`,
    `Resource: ${statement.resourceUrl}`,
    `Transaction: ${statement.transactionId}`,
    `Payer: ${statement.payerId}`,
    `Counterparty: ${statement.counterpartyId}`,
    `Rules: ${statement.rulesVersion} (${statement.rulesHash})`,
    `Terms: ${statement.termsVersion} (${statement.termsHash})`,
    `Scope: ${statement.scope}`,
    `Accepted at: ${statement.acceptedAt}`,
    `Nonce: ${statement.nonce}`,
    "",
    "This act records acceptance evidence.",
    "It does not prove delegated authority, case-specific notice, performance, or recoverability.",
  ].join("\n");
}
