import {
  createPeopleCourtDisputeClientExtension,
  type PeopleCourtDisputeAcceptanceProofV1,
} from "../src/index.js";

export function createMerchantDisputeClient(input: {
  payerId: string;
  sellerId: string;
  transactionId: string;
  recordAcceptance: (record: {
    statementHash: string;
    signingMessage: string;
  }) => Promise<PeopleCourtDisputeAcceptanceProofV1>;
}) {
  return createPeopleCourtDisputeClientExtension({
    payerId: input.payerId,
    counterpartyId: input.sellerId,
    transactionId: input.transactionId,
    createProof: async ({ statementHash, signingMessage }) =>
      input.recordAcceptance({ statementHash, signingMessage }),
  });
}
