import type {
  PeopleCourtAdjudicationAdapter,
  PeopleCourtPartnerTransport,
  VerifyX402DisputePacketOptions,
} from "./types.js";
import { decimalAmountMatchesNumber } from "./amount.js";
import { verifyX402DisputePacketIntegrity } from "./packet.js";
import { PeopleCourtDisputeValidationError } from "./validation.js";

export function createPeopleCourtAdjudicationAdapter(
  transport: PeopleCourtPartnerTransport,
  verificationOptions: VerifyX402DisputePacketOptions = {},
): PeopleCourtAdjudicationAdapter {
  return {
    async prepare(input) {
      const verified = await verifyX402DisputePacketIntegrity(
        input.packet,
        verificationOptions,
      );
      if (!verified.valid) {
        throw new PeopleCourtDisputeValidationError(verified.errors);
      }
      const packet = verified.value;
      const errors: string[] = [];
      if (packet.rail === "x402r") {
        errors.push(
          "x402r transactions must use the existing x402r referral path instead of Partner API filing.",
        );
      }
      if (
        !["clickthrough", "signed_document"].includes(
          packet.acceptance.proof.method,
        )
      ) {
        errors.push(
          "The hosted People’s Court filing adapter supports only clickthrough and signed_document acceptance until complete wallet and agent signature material can be retained and verified.",
        );
      }
      if (
        input.parties.claimant.externalId !== packet.parties.claimantId ||
        input.parties.respondent.externalId !== packet.parties.respondentId
      ) {
        errors.push("The filing parties do not match the x402 packet.");
      }
      if (
        input.amount.currency !== packet.disputedAmount.currency ||
        !decimalAmountMatchesNumber(
          packet.disputedAmount.value,
          input.amount.value,
        )
      ) {
        errors.push("The filing amount does not match the x402 packet.");
      }
      if (errors.length) {
        throw new PeopleCourtDisputeValidationError(errors);
      }
      const { idempotencyKey, packet: _packet, ...filing } = input;
      const response = await transport.prepareFiling(
        {
          ...filing,
          transactionId: packet.transactionId,
          x402DisputePacket: packet,
        },
        idempotencyKey,
      );
      return response.data;
    },

    async confirm(draftId, input) {
      const { idempotencyKey, ...confirmation } = input;
      const response = await transport.confirmFiling(
        draftId,
        confirmation,
        idempotencyKey,
      );
      return response.data;
    },

    async submitEvidence(caseId, input, idempotencyKey) {
      if (!transport.submitEvidence) {
        throw new Error(
          "The configured People’s Court transport does not support evidence submission.",
        );
      }
      return transport.submitEvidence(caseId, input, idempotencyKey);
    },

    async getCase(caseId) {
      return (await transport.getCase(caseId)).data;
    },

    async getServedAward(caseId) {
      return (await transport.getServedAward(caseId)).data;
    },
  };
}
