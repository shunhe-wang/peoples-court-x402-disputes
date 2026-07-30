import {
  createPeopleCourtAdjudicationAdapter,
  reportServedX402Award,
  type PeopleCourtPartnerTransport,
  type X402DisputePacketV1,
} from "../src/index.js";

/** Test-only artifact-to-filing-to-served-award example with no network calls. */
export async function runLocalArtifactToAwardExample(
  packet: X402DisputePacketV1,
) {
  const transport: PeopleCourtPartnerTransport = {
    async prepareFiling() {
      return {
        data: {
          draftId: "pfd_local_example",
          reservedCaseId: "pcase_local_example",
          draftDigest: "d".repeat(64),
          confirmationStatement: "Confirm the exact local example filing.",
          expiresAt: "2026-07-29T12:30:00.000Z",
          rules: {
            version: packet.declaration.rules.version,
            hash: packet.declaration.rules.hash,
          },
          fee: {},
        },
      };
    },
    async confirmFiling() {
      return {
        data: {
          caseId: "pcase_local_example",
          externalCaseId: packet.transactionId,
          status: "awaiting_party_response",
          accessSide: "claimant",
          rulesVersion: packet.declaration.rules.version,
          rulesHash: packet.declaration.rules.hash,
          createdAt: "2026-07-29T12:00:00.000Z",
        },
      };
    },
    async submitEvidence() {
      return { accepted: true };
    },
    async getCase(caseId) {
      return { data: { caseId, status: "decided" } };
    },
    async getServedAward(caseId) {
      return {
        data: {
          caseId,
          served: true,
          awardHash: "e".repeat(64),
        },
      };
    },
  };
  const adjudication = createPeopleCourtAdjudicationAdapter(transport);
  const prepared = await adjudication.prepare({
    packet,
    idempotencyKey: "local-prepare-example",
    externalCaseId: packet.transactionId,
    policyVersion: "local-policy-v1",
    authorityGrantId: "local-authority",
    consentArtifactIds: {
      claimant: "local-claimant-consent",
      respondent: "local-respondent-consent",
    },
    summary: "Test-only local x402 dispute.",
    amount: {
      value: Number(packet.disputedAmount.value),
      currency: "USD",
    },
    parties: {
      claimant: {
        externalId: packet.parties.claimantId,
        name: "Local Buyer",
      },
      respondent: {
        externalId: packet.parties.respondentId,
        name: "Local Seller",
      },
    },
    claim: {
      statement: "The local example resource was not delivered.",
      requestedOutcome: "refund",
    },
  });
  const confirmed = await adjudication.confirm(prepared.draftId, {
    draftDigest: prepared.draftDigest,
    confirmationStatement: prepared.confirmationStatement,
    actorId: "local-agent",
    principalId: packet.parties.claimantId,
    confirmationMethod: "protocol_act",
    confirmationReference: "local://confirmation/example",
    idempotencyKey: "local-confirm-example",
  });
  await adjudication.submitEvidence(
    confirmed.caseId,
    { brief: "Additional test-only evidence." },
    "local-evidence-example",
  );
  const servedAward = await adjudication.getServedAward(confirmed.caseId);
  const reported = await reportServedX402Award(
    {
      packet,
      servedAward,
      idempotencyKey: "local-report-example",
    },
    {
      executionMode: "partner_executes",
      executionOwner: packet.declaration.execution.owner,
      async verifyServedAward() {
        return {
          verified: true,
          caseId: confirmed.caseId,
          transactionId: packet.transactionId,
          awardHash: "e".repeat(64),
          manifestId: "aman_local_example",
          awardRevision: 1,
          signerAddress: `0x${"1".repeat(40)}`,
          trustPolicyId: "local-award-policy-v1",
        };
      },
      async reportServedAward(request) {
        return {
          reported: true,
          packetHash: request.packet.packetHash,
        };
      },
    },
  );
  return { prepared, confirmed, servedAward, reported };
}
