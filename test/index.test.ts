import assert from "node:assert/strict";

import {
  createOfferEIP712,
  createReceiptEIP712,
} from "@x402/extensions/offer-receipt";
import Ajv2020 from "ajv/dist/2020.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import {
  PEOPLE_COURT_DISPUTE,
  buildX402DisputePacket,
  canonicalSha256,
  createPeopleCourtAdjudicationAdapter,
  createPeopleCourtDisputeClientExtension,
  createPeopleCourtDisputeResourceServerExtension,
  declarePeopleCourtDisputeExtension,
  packetHashPayload,
  paymentRequirementHash,
  peopleCourtDisputeExtensionSchema,
  reportServedX402Award,
  validatePeopleCourtDisputeDeclaration,
  validatePeopleCourtDisputeExtension,
  validateX402DisputePacketStructure,
  verifyAcceptanceBindings,
  verifyX402DisputePacketIntegrity,
  type PeopleCourtDisputeDeclarationV1,
  type X402DisputePacketV1,
} from "../src/index.js";
import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
} from "@x402/core/types";
import { runLocalArtifactToAwardExample } from "../examples/end-to-end-local.js";

const NOW = new Date("2026-07-29T12:00:00.000Z");
const RESOURCE_URL = "https://merchant.example/api/report";
const SELLER = "seller-principal";
const BUYER = "buyer-principal";
const TRANSACTION_ID = "merchant-order-0001";
const TX_HASH = `0x${"ab".repeat(32)}`;
const TEST_ACCOUNT = privateKeyToAccount(generatePrivateKey());

function declaration(
  overrides: Partial<PeopleCourtDisputeDeclarationV1> = {},
): PeopleCourtDisputeDeclarationV1 {
  return {
    version: 1,
    provider: {
      id: "peoples-court",
      name: "People's Court",
      forumUrl: "https://court.example",
      apiVersion: "2026-07-23",
    },
    seller: {
      id: SELLER,
      name: "Merchant",
    },
    rules: {
      id: "arbitral-rules-v0.21",
      version: "0.21",
      hash: "a".repeat(64),
      url: "https://court.example/rules",
    },
    terms: {
      version: "merchant-terms-v1",
      hash: "b".repeat(64),
      url: "https://merchant.example/dispute-terms",
    },
    scope: `Claims arising from transaction ${TRANSACTION_ID}`,
    supportedClaims: [
      "nonperformance",
      "defective_performance",
      "refund_dispute",
    ],
    filingWindow: {
      startsAt: "settlement",
      durationSeconds: 30 * 24 * 60 * 60,
    },
    evidence: {
      offerReceipt: "recommended",
      paymentPayload: "hash_only",
      settlementReference: "required",
    },
    execution: {
      owner: "merchant-platform",
      modes: ["partner_executes"],
      automatic: false,
    },
    resourceBinding: "exact_url",
    privacyNoticeUrl: "https://court.example/privacy",
    ...overrides,
  };
}

const requirement: PaymentRequirements = {
  scheme: "exact",
  network: "eip155:84532",
  asset: "0x1234567890123456789012345678901234567890",
  amount: "250000000",
  payTo: "0x2222222222222222222222222222222222222222",
  maxTimeoutSeconds: 300,
  extra: {
    name: "USDC",
    version: "2",
  },
};

function paymentRequired(
  terms = declaration(),
  extraExtensions: Record<string, unknown> = {},
): PaymentRequired {
  return {
    x402Version: 2,
    resource: {
      url: RESOURCE_URL,
      description: "Generate a report",
      mimeType: "application/json",
    },
    accepts: [requirement],
    extensions: {
      ...declarePeopleCourtDisputeExtension(terms),
      ...extraExtensions,
    },
  };
}

