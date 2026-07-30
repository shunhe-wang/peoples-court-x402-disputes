import type {
  PaymentPayload,
  PaymentRequired,
  SettleResponse,
} from "@x402/core/types";

import {
  buildX402DisputePacket,
} from "../src/index.js";

export async function preserveX402rEvidence(input: {
  paymentRequired: PaymentRequired;
  paymentPayload: PaymentPayload;
  settlement: SettleResponse;
  settledAt: string;
}) {
  return buildX402DisputePacket({
    paymentRequired: input.paymentRequired,
    paymentPayload: input.paymentPayload,
    settlement: input.settlement,
    rail: "x402r",
    claimClass: "refund_dispute",
    disputedAmount: { value: "25", currency: "USD" },
    executionMode: "x402r",
    settledAt: input.settledAt,
  });
}

// Submit the actual signed x402r referral through the existing x402r route.
// Do not send this packet through the ordinary Partner API adjudication adapter.
