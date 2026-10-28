import assert from "node:assert/strict";
import { test } from "node:test";
import { x402HTTPResourceServer, x402ResourceServer } from "@x402/core/server";
import type { HTTPTransportContext } from "@x402/core/server";
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { createReceiptEIP712 } from "@x402/extensions/offer-receipt";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { declaration } from "../examples/declaration.js";
import {
  buildX402DisputePacket,
  canonicalSha256,
  createPeopleCourtDisputeClientExtension,
  createPeopleCourtDisputeResourceServerExtension,
  declarePeopleCourtDisputeExtension,
  inspectSignedReceipt,
  packetHashPayload,
  verifyX402DisputePacketIntegrity,
  type CreatePeopleCourtDisputeResourceServerExtensionOptions,
} from "../src/index.js";

const NOW = new Date("2026-07-29T12:00:00.000Z");
const URL_A = "https://merchant.example/api/a";
const URL_B = "https://merchant.example/api/b";
const account = privateKeyToAccount(generatePrivateKey());
const requirement: PaymentRequirements = {
  scheme: "exact",
  network: "eip155:84532",
  asset: "0x1234567890123456789012345678901234567890",
  amount: "250000000",
  payTo: "0x2222222222222222222222222222222222222222",
  maxTimeoutSeconds: 300,
  extra: {},
};
const declarations = declarePeopleCourtDisputeExtension(declaration);

async function acceptedPayment(
  url: string,
  terms = requirement,
  acceptedAt = NOW,
): Promise<{ required: PaymentRequired; payload: PaymentPayload }> {
  const required: PaymentRequired = {
    x402Version: 2,
    resource: { url, description: "report", mimeType: "application/json" },
    accepts: [terms],
    extensions: declarations,
  };
  const client = createPeopleCourtDisputeClientExtension({
    payerId: "buyer-principal",
    counterpartyId: declaration.seller.id,
    transactionId: "merchant-order-123",
    now: () => acceptedAt,
    nonce: () => "security_acceptance_nonce",
    createProof: async ({ statementHash }) => ({
      method: "clickthrough",
      artifactRef: "merchant://acceptance/security-test",
      artifactHash: statementHash,
      signerId: "buyer-principal",
    }),
  });
  const payload = await client.enrichPaymentPayload!({
    x402Version: 2,
    resource: required.resource,
    accepted: terms,
    payload: { signature: "synthetic-payment" },
    extensions: required.extensions,
  }, required);
  return { required, payload };
}

// Only external facilitator inputs are synthetic. The actual core/HTTP
// dispatcher invokes the SDK extension and handles its returned aborts.
async function server(options: CreatePeopleCourtDisputeResourceServerExtensionOptions) {
  const calls = { verify: 0, settle: 0 };
  const core = new x402ResourceServer({
    async getSupported() {
      return {
        kinds: [{ x402Version: 2, scheme: requirement.scheme, network: requirement.network }],
        extensions: [],
        signers: {},
      };
    },
    async verify() {
      calls.verify++;
      return { isValid: true, payer: account.address };
    },
    async settle() {
      calls.settle++;
      return { success: true, payer: account.address, network: requirement.network, transaction: "0x1234" };
    },
  });
  // The fixture implements both pre-2.25 and 2.25 scheme shapes; older peers
  // ignore the new payment-flow configuration.
  const scheme = {
    scheme: requirement.scheme,
    defaultAssetTransferMethod: "default",
    paymentFlows: { default: { default: "authorization", supported: ["authorization"] } } as const,
    async parsePrice() { return { amount: requirement.amount, asset: requirement.asset }; },
    async enhancePaymentRequirements(value: PaymentRequirements) { return value; },
  };
  core.register(requirement.network, scheme);
  core.registerExtension(createPeopleCourtDisputeResourceServerExtension({
    now: () => NOW,
    ...options,
  }));
  const route = (resource: string) => ({
    resource,
    accepts: {
      scheme: requirement.scheme,
      network: requirement.network,
      payTo: requirement.payTo,
      price: { amount: requirement.amount, asset: requirement.asset },
      maxTimeoutSeconds: requirement.maxTimeoutSeconds,
    },
    extensions: declarations,
  });
  const http = new x402HTTPResourceServer(core, {
    "GET /api/a": route(URL_A),
    "GET /api/b": route(URL_B),
  });
  await http.initialize();
  function context(path: string, payload: PaymentPayload): HTTPTransportContext {
    const header = Buffer.from(JSON.stringify(payload)).toString("base64");
    return {
      request: {
        path,
        method: "GET",
        adapter: {
          getHeader: (name) => name.toLowerCase() === "payment-signature" ? header : undefined,
          getMethod: () => "GET",
          getPath: () => path,
          // Do not treat a request-derived URL as the advertised resource.
          getUrl: () => "https://attacker.example/untrusted-host",
          getAcceptHeader: () => "application/json",
          getUserAgent: () => "security-test",
        },
      },
    };
  }
  return { http, calls, context };
}