async function acceptedPayment(
  required: PaymentRequired,
  acceptedAt = NOW,
): Promise<PaymentPayload> {
  const base: PaymentPayload = {
    x402Version: 2,
    resource: required.resource,
    accepted: requirement,
    payload: {
      authorization: {
        from: TEST_ACCOUNT.address,
        to: requirement.payTo,
        nonce: "1",
      },
      signature: `0x${"12".repeat(65)}`,
    },
    extensions: required.extensions,
  };
  const extension = createPeopleCourtDisputeClientExtension({
    payerId: BUYER,
    counterpartyId: SELLER,
    transactionId: TRANSACTION_ID,
    now: () => acceptedAt,
    nonce: () => "acceptance_nonce_00000001",
    createProof: async ({
      declaration: presentedDeclaration,
      statementHash,
      materialLimitations,
    }) => {
      assert.equal(presentedDeclaration.provider.id, "peoples-court");
      assert.equal(presentedDeclaration.execution.automatic, false);
      assert.ok(
        materialLimitations.some((item) =>
          item.includes("not automatically refundable"),
        ),
      );
      return {
        method: "clickthrough",
        artifactRef: "merchant://acceptance/order-0001",
        artifactHash: await canonicalSha256({
          event: "merchant-clickthrough",
          statementHash,
        }),
        signerId: BUYER,
      };
    },
  });
  assert.ok(extension.enrichPaymentPayload);
  return extension.enrichPaymentPayload(base, required);
}

function settlement(
  settledAt = NOW.toISOString(),
): SettleResponse & { settledAt: string } {
  return {
    success: true,
    payer: TEST_ACCOUNT.address,
    transaction: TX_HASH,
    network: requirement.network,
    settledAt,
  };
}

async function extensionContract(): Promise<void> {
  const terms = declaration();
  assert.equal(validatePeopleCourtDisputeDeclaration(terms).valid, true);
  assert.equal(
    validatePeopleCourtDisputeDeclaration({
      ...terms,
      automaticRefund: true,
    }).valid,
    false,
  );
  const required = paymentRequired(terms);
  const payload = await acceptedPayment(required);
  const extension = payload.extensions?.[PEOPLE_COURT_DISPUTE] as {
    info: { acceptance: NonNullable<unknown> };
  };
  assert.ok(extension.info.acceptance);
  const acceptance = extension.info.acceptance as Parameters<
    typeof verifyAcceptanceBindings
  >[0]["acceptance"];
  const bound = await verifyAcceptanceBindings({
    declaration: terms,
    acceptance,
    resourceUrl: RESOURCE_URL,
    requirement,
    now: NOW,
  });
  assert.equal(bound.valid, true);

  const server = createPeopleCourtDisputeResourceServerExtension({
    now: () => NOW,
  });
  const hookResult = await server.hooks?.onBeforeVerify?.(
    required.extensions?.[PEOPLE_COURT_DISPUTE],
    {
      paymentPayload: payload,
      requirements: requirement,
      declaredExtensions: required.extensions ?? {},
    },
  );
  assert.equal(hookResult, undefined);

  const tamperedPayload = structuredClone(payload);
  const tampered = tamperedPayload.extensions?.[
    PEOPLE_COURT_DISPUTE
  ] as {
    info: {
      acceptance: {
        statement: { resourceUrl: string };
      };
    };
  };
  tampered.info.acceptance.statement.resourceUrl =
    "https://attacker.example/resource";
  const rejected = await server.hooks?.onBeforeVerify?.(
    required.extensions?.[PEOPLE_COURT_DISPUTE],
    {
      paymentPayload: tamperedPayload,
      requirements: requirement,
      declaredExtensions: required.extensions ?? {},
    },
  );
  assert.deepEqual(
    rejected && "abort" in rejected
      ? { abort: rejected.abort, reason: rejected.reason }
      : rejected,
    {
      abort: true,
      reason: "peoples_court_dispute_acceptance_invalid",
    },
  );

  const missingResource = structuredClone(payload);
  delete missingResource.resource;
  const missingResourceRejected =
    await server.hooks?.onBeforeVerify?.(
      required.extensions?.[PEOPLE_COURT_DISPUTE],
      {
        paymentPayload: missingResource,
        requirements: requirement,
        declaredExtensions: required.extensions ?? {},
      },
    );
  assert.deepEqual(
    missingResourceRejected &&
      "abort" in missingResourceRejected
      ? {
          abort: missingResourceRejected.abort,
          reason: missingResourceRejected.reason,
        }
      : missingResourceRejected,
    {
      abort: true,
      reason: "peoples_court_dispute_acceptance_invalid",
    },
  );

  const hashA = await paymentRequirementHash({
    x402Version: 2,
    resourceUrl: RESOURCE_URL,
    requirement,
    declaration: terms,
  });
  const hashB = await paymentRequirementHash({
    x402Version: 2,
    resourceUrl: RESOURCE_URL,
    requirement: {
      ...requirement,
      extra: { version: "2", name: "USDC" },
    },
    declaration: terms,
  });
  assert.equal(hashA, hashB);
}

