import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
} from "@x402/core/types";

import {
  findSelectedSignedOffer,
  inspectSignedOffer,
  inspectSignedReceipt,
} from "./artifacts.js";
import {
  canonicalJson,
  canonicalSha256,
  packetHashPayload,
} from "./canonical.js";
import {
  extractPeopleCourtDisputeExtension,
  verifyAcceptanceBindings,
} from "./extension.js";
import {
  MAX_X402_DISPUTE_PACKET_BYTES,
  X402_DISPUTE_PACKET_VERSION,
  type BuildX402DisputePacketInput,
  type ExecutionMode,
  type InspectedOfferArtifact,
  type PeopleCourtDisputeAcceptanceV1,
  type PeopleCourtDisputeDeclarationV1,
  type ValidationResult,
  type VerifiedOfferArtifact,
  type VerifyX402DisputePacketOptions,
  type X402DisputePacketV1,
} from "./types.js";
import {
  PeopleCourtDisputeValidationError,
  validateX402DisputePacketStructure,
} from "./validation.js";

function requirementCopy(
  requirement: PaymentRequirements,
): PaymentRequirements {
  return {
    scheme: requirement.scheme,
    network: requirement.network,
    asset: requirement.asset,
    amount: requirement.amount,
    payTo: requirement.payTo,
    maxTimeoutSeconds: requirement.maxTimeoutSeconds,
    extra: { ...requirement.extra },
  };
}

function requirementMatches(
  left: PaymentRequirements,
  right: PaymentRequirements,
): boolean {
  return (
    left.scheme === right.scheme &&
    left.network === right.network &&
    left.asset === right.asset &&
    left.amount === right.amount &&
    left.payTo === right.payTo &&
    left.maxTimeoutSeconds === right.maxTimeoutSeconds &&
    canonicalJson(left.extra) === canonicalJson(right.extra)
  );
}

function narrowExactOfferArtifact(
  inspected: InspectedOfferArtifact,
): VerifiedOfferArtifact {
  const artifact =
    inspected.artifact?.format === "eip712"
      ? {
          ...inspected.artifact,
          payload: {
            ...inspected.artifact.payload,
            scheme: "exact" as const,
          },
        }
      : inspected.artifact;
  const payload =
    inspected.payload === undefined
      ? undefined
      : {
          ...inspected.payload,
          scheme: "exact" as const,
        };
  return {
    status: inspected.status,
    ...(artifact === undefined ? {} : { artifact }),
    ...(inspected.artifactHash === undefined
      ? {}
      : { artifactHash: inspected.artifactHash }),
    ...(payload === undefined ? {} : { payload }),
    ...(inspected.signer === undefined ? {} : { signer: inspected.signer }),
    ...(inspected.errorCode === undefined
      ? {}
      : { errorCode: inspected.errorCode }),
  };
}

function extractAcceptedExtension(
  paymentRequired: PaymentRequired,
  paymentPayload: PaymentPayload,
): {
  declaration: PeopleCourtDisputeDeclarationV1;
  acceptance: PeopleCourtDisputeAcceptanceV1;
} {
  const declared = extractPeopleCourtDisputeExtension(
    paymentRequired.extensions,
  );
  if (!declared.valid) {
    throw new PeopleCourtDisputeValidationError(declared.errors);
  }
  const accepted = extractPeopleCourtDisputeExtension(
    paymentPayload.extensions,
    { requireAcceptance: true },
  );
  if (!accepted.valid) {
    throw new PeopleCourtDisputeValidationError(accepted.errors);
  }
  const acceptance = accepted.value.info.acceptance;
  if (!acceptance) {
    throw new PeopleCourtDisputeValidationError([
      "The payment payload does not contain an acceptance.",
    ]);
  }
  return {
    declaration: declared.value.info.declaration,
    acceptance,
  };
}