test("server-owned resource binding blocks cross-route acceptance and payload-only rewrites", async () => {
  const { payload } = await acceptedPayment(URL_A);
  const seen: unknown[] = [];
  const s = await server({
    resourceUrl: async (transport) => {
      seen.push(transport);
      const request = (transport as HTTPTransportContext).request;
      return request.path === "/api/a" ? URL_A : URL_B;
    },
    verifyAcceptanceProof: async () => true,
  });
  assert.equal((await s.http.processHTTPRequest(s.context("/api/a", payload).request)).type, "payment-verified");
  assert.equal((await s.http.processHTTPRequest(s.context("/api/b", payload).request)).type, "payment-error");
  const rewritten = structuredClone(payload);
  rewritten.resource!.url = URL_B;
  assert.equal((await s.http.processHTTPRequest(s.context("/api/b", rewritten).request)).type, "payment-error");
  assert.equal(s.calls.verify, 1);
  assert.equal(seen.length, 3);
  assert.ok(seen.every((value) => value && typeof value === "object" && "request" in value && !("paymentPayload" in value)));
  const other = (await acceptedPayment(URL_B)).payload;
  assert.equal((await s.http.processHTTPRequest(s.context("/api/b", other).request)).type, "payment-verified");
  assert.equal((await s.http.processSettlement(other, requirement, declarations, s.context("/api/b", other))).success, true);
  // Settlement must independently rebind the resource, not rely on prior verification.
  assert.equal((await s.http.processSettlement(payload, requirement, declarations, s.context("/api/b", payload))).success, false);
  assert.equal(s.calls.settle, 1);
});

test("missing server resource configuration aborts both dispatchers", async () => {
  const { payload } = await acceptedPayment(URL_A);
  const s = await server({ verifyAcceptanceProof: async () => true });
  assert.equal((await s.http.processHTTPRequest(s.context("/api/a", payload).request)).type, "payment-error");
  assert.equal((await s.http.processSettlement(payload, requirement, declarations, s.context("/api/a", payload))).success, false);
  assert.deepEqual(s.calls, { verify: 0, settle: 0 });
});

for (const [name, options] of [
  ["false proof", { verifyAcceptanceProof: async () => false }],
  ["throwing proof", { verifyAcceptanceProof: async () => { throw new Error("SECRET_PROOF_FAILURE"); } }],
  ["non-boolean proof", { verifyAcceptanceProof: async () => "truthy" as unknown as boolean }],
  ["throwing resolver", { resourceUrl: async () => { throw new Error("SECRET_RESOLVER_FAILURE"); } }],
  ["unusable resolver", { resourceUrl: async () => "" }],
  ["throwing clock", { now: () => { throw new Error("SECRET_CLOCK_FAILURE"); } }],
] satisfies Array<[string, CreatePeopleCourtDisputeResourceServerExtensionOptions]>) {
  test(`${name} aborts verification and settlement without leaking errors`, async () => {
    const { payload } = await acceptedPayment(URL_A);
    const s = await server({ resourceUrl: URL_A, ...options });
    const verified = await s.http.processHTTPRequest(s.context("/api/a", payload).request);
    const settled = await s.http.processSettlement(payload, requirement, declarations, s.context("/api/a", payload));
    assert.equal(verified.type, "payment-error");
    assert.equal(settled.success, false);
    assert.deepEqual(s.calls, { verify: 0, settle: 0 });
    assert.ok(!JSON.stringify({ verified, settled }).includes("SECRET_"));
  });
}

const SOLANA = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
// Valid-length base58 identifiers, with case changes denoting different values.
const SOLANA_PAYER = "Ab".repeat(22);
const SOLANA_TX = "Cd".repeat(43) + "C";
for (const [name, network, payer, transaction, expected] of [
  ["Solana payer", SOLANA, SOLANA_PAYER, SOLANA_TX, "invalid"],
  ["Solana transaction", SOLANA, SOLANA_PAYER, SOLANA_TX, "invalid"],
  ["opaque EVM identifier", requirement.network, "OpaquePayer", "OpaqueTransaction", "invalid"],
  ["hex EVM identifiers", requirement.network, "0xabcd", "0xcdef", "verified"],
] as const) {
  test(`signed receipt preserves ${name} identity`, async () => {
    const settledAt = new Date().toISOString();
    const receipt = await createReceiptEIP712({
      resourceUrl: URL_A, payer, network, transaction,
    }, (typedData) => account.signTypedData(typedData));
    const input = { receipt, resourceUrl: URL_A, network, payer, transaction, settledAt };
    assert.equal((await inspectSignedReceipt(input)).status, "verified");
    const changed = name === "Solana payer"
      ? { payer: "AB" + payer.slice(2) }
      : name === "Solana transaction"
        ? { transaction: "CD" + transaction.slice(2) }
        : { payer: payer.toUpperCase().replace("0X", "0x"), transaction: transaction.toUpperCase().replace("0X", "0x") };
    assert.equal((await inspectSignedReceipt({ ...input, ...changed })).status, expected);
  });
}

test("packet integrity rejects case-distinct Solana transaction after attacker recomputes packet hash", async () => {
  const settledAt = new Date().toISOString();
  const terms: PaymentRequirements = { ...requirement, network: SOLANA };
  const { payload, required } = await acceptedPayment(URL_A, terms, new Date(Date.parse(settledAt) - 1000));
  const receipt = await createReceiptEIP712({
    resourceUrl: URL_A, payer: SOLANA_PAYER, network: SOLANA, transaction: SOLANA_TX,
  }, (typedData) => account.signTypedData(typedData));
  const packet = await buildX402DisputePacket({
    paymentRequired: required,
    paymentPayload: payload,
    settlement: { success: true, network: SOLANA, transaction: SOLANA_TX, payer: SOLANA_PAYER },
    rail: "x402",
    claimClass: "nonperformance",
    disputedAmount: { value: "250", currency: "USD" },
    executionMode: "partner_executes",
    settledAt,
    receipt,
  });
  assert.equal((await verifyX402DisputePacketIntegrity(packet)).valid, true);
  const changed = structuredClone(packet);
  changed.settlement.transaction = "CD" + SOLANA_TX.slice(2);
  changed.packetHash = await canonicalSha256(packetHashPayload(changed));
  assert.equal((await verifyX402DisputePacketIntegrity(changed)).valid, false);
});
