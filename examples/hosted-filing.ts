import {
  createPeopleCourtAdjudicationAdapter,
  createPeopleCourtHttpTransport,
  type X402DisputePacketV1,
} from "../src/index.js";

/**
 * Hosted filing for an ordinary x402 payment, in the order the People’s Court
 * API requires. The forum, not this package, checks the partner credential,
 * policy, authority grant, claimant consent record, and hosted acceptance.
 */
export function createHostedX402Filing(config: {
  baseUrl: string;
  apiKey: string;
  policyVersion: string;
  authorityGrantId: string;
  claimantConsentId: string;
  claimantEmail: string;
  claimantAccountId?: string;
}) {
  const adjudication = createPeopleCourtAdjudicationAdapter(
    createPeopleCourtHttpTransport({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
    }),
  );

  return {
    /** Step 1: prepare the filing. Send `hostedAcceptanceUrl` to the buyer. */
    prepare(packet: X402DisputePacketV1) {
      return adjudication.prepare({
        packet,
        idempotencyKey: `prepare-${packet.packetHash}`,
        externalCaseId: packet.transactionId,
        policyVersion: config.policyVersion,
        authorityGrantId: config.authorityGrantId,
        consentArtifactIds: { claimant: config.claimantConsentId },
        claimantAcceptanceIdentity: {
          email: config.claimantEmail,
          ...(config.claimantAccountId === undefined
            ? {}
            : { accountId: config.claimantAccountId }),
        },
        intakeMode: "claimant_initiated",
        confirmationPolicy: { mode: "initiator_only" },
        summary: "The purchased response did not satisfy the declared specification.",
        parties: {
          claimant: {
            externalId: packet.parties.claimantId,
            name: "Buyer",
            principalKind: "individual",
          },
          respondent: {
            externalId: packet.parties.respondentId,
            name: "Merchant",
            principalKind: "organization",
          },
        },
        claim: {
          statement: "The delivered result omitted the purchased data.",
          requestedOutcome: "refund",
        },
      });
    },

    /** Step 2: after the buyer accepts, confirm the exact draft to open the case. */
    confirm(draftId: string, packet: X402DisputePacketV1) {
      return adjudication.confirm(draftId, {
        confirmationReference: `x402:${packet.transactionId}`,
        idempotencyKey: `confirm-${draftId}`,
      });
    },

    /** Step 3: in the evidence stage, file the packet as a claimant exhibit. */
    fileExhibit(caseId: string, packet: X402DisputePacketV1) {
      return adjudication.submitPacketEvidence(
        caseId,
        { packet },
        `exhibit-${packet.packetHash}`,
      );
    },

    getCase: adjudication.getCase,
  };
}