async function schemaParityContract(): Promise<void> {
  const required = paymentRequired();
  const payload = await acceptedPayment(required);
  const extension = structuredClone(
    payload.extensions?.[PEOPLE_COURT_DISPUTE],
  ) as {
    info: Record<string, any>;
    schema: Record<string, unknown>;
  };
  const ajv = new Ajv2020({
    strict: false,
    allErrors: true,
    validateFormats: false,
  });
  const validateSchema = ajv.compile(peopleCourtDisputeExtensionSchema);
  assert.equal(validateSchema(extension.info), true);
  assert.equal(validatePeopleCourtDisputeExtension(extension).valid, true);

  const rejectsInBoth = (
    mutate: (info: Record<string, any>) => void,
    label: string,
  ) => {
    const candidate = structuredClone(extension);
    mutate(candidate.info);
    assert.equal(
      validateSchema(candidate.info),
      false,
      `exported JSON Schema must reject ${label}`,
    );
    assert.equal(
      validatePeopleCourtDisputeExtension(candidate).valid,
      false,
      `runtime validation must reject ${label}`,
    );
  };

  rejectsInBoth((info) => {
    info.acceptance.proof.method = "agent_signature";
    delete info.acceptance.proof.signature;
  }, "a signature method without signature material");
  rejectsInBoth((info) => {
    info.acceptance.statement.amount = "00";
  }, "a noncanonical atomic amount");
  rejectsInBoth((info) => {
    info.acceptance.statement.network = "invalid network";
  }, "an invalid CAIP-2 network");
  rejectsInBoth((info) => {
    info.acceptance.statement.resourceUrl = "http://merchant.example/order";
  }, "a non-loopback HTTP URL");
  rejectsInBoth((info) => {
    info.declaration.rules.url = "https://user:password@court.example/rules";
  }, "a URL containing credentials");
  rejectsInBoth((info) => {
    info.acceptance.statement.acceptedAt = "2026-07-29T12:00:00Z";
  }, "a noncanonical ISO timestamp");
  rejectsInBoth((info) => {
    info.acceptance.statement.transactionId = "order\u0000hidden";
  }, "an identifier containing a control character");
}

