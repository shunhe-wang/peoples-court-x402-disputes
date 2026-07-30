import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
} from "@x402/core/types";
import { createReceiptEIP712 } from "@x402/extensions/offer-receipt";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import {
  PEOPLE_COURT_DISPUTE,
  buildX402DisputePacket,
  canonicalSha256,
  createPeopleCourtDisputeClientExtension,
  createPeopleCourtDisputeResourceServerExtension,
  declarePeopleCourtDisputeExtension,
  packetHashPayload,
  validatePeopleCourtDisputeDeclaration,
  verifyAcceptanceBindings,
  verifyX402DisputePacketIntegrity,
  type PeopleCourtDisputeAcceptanceV1,
  type PeopleCourtDisputeDeclarationV1,
  type X402DisputePacketV1,
} from "../src/index.js";
import { verifyBaseSepoliaEvidence } from "../scripts/verify-base-sepolia-evidence.mjs";

const NOW = new Date("2026-07-29T16:00:00.000Z");
const RESOURCE_URL = "https://merchant.example/x402/report";
const TRANSACTION_ID = "conformance-order-0001";
const SELLER = "conformance-seller";
const BUYER = "conformance-buyer";
const TX_HASH = `0x${"ab".repeat(32)}`;
const OTHER_TX_HASH = `0x${"cd".repeat(32)}`;
const BLOCK_HASH = `0x${"ef".repeat(32)}`;
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const PAYER = "0x1111111111111111111111111111111111111111";
const TEST_ACCOUNT = privateKeyToAccount(generatePrivateKey());

interface ConformanceCase {
  id: string;
  expect: "accept" | "reject";
  expectedError?: string;
}

interface CaseOutcome {
  accepted: boolean;
  errors?: string[];
}

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const manifest = JSON.parse(
  readFileSync(
    path.join(packageRoot, "conformance", "v1", "manifest.json"),
    "utf8",
  ),
) as { cases: ConformanceCase[] };

