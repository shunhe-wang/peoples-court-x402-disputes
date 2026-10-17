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
  const draft = {
    draftId: "pfd_local_example",
    reservedCaseId: "pcase_local_example",
    externalCaseId: packet.transactionId,
    status: "awaiting_confirmations",
    draftDigest: "d".repeat(64),
    expiresAt: "2026-07-29T12:30:00.000Z",
    rules: {
      version: packet.declaration.rules.version,
      hash: packet.declaration.rules.hash,
    },
    fee: {},
    participants: [
      {
        participantId: "pcase_local_example:claimant",
        side: "claimant" as const,
        principalId: packet.parties.claimantId,
        agentId: "local-agent",
      },
    ],
    confirmations: [
      {
        participantId: "pcase_local_example:claimant",
        side: "claimant" as const,
        required: true,
        status: "pending",
        confirmationStatement: "Confirm the exact local example filing.",
      },
    ],
    hostedAcceptanceUrl: "https://court.example/accept/filing/pfd_local_example#token=local",
  };
  const transport: PeopleCourtPartnerTransport = {
    async prepareFiling() {
      return { data: draft };
    },
    async getFiling() {
      return { data: draft };
    },
    async confirmFiling() {
      return {
        data: {
          caseId: "pcase_local_example",
          externalCaseId: packet.transactionId,
          status: "awaiting_party_response",
          rules: {
            version: packet.declaration.rules.version,
            hash: packet.declaration.rules.hash,
          },
          createdAt: "2026-07-29T12:00:00.000Z",
        },
      };
    },
    async submitEvidence() {
      return { data: { accepted: true } };
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
    consentArtifactIds: { claimant: "local-claimant-consent" },
    claimantAcceptanceIdentity: { email: "buyer@example.test" },
    intakeMode: "claimant_initiated",
    confirmationPolicy: { mode: "initiator_only" },
    summary: "Test-only local x402 dispute.",
    parties: {
      claimant: {
        externalId: packet.parties.claimantId,
        name: "Local Buyer",
        principalKind: "individual",
      },
      respondent: {
        externalId: packet.parties.respondentId,
        name: "Local Seller",
        principalKind: "organization",
      },
    },
    claim: {
      statement: "The local example resource was not delivered.",
      requestedOutcome: "refund",
    },
  });
  const confirmed = await adjudication.confirm(prepared.draftId, {
    confirmationReference: "local://confirmation/example",
    idempotencyKey: "local-confirm-example",
  });
  if (!confirmed.caseId) throw new Error("The local example case did not open.");
  const caseId = confirmed.caseId;
  await adjudication.submitPacketEvidence(
    caseId,
    { packet },
    "local-evidence-example",
  );
  const servedAward = await adjudication.getServedAward(caseId);
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
          caseId,
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