async function packetContract(): Promise<X402DisputePacketV1> {
  const required = paymentRequired();
  const payload = await acceptedPayment(required);
  payload.accepted = {
    ...payload.accepted,
    extra: { version: "2", name: "USDC" },
  };
  const settled = settlement();
  const packet = await buildX402DisputePacket({
    paymentRequired: required,
    paymentPayload: payload,
    settlement: settled,
    rail: "x402",
    claimClass: "defective_performance",
    disputedAmount: { value: "250", currency: "USD" },
    executionMode: "partner_executes",
    settledAt: settled.settledAt,
    evidence: [
      {
        kind: "deliverable",
        sha256: "c".repeat(64),
        mediaType: "application/json",
        artifactRef: "merchant://deliverable/order-0001",
      },
    ],
  });
  assert.equal(packet.offer.status, "absent");
  assert.equal(packet.receipt.status, "absent");
  assert.equal(packet.acceptanceVerification.status, "unverified");
  assert.equal((await verifyX402DisputePacketIntegrity(packet)).valid, true);

  const tampered = structuredClone(packet);
  tampered.declaration.terms.hash = "d".repeat(64);
  const integrity = await verifyX402DisputePacketIntegrity(tampered);
  assert.equal(integrity.valid, false);
  assert.ok(
    !integrity.valid &&
      integrity.errors.some((error) => error.includes("declarationHash")),
  );

  assert.equal(
    validateX402DisputePacketStructure({
      ...packet,
      unexpected: "not allowed",
    }).valid,
    false,
  );
  assert.equal(
    validateX402DisputePacketStructure({
      ...packet,
      payment: {
        ...packet.payment,
        scheme: "invented-transfer",
      },
    }).valid,
    false,
  );

  const stale = structuredClone(packet);
  stale.acceptance.statement.acceptedAt =
    "2026-07-28T12:00:00.000Z";
  stale.acceptance.statementHash = await canonicalSha256(
    stale.acceptance.statement,
  );
  stale.packetHash = await canonicalSha256(packetHashPayload(stale));
  const staleIntegrity = await verifyX402DisputePacketIntegrity(stale);
  assert.equal(staleIntegrity.valid, false);
  assert.ok(
    !staleIntegrity.valid &&
      staleIntegrity.errors.some((error) => error.includes("stale")),
  );

  const selfAttestedVerification = structuredClone(packet);
  selfAttestedVerification.acceptanceVerification = {
    status: "verified",
    verifier: "untrusted-packet-author",
    checkedAt: NOW.toISOString(),
  };
  selfAttestedVerification.packetHash = await canonicalSha256(
    packetHashPayload(selfAttestedVerification),
  );
  const selfAttestedIntegrity = await verifyX402DisputePacketIntegrity(
    selfAttestedVerification,
  );
  assert.equal(selfAttestedIntegrity.valid, false);
  assert.ok(
    !selfAttestedIntegrity.valid &&
      selfAttestedIntegrity.errors.some((error) =>
        error.includes("trusted verifier"),
      ),
  );

  assert.equal(
    validatePeopleCourtDisputeDeclaration({
      ...declaration(),
      execution: {
        owner: "unbound-escrow",
        modes: ["bilateral_escrow"],
        automatic: false,
      },
    }).valid,
    false,
  );
  return packet;
}

async function x402rCompositionContract(): Promise<void> {
  const required = paymentRequired(
    declaration({
      execution: {
        owner: "x402r",
        modes: ["x402r"],
        automatic: false,
      },
    }),
  );
  const payload = await acceptedPayment(required);
  const settled = settlement();
  const packet = await buildX402DisputePacket({
    paymentRequired: required,
    paymentPayload: payload,
    settlement: settled,
    rail: "x402r",
    claimClass: "refund_dispute",
    disputedAmount: { value: "250", currency: "USD" },
    executionMode: "x402r",
    settledAt: settled.settledAt,
  });
  assert.equal(packet.rail, "x402r");
  assert.equal(packet.executionMode, "x402r");
  assert.equal((await verifyX402DisputePacketIntegrity(packet)).valid, true);

  const adapter = createPeopleCourtAdjudicationAdapter({
    async prepareFiling() {
      throw new Error("The Partner API transport must not be called for x402r.");
    },
    async confirmFiling() {
      throw new Error("The Partner API transport must not be called for x402r.");
    },
    async getCase(caseId) {
      return { data: { caseId } };
    },
    async getServedAward(caseId) {
      return { data: { caseId } };
    },
  });
  await assert.rejects(
    () =>
      adapter.prepare({
        packet,
        idempotencyKey: "prepare-x402r-0001",
        externalCaseId: TRANSACTION_ID,
        policyVersion: "policy-v1",
        authorityGrantId: "authority-v1",
        consentArtifactIds: {
          claimant: "claimant-consent",
          respondent: "respondent-consent",
        },
        summary: "The x402r transaction is disputed.",
        amount: { value: 250, currency: "USD" },
        parties: {
          claimant: { externalId: BUYER, name: "Buyer" },
          respondent: { externalId: SELLER, name: "Seller" },
        },
        claim: {
          statement: "The x402r resource was not delivered.",
          requestedOutcome: "refund",
        },
      }),
    /existing x402r referral path/,
  );
}

