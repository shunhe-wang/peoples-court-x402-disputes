import type {
  PeopleCourtAdjudicationAdapter,
  PeopleCourtPartnerTransport,
  VerifyX402DisputePacketOptions,
  X402DisputePacketV1,
} from "./types.js";
import { usdDecimalToMinorUnits } from "./amount.js";
import { canonicalJson } from "./canonical.js";
import { verifyX402DisputePacketIntegrity } from "./packet.js";
import { PeopleCourtDisputeValidationError } from "./validation.js";

/** Filing metadata keys reserved for the packet binding. */
export const X402_FILING_METADATA_KEYS = {
  transactionId: "x402.transactionId",
  packetHash: "x402.packetHash",
  packetVersion: "x402.packetVersion",
} as const;

const RESERVED_METADATA_PREFIX = "x402.";

export const X402_PACKET_EVIDENCE_MEDIA_TYPE = "application/json";

export function x402PacketEvidenceFilename(packet: X402DisputePacketV1): string {
  return `x402-dispute-packet-${packet.packetHash.slice(0, 16)}.json`;
}

/**
 * UTF-8 bytes of the canonical JSON of the full packet. `packetHash` is the
 * SHA-256 of the same canonical JSON without the `packetHash` field.
 */
export function x402PacketEvidenceBytes(packet: X402DisputePacketV1): Uint8Array {
  return new TextEncoder().encode(canonicalJson(packet));
}

export function defaultX402PacketEvidenceBrief(packet: X402DisputePacketV1): string {
  return [
    `Exhibit: x402 dispute packet version ${packet.version} for transaction ${packet.transactionId}.`,
    `Packet hash: ${packet.packetHash}. The same hash was recorded in this filing's metadata (${X402_FILING_METADATA_KEYS.packetHash}) before the filing was confirmed.`,
    "The claimant's software (@peoples-court/x402-disputes) built this packet and checked its integrity and any EIP-712 offer or receipt signatures. People's Court did not independently verify the packet.",
    "Anyone can recompute the hash from the attached canonical JSON and recover EIP-712 signers offline.",
  ].join("\n");
}

async function verifiedPacket(
  packet: X402DisputePacketV1,
  options: VerifyX402DisputePacketOptions,
): Promise<X402DisputePacketV1> {
  const verified = await verifyX402DisputePacketIntegrity(packet, options);
  if (!verified.valid) throw new PeopleCourtDisputeValidationError(verified.errors);
  return verified.value;
}

export function createPeopleCourtAdjudicationAdapter(
  transport: PeopleCourtPartnerTransport,
  verificationOptions: VerifyX402DisputePacketOptions = {},
): PeopleCourtAdjudicationAdapter {
  async function submitEvidence(
    caseId: string,
    input: Parameters<PeopleCourtAdjudicationAdapter["submitEvidence"]>[1],
    idempotencyKey: string,
  ) {
    if (!transport.submitEvidence) {
      throw new Error(
        "The configured People’s Court transport does not support evidence submission.",
      );
    }
    return (await transport.submitEvidence(caseId, input, idempotencyKey)).data;
  }

  return {
    async prepare(input) {
      const packet = await verifiedPacket(input.packet, verificationOptions);
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
      // The hosted service has no trusted JWS identity policy, so a JWS artifact
      // labelled verified by the caller's verifier is not filed as verified.
      for (const [label, artifact] of [
        ["offer", packet.offer],
        ["receipt", packet.receipt],
      ] as const) {
        if (artifact?.status === "verified" && artifact.artifact?.format === "jws") {
          errors.push(
            `The hosted filing adapter does not file a packet whose ${label} claims a verified JWS signature; use EIP-712 or leave the JWS unverified.`,
          );
        }
      }
      if (
        input.parties.claimant.externalId !== packet.parties.claimantId ||
        input.parties.respondent.externalId !== packet.parties.respondentId
      ) {
        errors.push("The filing parties do not match the x402 packet.");
      }
      const minorUnits =
        packet.disputedAmount.currency === "USD"
          ? usdDecimalToMinorUnits(packet.disputedAmount.value)
          : null;
      if (minorUnits === null || minorUnits === "0") {
        errors.push(
          "The hosted filing adapter requires a positive USD disputed amount with at most two decimal places.",
        );
      }
      const callerMetadata = input.metadata ?? {};
      if (
        Object.keys(callerMetadata).some((key) =>
          key.startsWith(RESERVED_METADATA_PREFIX),
        )
      ) {
        errors.push(
          `Filing metadata keys starting with "${RESERVED_METADATA_PREFIX}" are reserved for the packet binding.`,
        );
      }
      if (errors.length) {
        throw new PeopleCourtDisputeValidationError(errors);
      }
      const { idempotencyKey, packet: _packet, metadata: _metadata, ...filing } =
        input;
      const response = await transport.prepareFiling(
        {
          ...filing,
          transactionId: packet.transactionId,
          claimAmount: { currency: "USD", minorUnits: minorUnits! },
          metadata: {
            ...callerMetadata,
            [X402_FILING_METADATA_KEYS.transactionId]: packet.transactionId,
            [X402_FILING_METADATA_KEYS.packetHash]: packet.packetHash,
            [X402_FILING_METADATA_KEYS.packetVersion]: String(packet.version),
          },
        },
        idempotencyKey,
      );
      return response.data;
    },

    async confirm(draftId, input) {
      const draft = (await transport.getFiling(draftId)).data;
      const confirmation = draft.confirmations?.find(
        (row) => row.side === "claimant",
      );
      const participant = draft.participants?.find(
        (row) => row.side === "claimant",
      );
      if (!confirmation || !participant) {
        throw new Error(
          "The filing draft does not list a claimant participant to confirm.",
        );
      }
      const actorId = input.actorId ?? participant.agentId;
      if (!actorId) {
        throw new Error(
          "actorId is required when the claimant participant has no immutable agent ID.",
        );
      }
      const response = await transport.confirmFiling(
        draftId,
        {
          participantId: confirmation.participantId,
          draftDigest: draft.draftDigest,
          // The API requires the exact server-issued statement, never a reconstruction.
          confirmationStatement: confirmation.confirmationStatement,
          actorId,
          principalId: input.principalId ?? participant.principalId,
          confirmationMethod: "protocol_act",
          confirmationReference: input.confirmationReference,
        },
        input.idempotencyKey,
      );
      return response.data;
    },

    async submitPacketEvidence(caseId, input, idempotencyKey) {
      const packet = await verifiedPacket(input.packet, verificationOptions);
      return submitEvidence(
        caseId,
        {
          party: "claimant",
          brief: input.brief ?? defaultX402PacketEvidenceBrief(packet),
          files: [
            {
              filename: x402PacketEvidenceFilename(packet),
              mediaType: X402_PACKET_EVIDENCE_MEDIA_TYPE,
              bytes: x402PacketEvidenceBytes(packet),
            },
          ],
        },
        idempotencyKey,
      );
    },

    submitEvidence,

    async getCase(caseId) {
      return (await transport.getCase(caseId)).data;
    },

    async getServedAward(caseId) {
      return (await transport.getServedAward(caseId)).data;
    },
  };
}