function declaration(
  overrides: Partial<PeopleCourtDisputeDeclarationV1> = {},
): PeopleCourtDisputeDeclarationV1 {
  return {
    version: 1,
    provider: {
      id: "peoples-court",
      name: "People's Court",
      forumUrl: "https://court.example",
      apiVersion: "2026-07-29",
    },
    seller: { id: SELLER, name: "Conformance merchant" },
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
    scope: `Claims arising from ${TRANSACTION_ID}`,
    supportedClaims: ["nonperformance", "refund_dispute"],
    filingWindow: {
      startsAt: "settlement",
      durationSeconds: 2_592_000,
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
  amount: "2500000",
  payTo: "0x2222222222222222222222222222222222222222",
  maxTimeoutSeconds: 300,
  extra: { name: "USDC", version: "2" },
};

function paymentRequired(
  terms: PeopleCourtDisputeDeclarationV1 = declaration(),
): PaymentRequired {
  return {
    x402Version: 2,
    resource: {
      url: RESOURCE_URL,
      description: "Conformance resource",
      mimeType: "application/json",
    },
    accepts: [requirement],
    extensions: declarePeopleCourtDisputeExtension(terms),
  };
}

async function acceptedPayment(
  required: PaymentRequired,
  acceptedAt = NOW,
): Promise<PaymentPayload> {
  const client = createPeopleCourtDisputeClientExtension({
    payerId: BUYER,
    counterpartyId: SELLER,
    transactionId: TRANSACTION_ID,
    now: () => acceptedAt,
    nonce: () => "conformance_nonce_00000001",
    createProof: async ({ statementHash }) => ({
      method: "clickthrough",
      artifactRef: "merchant://acceptance/conformance-order-0001",
      artifactHash: await canonicalSha256({
        event: "clickthrough",
        statementHash,
      }),
      signerId: BUYER,
    }),
  });
  assert.ok(client.enrichPaymentPayload);
  return client.enrichPaymentPayload(
    {
      x402Version: 2,
      resource: required.resource,
      accepted: requirement,
      payload: {
        authorization: {
          from: PAYER,
          to: requirement.payTo,
          nonce: "1",
        },
        signature: `0x${"12".repeat(65)}`,
      },
      extensions: required.extensions,
    },
    required,
  );
}

function settlement(): SettleResponse {
  return {
    success: true,
    payer: PAYER,
    transaction: TX_HASH,
    network: requirement.network,
  };
}

async function fixture(
  terms: PeopleCourtDisputeDeclarationV1 = declaration(),
  rail: "x402" | "x402r" = "x402",
  executionMode: "partner_executes" | "x402r" = "partner_executes",
): Promise<{
  required: PaymentRequired;
  payload: PaymentPayload;
  packet: X402DisputePacketV1;
}> {
  const required = paymentRequired(terms);
  const payload = await acceptedPayment(required);
  const packet = await buildX402DisputePacket({
    paymentRequired: required,
    paymentPayload: payload,
    settlement: settlement(),
    rail,
    claimClass: "refund_dispute",
    disputedAmount: { value: "2.5", currency: "USD" },
    executionMode,
    settledAt: NOW.toISOString(),
  });
  return { required, payload, packet };
}

function acceptanceFrom(
  payload: PaymentPayload,
): PeopleCourtDisputeAcceptanceV1 {
  const value = payload.extensions?.[PEOPLE_COURT_DISPUTE] as {
    info?: { acceptance?: PeopleCourtDisputeAcceptanceV1 };
  };
  assert.ok(value.info?.acceptance);
  return value.info.acceptance;
}

function evmTopic(address: string): string {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
}

function uint256(value: string): string {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

function rpcFetch(
  packet: X402DisputePacketV1,
  overrides: {
    chainId?: string;
    transaction?: Record<string, unknown> | null;
    receipt?: Record<string, unknown> | null;
    errorMethod?: string;
  } = {},
): typeof fetch {
  const transaction =
    overrides.transaction === undefined
      ? {
          hash: TX_HASH,
          chainId: "0x14a34",
          blockNumber: "0x10",
          blockHash: BLOCK_HASH,
        }
      : overrides.transaction;
  const receipt =
    overrides.receipt === undefined
      ? {
          transactionHash: TX_HASH,
          status: "0x1",
          blockNumber: "0x10",
          blockHash: BLOCK_HASH,
          logs: [
            {
              address: packet.payment.asset,
              topics: [
                TRANSFER_TOPIC,
                evmTopic(packet.settlement.payer ?? ""),
                evmTopic(packet.payment.payTo),
              ],
              data: uint256(packet.payment.amount),
              logIndex: "0x0",
              removed: false,
            },
          ],
        }
      : overrides.receipt;
  return (async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as {
      id: number;
      method: string;
    };
    const payload =
      request.method === overrides.errorMethod
        ? {
            jsonrpc: "2.0",
            id: request.id,
            error: { code: -32_000, message: "mock RPC failure" },
          }
        : {
            jsonrpc: "2.0",
            id: request.id,
            result:
              request.method === "eth_chainId"
                ? (overrides.chainId ?? "0x14a34")
                : request.method === "eth_getTransactionByHash"
                  ? transaction
                  : receipt,
          };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

async function rejected(action: () => Promise<unknown>): Promise<CaseOutcome> {
  try {
    await action();
    return { accepted: true };
  } catch (error) {
    return {
      accepted: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

const cases: Record<string, () => Promise<CaseOutcome>> = {
  "PCD-DECL-001": async () => ({
    accepted: validatePeopleCourtDisputeDeclaration(declaration()).valid,
  }),
  "PCD-DECL-002": async () => {
    const result = validatePeopleCourtDisputeDeclaration({
      ...declaration(),
      automaticRefund: true,
    });
    return {
      accepted: result.valid,
      ...(!result.valid && { errors: result.errors }),
    };
  },
  "PCD-ACCEPT-001": async () => {
    const required = paymentRequired();
    const payload = await acceptedPayment(required);
    const result = await verifyAcceptanceBindings({
      declaration: declaration(),
      acceptance: acceptanceFrom(payload),
      resourceUrl: RESOURCE_URL,
      requirement,
      now: NOW,
    });
    return {
      accepted: result.valid,
      ...(!result.valid && { errors: result.errors }),
    };
  },
  "PCD-ACCEPT-002": async () => {
    const required = paymentRequired();
    const payload = await acceptedPayment(required);
    const result = await verifyAcceptanceBindings({
      declaration: declaration(),
      acceptance: acceptanceFrom(payload),
      resourceUrl: "https://merchant.example/x402/different-resource",
      requirement,
      now: NOW,
    });
    return {
      accepted: result.valid,
      ...(!result.valid && { errors: result.errors }),
    };
  },
  "PCD-ACCEPT-003": async () => {
    const required = paymentRequired();
    const payload = await acceptedPayment(required);
    const result = await verifyAcceptanceBindings({
      declaration: declaration(),
      acceptance: acceptanceFrom(payload),
      resourceUrl: RESOURCE_URL,
      requirement: { ...requirement, amount: "2500001" },
      now: NOW,
    });
    return {
      accepted: result.valid,
      ...(!result.valid && { errors: result.errors }),
    };
  },
  "PCD-ACCEPT-004": async () => {
    const required = paymentRequired();
    const payload = await acceptedPayment(required);
    const extension = payload.extensions?.[PEOPLE_COURT_DISPUTE] as {
      info: { acceptance: Record<string, unknown> };
    };
    delete extension.info.acceptance.proof;
    const server = createPeopleCourtDisputeResourceServerExtension({
      now: () => NOW,
    });
    const result = await server.hooks?.onBeforeVerify?.(
      required.extensions?.[PEOPLE_COURT_DISPUTE],
      {
        paymentPayload: payload,
        requirements: requirement,
        declaredExtensions: required.extensions ?? {},
      },
    );
    return {
      accepted: !(result && "abort" in result && result.abort),
      errors:
        result && "message" in result && result.message
          ? [result.message]
          : undefined,
    };
  },
  "PCD-PACKET-001": async () => {
    const { packet } = await fixture();
    const result = await verifyX402DisputePacketIntegrity(packet);
    return {
      accepted: result.valid,
      ...(!result.valid && { errors: result.errors }),
    };
  },
  "PCD-PACKET-002": async () => {
    const signedAt = new Date();
    const required = paymentRequired();
    const payload = await acceptedPayment(required, signedAt);
    const receipt = await createReceiptEIP712(
      {
        resourceUrl: RESOURCE_URL,
        payer: PAYER,
        network: requirement.network,
        transaction: TX_HASH,
      },
      (typedData) => TEST_ACCOUNT.signTypedData(typedData),
    );
    const packet = await buildX402DisputePacket({
      paymentRequired: required,
      paymentPayload: payload,
      settlement: settlement(),
      rail: "x402",
      claimClass: "refund_dispute",
      disputedAmount: { value: "2.5", currency: "USD" },
      executionMode: "partner_executes",
      settledAt: signedAt.toISOString(),
      receipt,
    });
    packet.settlement.transaction = OTHER_TX_HASH;
    packet.packetHash = await canonicalSha256(packetHashPayload(packet));
    const result = await verifyX402DisputePacketIntegrity(packet);
    return {
      accepted: result.valid,
      ...(!result.valid && { errors: result.errors }),
    };
  },
  "PCD-PACKET-003": async () => {
    const { packet } = await fixture();
    packet.offer = {
      status: "present_unverified",
      artifact: {
        format: "jws",
        signature: "x".repeat(132_000),
      },
      artifactHash: "d".repeat(64),
    };
    const result = await verifyX402DisputePacketIntegrity(packet);
    return {
      accepted: result.valid,
      ...(!result.valid && { errors: result.errors }),
    };
  },
  "PCD-EXEC-001": async () => {
    return rejected(() =>
      fixture(
        declaration({
          execution: {
            owner: "x402r",
            modes: ["partner_executes"],
            automatic: false,
          },
        }),
        "x402",
        "partner_executes",
      ),
    );
  },
  "PCD-EXEC-002": async () => {
    return rejected(() =>
      fixture(
        declaration({
          execution: {
            owner: "x402r",
            modes: ["x402r"],
            automatic: false,
          },
        }),
        "x402",
        "x402r",
      ),
    );
  },
  "PCD-EXEC-003": async () => {
    const { packet } = await fixture(
      declaration({
        execution: {
          owner: "x402r",
          modes: ["x402r"],
          automatic: false,
        },
      }),
      "x402r",
      "x402r",
    );
    const result = await verifyX402DisputePacketIntegrity(packet);
    return {
      accepted: result.valid,
      ...(!result.valid && { errors: result.errors }),
    };
  },
  "PCD-EVIDENCE-001": async () => {
    const { packet } = await fixture();
    const result = await verifyBaseSepoliaEvidence(
      {
        schemaVersion: 1,
        network: requirement.network,
        transactionHash: TX_HASH,
        packet,
      },
      { offline: true },
    );
    return { accepted: result.valid };
  },
  "PCD-EVIDENCE-002": async () => {
    const { packet } = await fixture();
    return rejected(() =>
      verifyBaseSepoliaEvidence(
        {
          schemaVersion: 1,
          network: requirement.network,
          transactionHash: OTHER_TX_HASH,
          packet,
        },
        { offline: true },
      ),
    );
  },
  "PCD-EVIDENCE-003": async () => {
    const { packet } = await fixture();
    const result = await verifyBaseSepoliaEvidence(
      {
        schemaVersion: 1,
        network: requirement.network,
        transactionHash: TX_HASH,
        packet,
      },
      {
        fetch: rpcFetch(packet),
        rpcUrl: "https://mock-rpc.example",
      },
    );
    return { accepted: result.valid };
  },
  "PCD-EVIDENCE-004": async () => {
    const { packet } = await fixture();
    return rejected(() =>
      verifyBaseSepoliaEvidence(
        {
          schemaVersion: 1,
          network: requirement.network,
          transactionHash: TX_HASH,
          packet,
        },
        {
          fetch: rpcFetch(packet, { chainId: "0x1" }),
          rpcUrl: "https://mock-rpc.example",
        },
      ),
    );
  },
  "PCD-EVIDENCE-005": async () => {
    const { packet } = await fixture();
    return rejected(() =>
      verifyBaseSepoliaEvidence(
        {
          schemaVersion: 1,
          network: requirement.network,
          transactionHash: TX_HASH,
          packet,
        },
        {
          fetch: rpcFetch(packet, { transaction: null }),
          rpcUrl: "https://mock-rpc.example",
        },
      ),
    );
  },
  "PCD-EVIDENCE-006": async () => {
    const { packet } = await fixture();
    return rejected(() =>
      verifyBaseSepoliaEvidence(
        {
          schemaVersion: 1,
          network: requirement.network,
          transactionHash: TX_HASH,
          packet,
        },
        {
          fetch: rpcFetch(packet, {
            receipt: {
              transactionHash: TX_HASH,
              status: "0x0",
              blockNumber: "0x10",
              blockHash: BLOCK_HASH,
              logs: [],
            },
          }),
          rpcUrl: "https://mock-rpc.example",
        },
      ),
    );
  },
  "PCD-EVIDENCE-007": async () => {
    const { packet } = await fixture();
    return rejected(() =>
      verifyBaseSepoliaEvidence(
        {
          schemaVersion: 1,
          network: requirement.network,
          transactionHash: TX_HASH,
          packet,
        },
        {
          fetch: rpcFetch(packet, {
            receipt: {
              transactionHash: TX_HASH,
              status: "0x1",
              blockNumber: "0x10",
              blockHash: BLOCK_HASH,
              logs: [],
            },
          }),
          rpcUrl: "https://mock-rpc.example",
        },
      ),
    );
  },
  "PCD-EVIDENCE-008": async () => {
    const { packet } = await fixture();
    return rejected(() =>
      verifyBaseSepoliaEvidence(
        {
          schemaVersion: 1,
          network: requirement.network,
          transactionHash: TX_HASH,
          packet,
        },
        {
          fetch: rpcFetch(packet, { errorMethod: "eth_chainId" }),
          rpcUrl: "https://mock-rpc.example",
        },
      ),
    );
  },
};

assert.deepEqual(
  Object.keys(cases).sort(),
  manifest.cases.map((item) => item.id).sort(),
  "the executable cases and public manifest must remain in lockstep",
);

for (const vector of manifest.cases) {
  const outcome = await cases[vector.id]();
  assert.equal(
    outcome.accepted,
    vector.expect === "accept",
    `${vector.id} expected ${vector.expect}: ${outcome.errors?.join("; ") ?? "no diagnostic"}`,
  );
  if (vector.expectedError) {
    assert.ok(
      outcome.errors?.some((error) =>
        error.includes(vector.expectedError ?? ""),
      ),
      `${vector.id} did not produce its declared diagnostic: ${vector.expectedError}`,
    );
  }
}

console.log(
  `✓ ${manifest.cases.length} indexed implementation conformance cases passed`,
);