async function signedArtifactContract(): Promise<void> {
  const settledAt = new Date().toISOString();
  const signedTerms = declaration({
    evidence: {
      offerReceipt: "required",
      paymentPayload: "hash_only",
      settlementReference: "required",
    },
  });
  const offer = await createOfferEIP712(
    RESOURCE_URL,
    {
      acceptIndex: 0,
      scheme: requirement.scheme,
      network: requirement.network,
      asset: requirement.asset,
      payTo: requirement.payTo,
      amount: requirement.amount,
      offerValiditySeconds: 300,
    },
    (typedData) => TEST_ACCOUNT.signTypedData(typedData),
  );
  const required = paymentRequired(signedTerms, {
    "offer-receipt": {
      info: { offers: [offer] },
      schema: {},
    },
  });
  const payload = await acceptedPayment(
    required,
    new Date(Date.parse(settledAt) - 60 * 1000),
  );
  const receipt = await createReceiptEIP712(
    {
      resourceUrl: RESOURCE_URL,
      payer: TEST_ACCOUNT.address,
      network: requirement.network,
      transaction: TX_HASH,
    },
    (typedData) => TEST_ACCOUNT.signTypedData(typedData),
  );
  const packet = await buildX402DisputePacket({
    paymentRequired: required,
    paymentPayload: payload,
    settlement: settlement(settledAt),
    rail: "x402",
    claimClass: "nonperformance",
    disputedAmount: { value: "250", currency: "USD" },
    executionMode: "partner_executes",
    settledAt,
    receipt,
  });
  assert.equal(packet.offer.status, "verified");
  assert.equal(packet.receipt.status, "verified");
  assert.equal(packet.offer.signer?.toLowerCase(), TEST_ACCOUNT.address.toLowerCase());
  assert.equal(packet.receipt.signer?.toLowerCase(), TEST_ACCOUNT.address.toLowerCase());

  const forged = structuredClone(packet);
  assert.equal(forged.offer.artifact?.format, "eip712");
  if (forged.offer.artifact?.format === "eip712") {
    forged.offer.artifact.signature = `0x${"34".repeat(65)}`;
  }
  forged.offer.artifactHash = await canonicalSha256(forged.offer.artifact);
  forged.packetHash = await canonicalSha256(packetHashPayload(forged));
  const forgedIntegrity = await verifyX402DisputePacketIntegrity(forged);
  assert.equal(forgedIntegrity.valid, false);
  assert.ok(
    !forgedIntegrity.valid &&
      forgedIntegrity.errors.some((error) =>
        error.includes("cannot be reproduced"),
      ),
  );

  const { payer: _payer, ...settlementWithoutPayer } =
    settlement(settledAt);
  await assert.rejects(
    () =>
      buildX402DisputePacket({
        paymentRequired: required,
        paymentPayload: payload,
        settlement: settlementWithoutPayer,
        rail: "x402",
        claimClass: "nonperformance",
        disputedAmount: { value: "250", currency: "USD" },
        executionMode: "partner_executes",
        settledAt,
        receipt,
      }),
    /receipt_payer_binding_required/,
  );

  const wrongReceipt = structuredClone(receipt);
  assert.equal(wrongReceipt.format, "eip712");
  if (wrongReceipt.format === "eip712") {
    wrongReceipt.payload.resourceUrl = "https://attacker.example/wrong";
  }
  await assert.rejects(
    () =>
      buildX402DisputePacket({
        paymentRequired: required,
        paymentPayload: payload,
        settlement: settlement(settledAt),
        rail: "x402",
        claimClass: "nonperformance",
        disputedAmount: { value: "250", currency: "USD" },
        executionMode: "partner_executes",
        settledAt,
        receipt: wrongReceipt,
      }),
    /Signed receipt is invalid/,
  );
}