function validateRailAndExecution(
  rail: "x402" | "x402r",
  executionMode: ExecutionMode,
  declaration: PeopleCourtDisputeDeclarationV1,
): string[] {
  const errors: string[] = [];
  if (!declaration.execution.modes.includes(executionMode)) {
    errors.push("The selected execution mode was not declared.");
  }
  if (rail === "x402r" && executionMode !== "x402r") {
    errors.push("An x402r packet must preserve x402r as its execution mode.");
  }
  if (
    rail === "x402r" &&
    declaration.execution.owner.toLowerCase() !== "x402r"
  ) {
    errors.push("An x402r packet must preserve x402r as its execution owner.");
  }
  if (rail === "x402" && executionMode === "x402r") {
    errors.push("An ordinary x402 packet cannot claim x402r execution.");
  }
  if (
    rail === "x402" &&
    declaration.execution.owner.toLowerCase() === "x402r"
  ) {
    errors.push("An ordinary x402 packet cannot claim x402r ownership.");
  }
  return errors;
}

export async function verifyX402DisputePacketIntegrity(
  value: unknown,
  options: VerifyX402DisputePacketOptions = {},
): Promise<ValidationResult<X402DisputePacketV1>> {
  const structural = validateX402DisputePacketStructure(value);
  if (!structural.valid) return structural;
  const packet = structural.value;
  const errors: string[] = [];
  const declarationHash = await canonicalSha256(packet.declaration);
  if (packet.declarationHash !== declarationHash) {
    errors.push("packet.declarationHash does not match the declaration");
  }
  const statementHash = await canonicalSha256(packet.acceptance.statement);
  if (packet.acceptance.statementHash !== statementHash) {
    errors.push("packet.acceptance.statementHash does not match the statement");
  }
  const requirementDigest = await canonicalSha256({
    x402Version: 2,
    resource: { url: packet.resourceUrl },
    accepted: {
      scheme: packet.payment.scheme,
      network:
        packet.payment.network as PaymentRequirements["network"],
      asset: packet.payment.asset,
      amount: packet.payment.amount,
      payTo: packet.payment.payTo,
      maxTimeoutSeconds: packet.payment.maxTimeoutSeconds,
      extraHash: packet.payment.extraHash,
    },
    declarationHash,
  });
  if (packet.paymentRequirementHash !== requirementDigest) {
    errors.push(
      "packet.paymentRequirementHash does not match the payment binding",
    );
  }
  if (
    packet.acceptance.statement.paymentRequirementHash !==
      packet.paymentRequirementHash ||
    packet.acceptance.statement.declarationHash !== packet.declarationHash ||
    packet.acceptance.statement.resourceUrl !== packet.resourceUrl ||
    packet.acceptance.statement.transactionId !== packet.transactionId ||
    packet.acceptance.statement.payerId !== packet.parties.claimantId ||
    packet.acceptance.statement.counterpartyId !==
      packet.parties.respondentId ||
    packet.acceptance.statement.scheme !== packet.payment.scheme ||
    packet.acceptance.statement.network !== packet.payment.network ||
    packet.acceptance.statement.asset !== packet.payment.asset ||
    packet.acceptance.statement.amount !== packet.payment.amount ||
    packet.acceptance.statement.payTo !== packet.payment.payTo ||
    packet.acceptance.statement.rulesVersion !==
      packet.declaration.rules.version ||
    packet.acceptance.statement.rulesHash !== packet.declaration.rules.hash ||
    packet.acceptance.statement.termsVersion !==
      packet.declaration.terms.version ||
    packet.acceptance.statement.termsHash !== packet.declaration.terms.hash ||
    packet.acceptance.statement.scope !== packet.declaration.scope ||
    packet.declaration.seller.id !== packet.parties.respondentId
  ) {
    errors.push("packet acceptance, parties, payment, or declaration do not cross-bind");
  }
  if (packet.settlement.network !== packet.payment.network) {
    errors.push("packet settlement network does not match the payment network");
  }
  if (packet.createdAt !== packet.settlement.settledAt) {
    errors.push("packet creation time does not match the settlement observation");
  }
  if (
    Date.parse(packet.acceptance.statement.acceptedAt) >
    Date.parse(packet.settlement.settledAt) + 5 * 60 * 1000
  ) {
    errors.push("packet acceptance occurs after the permitted settlement skew");
  }
  if (
    Date.parse(packet.settlement.settledAt) -
      Date.parse(packet.acceptance.statement.acceptedAt) >
    (packet.payment.maxTimeoutSeconds + 5 * 60) * 1000
  ) {
    errors.push("packet acceptance is stale relative to settlement");
  }
  if (!packet.declaration.supportedClaims.includes(packet.claimClass)) {
    errors.push("packet claim class was not declared");
  }
  errors.push(
    ...validateRailAndExecution(
      packet.rail,
      packet.executionMode,
      packet.declaration,
    ),
  );
  if (packet.acceptanceVerification.status === "invalid") {
    errors.push("packet acceptance verification is invalid");
  }
  if (
    packet.acceptanceVerification.status === "verified" &&
    (!options.verifyAcceptanceProof ||
      !(await options.verifyAcceptanceProof(
        packet.acceptance,
        packet.acceptanceVerification,
      )))
  ) {
    errors.push(
      "packet acceptance verification cannot be reproduced by a trusted verifier",
    );
  }
  if (packet.offer.status === "invalid") {
    errors.push("packet signed offer is invalid");
  }
  if (packet.receipt.status === "invalid") {
    errors.push("packet signed receipt is invalid");
  }
  if (
    packet.declaration.evidence.offerReceipt === "required" &&
    (packet.offer.status !== "verified" ||
      packet.receipt.status !== "verified")
  ) {
    errors.push(
      "packet requires locally verified signed offer and receipt artifacts",
    );
  }
  if (
    packet.offer.payload &&
    (packet.offer.payload.resourceUrl !== packet.resourceUrl ||
      packet.offer.payload.scheme !== packet.payment.scheme ||
      packet.offer.payload.network !== packet.payment.network ||
      packet.offer.payload.asset !== packet.payment.asset ||
      packet.offer.payload.amount !== packet.payment.amount ||
      packet.offer.payload.payTo !== packet.payment.payTo)
  ) {
    errors.push("packet offer payload does not match the payment");
  }
  if (
    packet.receipt.payload &&
    (packet.receipt.payload.resourceUrl !== packet.resourceUrl ||
      packet.receipt.payload.network !== packet.payment.network ||
      (packet.receipt.payload.transaction &&
        packet.receipt.payload.transaction.toLowerCase() !==
          packet.settlement.transaction.toLowerCase()))
  ) {
    errors.push("packet receipt payload does not match the settlement");
  }
  const reinspectedOffer = await inspectSignedOffer({
    ...(packet.offer.artifact === undefined
      ? {}
      : { offer: packet.offer.artifact }),
    resourceUrl: packet.resourceUrl,
    requirement: {
      scheme: packet.payment.scheme,
      network:
        packet.payment.network as PaymentRequirements["network"],
      asset: packet.payment.asset,
      amount: packet.payment.amount,
      payTo: packet.payment.payTo,
      maxTimeoutSeconds: packet.payment.maxTimeoutSeconds,
      extra: {},
    },
    acceptedAt: packet.acceptance.statement.acceptedAt,
    ...(options.verifyJwsOffer === undefined
      ? {}
      : { verifyJws: options.verifyJwsOffer }),
  });
  if (canonicalJson(reinspectedOffer) !== canonicalJson(packet.offer)) {
    errors.push(
      "packet signed offer status, signature, hash, or payload cannot be reproduced",
    );
  }
  const reinspectedReceipt = await inspectSignedReceipt({
    ...(packet.receipt.artifact === undefined
      ? {}
      : { receipt: packet.receipt.artifact }),
    resourceUrl: packet.resourceUrl,
    network: packet.settlement.network,
    transaction: packet.settlement.transaction,
    settledAt: packet.settlement.settledAt,
    ...(packet.settlement.payer === undefined
      ? {}
      : { payer: packet.settlement.payer }),
    ...(options.verifyJwsReceipt === undefined
      ? {}
      : { verifyJws: options.verifyJwsReceipt }),
  });
  if (canonicalJson(reinspectedReceipt) !== canonicalJson(packet.receipt)) {
    errors.push(
      "packet signed receipt status, signature, hash, or payload cannot be reproduced",
    );
  }
  const expectedPacketHash = await canonicalSha256(packetHashPayload(packet));
  if (packet.packetHash !== expectedPacketHash) {
    errors.push("packet.packetHash does not match the canonical packet");
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: packet };
}

