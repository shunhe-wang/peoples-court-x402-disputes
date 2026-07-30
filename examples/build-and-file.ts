import type {
  PaymentPayload,
  PaymentRequired,
  SettleResponse,
} from "@x402/core/types";
import type { SignedReceipt } from "@x402/extensions/offer-receipt";

import {
  buildX402DisputePacket,
  createPeopleCourtAdjudicationAdapter,
  type PeopleCourtPartnerTransport,
} from "../src/index.js";

export async function prepareOrdinaryX402Dispute(input: {
  paymentRequired: PaymentRequired;
  paymentPayload: PaymentPayload;
  settlement: SettleResponse;
  settledAt: string;
  receipt?: SignedReceipt;
  transport: PeopleCourtPartnerTransport;
  policyVersion: string;
  authorityGrantId: string;
  claimantConsentId: string;
  respondentConsentId: string;
}) {
  const packet = await buildX402DisputePacket({
    paymentRequired: input.paymentRequired,
    paymentPayload: input.paymentPayload,
    settlement: input.settlement,
    rail: "x402",
    claimClass: "defective_performance",
    disputedAmount: { value: "25", currency: "USD" },
    executionMode: "partner_executes",
    settledAt: input.settledAt,
    ...(input.receipt === undefined ? {} : { receipt: input.receipt }),
  });

  return createPeopleCourtAdjudicationAdapter(input.transport).prepare({
    packet,
    idempotencyKey: crypto.randomUUID(),
    externalCaseId: packet.transactionId,
    policyVersion: input.policyVersion,
    authorityGrantId: input.authorityGrantId,
    consentArtifactIds: {
      claimant: input.claimantConsentId,
      respondent: input.respondentConsentId,
    },
    summary: "The purchased x402 resource did not satisfy the declared terms.",
    amount: { value: 25, currency: "USD" },
    parties: {
      claimant: {
        externalId: packet.parties.claimantId,
        name: "Buyer",
      },
      respondent: {
        externalId: packet.parties.respondentId,
        name: "Seller",
      },
    },
    claim: {
      statement: "The delivered result omitted the purchased data.",
      requestedOutcome: "refund",
    },
  });
}