async function adapterContract(packet: X402DisputePacketV1): Promise<void> {
  const calls: Array<{ operation: string; value: unknown }> = [];
  const adapter = createPeopleCourtAdjudicationAdapter({
    async prepareFiling(value, key) {
      calls.push({ operation: key, value });
      return {
        data: {
          draftId: "pfd_test",
          reservedCaseId: "pcase_test",
          draftDigest: "e".repeat(64),
          confirmationStatement: "Confirm the exact filing.",
          expiresAt: "2026-07-29T12:30:00.000Z",
          rules: { version: "0.21", hash: "a".repeat(64) },
          fee: {},
        },
      };
    },
    async confirmFiling(_draftId, value, key) {
      calls.push({ operation: key, value });
      return {
        data: {
          caseId: "pcase_test",
          externalCaseId: "merchant-order-0001",
          status: "awaiting_party_response",
          accessSide: "claimant",
          rulesVersion: "0.21",
          rulesHash: "a".repeat(64),
          createdAt: NOW.toISOString(),
        },
      };
    },
    async submitEvidence(caseId, value, key) {
      calls.push({ operation: key, value: { caseId, value } });
      return { accepted: true };
    },
    async getCase(caseId) {
      return { data: { caseId } };
    },
    async getServedAward(caseId) {
      return { data: { caseId, served: true } };
    },
  });
  const prepared = await adapter.prepare({
    packet,
    idempotencyKey: "prepare-order-0001",
    externalCaseId: TRANSACTION_ID,
    policyVersion: "policy-v1",
    authorityGrantId: "authority-v1",
    consentArtifactIds: {
      claimant: "claimant-consent",
      respondent: "respondent-consent",
    },
    summary: "The purchased service did not perform.",
    amount: { value: 250, currency: "USD" },
    parties: {
      claimant: { externalId: BUYER, name: "Buyer" },
      respondent: { externalId: SELLER, name: "Seller" },
    },
    claim: {
      statement: "The agreed result was not delivered.",
      requestedOutcome: "refund",
    },
  });
  assert.equal(prepared.draftId, "pfd_test");
  const transportInput = calls[0]?.value as {
    transactionId: string;
    x402DisputePacket: X402DisputePacketV1;
  };
  assert.equal(transportInput.transactionId, TRANSACTION_ID);
  assert.equal(transportInput.x402DisputePacket.packetHash, packet.packetHash);
  const agentSignaturePacket = structuredClone(packet);
  agentSignaturePacket.acceptance.proof.method = "agent_signature";
  agentSignaturePacket.acceptance.proof.signature = {
    format: "other",
    value: "test-only-agent-signature",
  };
  agentSignaturePacket.packetHash = await canonicalSha256(
    packetHashPayload(agentSignaturePacket),
  );
  await assert.rejects(
    () =>
      adapter.prepare({
        packet: agentSignaturePacket,
        idempotencyKey: "prepare-agent-signature-unsupported",
        externalCaseId: TRANSACTION_ID,
        policyVersion: "policy-v1",
        authorityGrantId: "authority-v1",
        consentArtifactIds: {
          claimant: "claimant-consent",
          respondent: "respondent-consent",
        },
        summary: "The purchased service did not perform.",
        amount: { value: 250, currency: "USD" },
        parties: {
          claimant: { externalId: BUYER, name: "Buyer" },
          respondent: { externalId: SELLER, name: "Seller" },
        },
        claim: {
          statement: "The agreed result was not delivered.",
          requestedOutcome: "refund",
        },
      }),
    /supports only clickthrough and signed_document/,
  );
  assert.deepEqual(
    await adapter.submitEvidence(
      "pcase_test",
      { brief: "Additional protocol evidence." },
      "evidence-order-0001",
    ),
    { accepted: true },
  );
  assert.deepEqual(await adapter.getServedAward("pcase_test"), {
    caseId: "pcase_test",
    served: true,
  });
  assert.deepEqual(
    await reportServedX402Award(
      {
        packet,
        servedAward: { caseId: "pcase_test", served: true },
        idempotencyKey: "report-award-order-0001",
      },
      {
        executionMode: "partner_executes",
        executionOwner: packet.declaration.execution.owner,
        async verifyServedAward() {
          return {
            verified: true,
            caseId: "pcase_test",
            externalCaseId: packet.transactionId,
            awardHash: "f".repeat(64),
            manifestId: "aman_test",
            awardRevision: 1,
            signerAddress: `0x${"1".repeat(40)}`,
            trustPolicyId: "award-policy-v1",
          } as const;
        },
        async reportServedAward(request) {
          return {
            reported: true,
            packetHash: request.packet.packetHash,
          };
        },
      },
    ),
    { reported: true, packetHash: packet.packetHash },
  );
  let unboundAwardReported = false;
  const unboundAwardAdapter = {
    executionMode: "partner_executes" as const,
    executionOwner: packet.declaration.execution.owner,
    async verifyServedAward() {
      return {
        verified: true as const,
        caseId: "pcase_test",
        externalCaseId: "different-transaction",
        awardHash: "f".repeat(64),
        manifestId: "aman_test",
        awardRevision: 1,
        signerAddress: `0x${"1".repeat(40)}`,
        trustPolicyId: "award-policy-v1",
      };
    },
    async reportServedAward() {
      unboundAwardReported = true;
      return { reported: true };
    },
  };
  await assert.rejects(
    () =>
      reportServedX402Award(
        {
          packet,
          servedAward: { caseId: "pcase_test", served: true },
          idempotencyKey: "report-award-unbound",
        },
        unboundAwardAdapter,
      ),
    /external transaction/,
  );
  assert.equal(
    unboundAwardReported,
    false,
    "an unbound award must not reach the execution adapter",
  );
  await assert.rejects(
    () =>
      reportServedX402Award(
        {
          packet,
          servedAward: { caseId: "pcase_test", served: true },
          idempotencyKey: "report-award-wrong-owner",
        },
        {
          executionMode: "partner_executes",
          executionOwner: "different-platform",
          async verifyServedAward() {
            throw new Error("A mismatched owner must fail before verification.");
          },
          async reportServedAward() {
            return { reported: true };
          },
        },
      ),
    /exact declared execution owner/,
  );

  await assert.rejects(
    () =>
      adapter.prepare({
        packet,
        idempotencyKey: "prepare-order-mismatch",
        externalCaseId: TRANSACTION_ID,
        policyVersion: "policy-v1",
        authorityGrantId: "authority-v1",
        consentArtifactIds: {
          claimant: "claimant-consent",
          respondent: "respondent-consent",
        },
        summary: "Mismatch",
        amount: { value: 251, currency: "USD" },
        parties: {
          claimant: { externalId: BUYER, name: "Buyer" },
          respondent: { externalId: SELLER, name: "Seller" },
        },
        claim: {
          statement: "Mismatch",
          requestedOutcome: "refund",
        },
      }),
    /filing amount does not match/,
  );
}

await extensionContract();
await schemaParityContract();
const packet = await packetContract();
const localExample = await runLocalArtifactToAwardExample(packet);
assert.equal(localExample.confirmed.caseId, "pcase_local_example");
assert.equal(localExample.servedAward.served, true);
assert.equal(localExample.reported.reported, true);
await x402rCompositionContract();
await signedArtifactContract();
await adapterContract(packet);

console.log(
  "✓ People's Court x402 extension, acceptance, artifact, packet, and adapter contracts",
);