export async function buildX402DisputePacket(
  input: BuildX402DisputePacketInput,
): Promise<X402DisputePacketV1> {
  if (
    input.paymentRequired.x402Version !== 2 ||
    input.paymentPayload.x402Version !== 2
  ) {
    throw new PeopleCourtDisputeValidationError([
      "Only x402 v2 payment records are supported.",
    ]);
  }
  if (!input.settlement.success || !input.settlement.transaction) {
    throw new PeopleCourtDisputeValidationError([
      "A successful settlement reference is required.",
    ]);
  }
  if (
    !input.paymentRequired.accepts.some((candidate) =>
      requirementMatches(candidate, input.paymentPayload.accepted),
    )
  ) {
    throw new PeopleCourtDisputeValidationError([
      "The payment payload did not accept a requirement from the 402 response.",
    ]);
  }
  if (
    !input.paymentPayload.resource ||
    input.paymentPayload.resource.url !==
      input.paymentRequired.resource.url
  ) {
    throw new PeopleCourtDisputeValidationError([
      "The payment payload did not echo the exact 402 resource URL.",
    ]);
  }
  const { declaration, acceptance } = extractAcceptedExtension(
    input.paymentRequired,
    input.paymentPayload,
  );
  const acceptanceBinding = await verifyAcceptanceBindings({
    declaration,
    acceptance,
    resourceUrl: input.paymentRequired.resource.url,
    requirement: input.paymentPayload.accepted,
  });
  if (!acceptanceBinding.valid) {
    throw new PeopleCourtDisputeValidationError(acceptanceBinding.errors);
  }
  const executionErrors = validateRailAndExecution(
    input.rail,
    input.executionMode,
    declaration,
  );
  if (executionErrors.length) {
    throw new PeopleCourtDisputeValidationError(executionErrors);
  }
  if (
    !declaration.supportedClaims.includes(input.claimClass)
  ) {
    throw new PeopleCourtDisputeValidationError([
      "The claim class was not declared for this resource.",
    ]);
  }
  if (input.settlement.network !== input.paymentPayload.accepted.network) {
    throw new PeopleCourtDisputeValidationError([
      "The settlement network does not match the accepted payment requirement.",
    ]);
  }
  const selectedOffer =
    input.offer ??
    findSelectedSignedOffer(
      input.paymentRequired,
      input.paymentPayload.accepted,
    );
  const inspectedOffer = await inspectSignedOffer({
    ...(selectedOffer === undefined ? {} : { offer: selectedOffer }),
    resourceUrl: input.paymentRequired.resource.url,
    requirement: input.paymentPayload.accepted,
    acceptedAt: acceptance.statement.acceptedAt,
    ...(input.verifyJwsOffer === undefined
      ? {}
      : { verifyJws: input.verifyJwsOffer }),
  });
  const receipt = await inspectSignedReceipt({
    ...(input.receipt === undefined ? {} : { receipt: input.receipt }),
    resourceUrl: input.paymentRequired.resource.url,
    network: input.settlement.network,
    transaction: input.settlement.transaction,
    settledAt: input.settledAt,
    ...(input.settlement.payer === undefined
      ? {}
      : { payer: input.settlement.payer }),
    ...(input.verifyJwsReceipt === undefined
      ? {}
      : { verifyJws: input.verifyJwsReceipt }),
  });
  if (inspectedOffer.status === "invalid" || receipt.status === "invalid") {
    throw new PeopleCourtDisputeValidationError([
      inspectedOffer.status === "invalid"
        ? `Signed offer is invalid: ${inspectedOffer.errorCode ?? "unknown"}`
        : "",
      receipt.status === "invalid"
        ? `Signed receipt is invalid: ${receipt.errorCode ?? "unknown"}`
        : "",
    ].filter(Boolean));
  }
  if (
    declaration.evidence.offerReceipt === "required" &&
    (inspectedOffer.status !== "verified" ||
      receipt.status !== "verified")
  ) {
    throw new PeopleCourtDisputeValidationError([
      "This resource requires locally verified signed offer and receipt artifacts.",
    ]);
  }
  const offer = narrowExactOfferArtifact(inspectedOffer);
  const requirement = requirementCopy(input.paymentPayload.accepted);
  const declarationHash = await canonicalSha256(declaration);
  const unsigned = {
    version: X402_DISPUTE_PACKET_VERSION,
    protocol: "x402",
    x402Version: 2,
    rail: input.rail,
    transactionId: acceptance.statement.transactionId,
    createdAt: input.settledAt,
    resourceUrl: input.paymentRequired.resource.url,
    claimClass: input.claimClass,
    parties: {
      claimantId: acceptance.statement.payerId,
      respondentId: acceptance.statement.counterpartyId,
    },
    disputedAmount: {
      value: input.disputedAmount.value,
      currency: input.disputedAmount.currency.toUpperCase(),
    },
    payment: {
      scheme: "exact",
      network: requirement.network,
      asset: requirement.asset,
      amount: requirement.amount,
      payTo: requirement.payTo,
      maxTimeoutSeconds: requirement.maxTimeoutSeconds,
      extraHash: await canonicalSha256(requirement.extra),
    },
    executionMode:
      input.executionMode as X402DisputePacketV1["executionMode"],
    paymentRequirementHash: acceptance.statement.paymentRequirementHash,
    paymentPayloadHash: await canonicalSha256(input.paymentPayload),
    authorizationHash: await canonicalSha256(input.paymentPayload.payload),
    settlement: {
      transaction: input.settlement.transaction,
      network: input.settlement.network,
      ...(input.settlement.payer === undefined
        ? {}
        : { payer: input.settlement.payer }),
      settledAt: input.settledAt,
    },
    declaration,
    declarationHash,
    acceptance,
    acceptanceVerification: {
      status: "unverified",
    },
    offer,
    receipt,
    evidence: input.evidence ?? [],
  } as const;
  const packet: X402DisputePacketV1 = {
    ...unsigned,
    packetHash: await canonicalSha256(unsigned),
  };
  const canonicalBytes = new TextEncoder().encode(
    canonicalJson(packet),
  ).byteLength;
  if (canonicalBytes > MAX_X402_DISPUTE_PACKET_BYTES) {
    throw new PeopleCourtDisputeValidationError([
      `The packet exceeds ${MAX_X402_DISPUTE_PACKET_BYTES} bytes.`,
    ]);
  }
  const verified = await verifyX402DisputePacketIntegrity(packet, {
    ...(input.verifyJwsOffer === undefined
      ? {}
      : { verifyJwsOffer: input.verifyJwsOffer }),
    ...(input.verifyJwsReceipt === undefined
      ? {}
      : { verifyJwsReceipt: input.verifyJwsReceipt }),
  });
  if (!verified.valid) {
    throw new PeopleCourtDisputeValidationError(verified.errors);
  }
  return verified.value;
}
