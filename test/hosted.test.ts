import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
} from "@x402/core/types";

import {
  PeopleCourtApiError,
  buildX402DisputePacket,
  canonicalSha256,
  createPeopleCourtAdjudicationAdapter,
  createPeopleCourtDisputeClientExtension,
  createPeopleCourtHttpTransport,
  declarePeopleCourtDisputeExtension,
  packetHashPayload,
  type PeopleCourtDisputeDeclarationV1,
  type X402DisputePacketV1,
} from "../src/index.js";
import { createHostedX402Filing } from "../examples/hosted-filing.js";

// Expected request shapes come from the published People's Court OpenAPI
// document (see the fixture's `source`), not from this package.
const contract = JSON.parse(
  readFileSync(new URL("./fixtures/hosted-filing-contract.json", import.meta.url), "utf8"),
) as {
  operations: Record<string, {
    required: string[];
    properties: string[];
    headers: Array<{ name: string; required: boolean }>;
    party?: { required: string[]; properties: string[] };
    principalKind?: string[];
    claimAmount?: { required: string[]; currency: string; minorUnitsPattern: string };
    metadataValueType?: string;
  }>;
  retiredPrefixes: string[];
};

const BASE = "http://localhost:3917";
const BUYER = "buyer-principal";
const SELLER = "seller-principal";
const TRANSACTION_ID = "merchant-order-0001";

async function packetFixture(jwsReceipt = false): Promise<X402DisputePacketV1> {
  const account = privateKeyToAccount(generatePrivateKey());
  const declaration: PeopleCourtDisputeDeclarationV1 = {
    version: 1,
    provider: { id: "peoples-court", name: "People's Court", forumUrl: BASE, apiVersion: "2026-08-30" },
    seller: { id: SELLER, name: "Merchant" },
    rules: { id: "arbitral-rules-v1.1", version: "1.1", hash: "f".repeat(64), url: `${BASE}/rules` },
    terms: { version: "merchant-terms-v1", hash: "b".repeat(64), url: "https://merchant.example/dispute-terms" },
    scope: `Claims arising from transaction ${TRANSACTION_ID}`,
    supportedClaims: ["defective_performance"],
    filingWindow: { startsAt: "settlement", durationSeconds: 2_592_000 },
    evidence: { offerReceipt: "recommended", paymentPayload: "hash_only", settlementReference: "required" },
    execution: { owner: "merchant-platform", modes: ["partner_executes"], automatic: false },
    resourceBinding: "exact_url",
    privacyNoticeUrl: `${BASE}/privacy`,
  };
  const requirement: PaymentRequirements = {
    scheme: "exact",
    network: "eip155:84532",
    asset: "0x1234567890123456789012345678901234567890",
    amount: "25500000",
    payTo: "0x2222222222222222222222222222222222222222",
    maxTimeoutSeconds: 300,
    extra: { name: "USDC", version: "2" },
  };
  const paymentRequired: PaymentRequired = {
    x402Version: 2,
    resource: { url: "https://merchant.example/api/report", description: "Report", mimeType: "application/json" },
    accepts: [requirement],
    extensions: declarePeopleCourtDisputeExtension(declaration),
  };
  const client = createPeopleCourtDisputeClientExtension({
    payerId: BUYER,
    counterpartyId: SELLER,
    transactionId: TRANSACTION_ID,
    createProof: async ({ statementHash }) => ({
      method: "clickthrough",
      artifactRef: "merchant://acceptance/order-0001",
      artifactHash: await canonicalSha256({ statementHash }),
      signerId: BUYER,
    }),
  });
  const paymentPayload = await client.enrichPaymentPayload!(
    {
      x402Version: 2,
      resource: paymentRequired.resource,
      accepted: requirement,
      payload: { authorization: { from: account.address, to: requirement.payTo, nonce: "1" }, signature: `0x${"12".repeat(65)}` },
      extensions: paymentRequired.extensions ?? {},
    } satisfies PaymentPayload,
    paymentRequired,
  );
  return buildX402DisputePacket({
    paymentRequired,
    paymentPayload,
    settlement: { success: true, payer: account.address, transaction: `0x${"ab".repeat(32)}`, network: requirement.network },
    rail: "x402",
    claimClass: "defective_performance",
    disputedAmount: { value: "25.5", currency: "USD" },
    executionMode: "partner_executes",
    settledAt: new Date().toISOString(),
    ...(jwsReceipt
      ? {
          receipt: { format: "jws", signature: "eyJhbGciOiJFUzI1NiJ9.test.signature" },
          verifyJwsReceipt: async () => ({
            payload: {
              version: 1,
              network: requirement.network,
              resourceUrl: paymentRequired.resource.url,
              payer: account.address,
              issuedAt: Math.floor(Date.now() / 1000),
              transaction: `0x${"ab".repeat(32)}`,
            },
            signer: "did:web:merchant.example",
          }),
        }
      : {}),
  });
}

interface Captured {
  method: string;
  path: string;
  headers: Headers;
  json?: Record<string, unknown>;
  form?: FormData;
}

function fakeServer(packet: X402DisputePacketV1) {
  const requests: Captured[] = [];
  const draft = {
    draftId: "pfd_1",
    reservedCaseId: "pcase_1",
    externalCaseId: TRANSACTION_ID,
    status: "awaiting_confirmations",
    draftDigest: "d".repeat(64),
    expiresAt: "2026-10-18T00:00:00.000Z",
    rules: { version: "1.1", hash: "f".repeat(64) },
    fee: {},
    participants: [
      { participantId: "pcase_1:claimant", side: "claimant", principalId: BUYER, agentId: "merchant-agent" },
      { participantId: "pcase_1:respondent", side: "respondent", principalId: SELLER },
    ],
    confirmations: [
      { participantId: "pcase_1:claimant", side: "claimant", required: true, status: "pending", confirmationStatement: "Confirm claimant participation under draft digest dddd." },
      { participantId: "pcase_1:respondent", side: "respondent", required: false, status: "not_required", confirmationStatement: "Respondent." },
    ],
  };
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const captured: Captured = { method: init?.method ?? "GET", path: url.pathname, headers };
    if (typeof init?.body === "string") captured.json = JSON.parse(init.body);
    if (init?.body instanceof FormData) captured.form = init.body;
    requests.push(captured);
    const ok = (data: unknown, status = 200) =>
      new Response(JSON.stringify({ data, requestId: "req_test" }), { status, headers: { "content-type": "application/json" } });
    if (captured.method === "POST" && url.pathname === "/api/filings") {
      return ok({ ...draft, hostedAcceptanceUrl: "/accept/filing/pfd_1#token=show-once" }, 201);
    }
    if (captured.method === "GET" && url.pathname === "/api/filings/pfd_1") return ok(draft);
    if (captured.method === "POST" && url.pathname === "/api/filings/pfd_1/confirmations") {
      return ok({ caseId: "pcase_1", externalCaseId: TRANSACTION_ID, status: "awaiting_party_response" }, 201);
    }
    if (captured.method === "POST" && url.pathname === "/api/cases/pcase_1/submissions") {
      return ok({ submissionId: "sub_1", packetHash: packet.packetHash }, 201);
    }
    return new Response(JSON.stringify({ status: 404, code: "not_found", detail: "No route." }), { status: 404 });
  };
  return { requests, fetchImpl };
}

function assertBodyMatches(operation: string, body: Record<string, unknown>) {
  const shape = contract.operations[operation]!;
  for (const key of shape.required) assert.ok(key in body, `${operation} requires ${key}`);
  for (const key of Object.keys(body)) assert.ok(shape.properties.includes(key), `${operation} does not accept ${key}`);
}

function assertHeaders(operation: string, captured: Captured) {
  for (const header of contract.operations[operation]!.headers.filter((h) => h.required)) {
    assert.ok(captured.headers.get(header.name), `${operation} requires header ${header.name}`);
  }
  assert.match(captured.headers.get("authorization") ?? "", /^Bearer pc_test_key$/);
  for (const prefix of contract.retiredPrefixes) assert.ok(!captured.path.startsWith(prefix), `${captured.path} is retired`);
}

const packet = await packetFixture();

// The documented hosted-filing example drives the canonical operations.
{
  const server = fakeServer(packet);
  const realFetch = globalThis.fetch;
  globalThis.fetch = server.fetchImpl;
  try {
    const filing = createHostedX402Filing({
      baseUrl: BASE,
      apiKey: "pc_test_key",
      policyVersion: "policy-v1",
      authorityGrantId: "agr_1",
      claimantConsentId: "pcon_1",
      claimantEmail: "buyer@example.test",
    });
    const prepared = await filing.prepare(packet);
    assert.equal(prepared.hostedAcceptanceUrl, `${BASE}/accept/filing/pfd_1#token=show-once`);
    const opened = await filing.confirm(prepared.draftId, packet);
    assert.equal(opened.caseId, "pcase_1");
    const exhibit = await filing.fileExhibit("pcase_1", packet);
    assert.equal(exhibit.packetHash, packet.packetHash);
  } finally {
    globalThis.fetch = realFetch;
  }
  const [prepare, getFiling, confirm, submit] = server.requests;
  assert.equal(server.requests.length, 4);

  assert.equal(prepare?.method, "POST");
  assert.equal(prepare?.path, "/api/filings");
  assertHeaders("POST /api/filings", prepare!);
  const body = prepare!.json!;
  assertBodyMatches("POST /api/filings", body);
  const filingShape = contract.operations["POST /api/filings"]!;
  for (const side of ["claimant", "respondent"] as const) {
    const party = (body.parties as Record<string, Record<string, unknown>>)[side]!;
    for (const key of filingShape.party!.required) assert.ok(key in party, `party ${side} requires ${key}`);
    for (const key of Object.keys(party)) assert.ok(filingShape.party!.properties.includes(key));
    assert.ok(filingShape.principalKind!.includes(String(party.principalKind)));
  }
  const claimAmount = body.claimAmount as Record<string, string>;
  assert.deepEqual(Object.keys(claimAmount).sort(), filingShape.claimAmount!.required);
  assert.equal(claimAmount.currency, filingShape.claimAmount!.currency);
  assert.match(claimAmount.minorUnits!, new RegExp(filingShape.claimAmount!.minorUnitsPattern));
  assert.equal(claimAmount.minorUnits, "2550", "USD 25.5 is 2550 cents");
  for (const value of Object.values(body.metadata as Record<string, unknown>)) {
    assert.equal(typeof value, filingShape.metadataValueType);
  }
  assert.equal((body.metadata as Record<string, string>)["x402.packetHash"], packet.packetHash);
  assert.equal(body.transactionId, packet.transactionId);

  assert.equal(getFiling?.method, "GET");
  assert.equal(getFiling?.path, "/api/filings/pfd_1");

  assert.equal(confirm?.path, "/api/filings/pfd_1/confirmations");
  assertHeaders("POST /api/filings/{id}/confirmations", confirm!);
  assertBodyMatches("POST /api/filings/{id}/confirmations", confirm!.json!);
  assert.equal(confirm!.json!.confirmationStatement, "Confirm claimant participation under draft digest dddd.");
  assert.equal(confirm!.json!.participantId, "pcase_1:claimant");

  assert.equal(submit?.path, "/api/cases/pcase_1/submissions");
  assertHeaders("POST /api/cases/{id}/submissions", submit!);
  assert.equal(submit!.headers.get("x-pc-party"), "claimant");
  assert.ok(submit!.headers.get("idempotency-key"));
  const form = submit!.form!;
  const fields = [...new Set([...form.keys()])].sort();
  const submissionShape = contract.operations["POST /api/cases/{id}/submissions"]!;
  for (const key of submissionShape.required) assert.ok(fields.includes(key));
  for (const key of fields) assert.ok(submissionShape.properties.includes(key));
  assert.equal(form.get("party"), "claimant");
  const file = form.get("files") as File;
  assert.equal(file.type, "application/json");
  const filed = JSON.parse(await file.text()) as X402DisputePacketV1;
  assert.equal(await canonicalSha256(packetHashPayload(filed)), packet.packetHash);
}

// API problems surface as typed errors instead of silent success.
{
  const transport = createPeopleCourtHttpTransport({
    baseUrl: BASE,
    apiKey: "pc_test_key",
    fetch: async () =>
      new Response(
        JSON.stringify({ status: 422, code: "validation_failed", detail: "body.x402DisputePacket is not supported.", requestId: "req_1" }),
        { status: 422, headers: { "content-type": "application/problem+json" } },
      ),
  });
  const adjudication = createPeopleCourtAdjudicationAdapter(transport);
  await assert.rejects(
    () =>
      adjudication.prepare({
        packet,
        idempotencyKey: "k1",
        externalCaseId: TRANSACTION_ID,
        policyVersion: "policy-v1",
        authorityGrantId: "agr_1",
        consentArtifactIds: { claimant: "pcon_1" },
        claimantAcceptanceIdentity: { email: "buyer@example.test" },
        intakeMode: "claimant_initiated",
        confirmationPolicy: { mode: "initiator_only" },
        summary: "Summary.",
        parties: {
          claimant: { externalId: BUYER, name: "Buyer", principalKind: "individual" },
          respondent: { externalId: SELLER, name: "Merchant", principalKind: "organization" },
        },
        claim: { statement: "Statement.", requestedOutcome: "refund" },
      }),
    (error: unknown) =>
      error instanceof PeopleCourtApiError &&
      error.status === 422 &&
      error.code === "validation_failed" &&
      error.requestId === "req_1",
  );
  assert.throws(
    () => createPeopleCourtHttpTransport({ baseUrl: "http://court.example", apiKey: "k" }),
    /https/,
  );
}

// A JWS receipt labelled verified by the caller's own verifier is not filed:
// the hosted service has no trusted JWS identity policy (SECURITY.md).
{
  const jwsPacket = await packetFixture(true);
  assert.equal(jwsPacket.receipt.status, "verified");
  const server = fakeServer(jwsPacket);
  const adjudication = createPeopleCourtAdjudicationAdapter(
    createPeopleCourtHttpTransport({ baseUrl: BASE, apiKey: "pc_test_key", fetch: server.fetchImpl }),
    { verifyJwsReceipt: async () => ({ payload: jwsPacket.receipt.payload as never, signer: "did:web:merchant.example" }) },
  );
  await assert.rejects(
    () =>
      adjudication.prepare({
        packet: jwsPacket,
        idempotencyKey: "k-jws",
        externalCaseId: TRANSACTION_ID,
        policyVersion: "policy-v1",
        authorityGrantId: "agr_1",
        consentArtifactIds: { claimant: "pcon_1" },
        claimantAcceptanceIdentity: { email: "buyer@example.test" },
        intakeMode: "claimant_initiated",
        confirmationPolicy: { mode: "initiator_only" },
        summary: "Summary.",
        parties: {
          claimant: { externalId: BUYER, name: "Buyer", principalKind: "individual" },
          respondent: { externalId: SELLER, name: "Merchant", principalKind: "organization" },
        },
        claim: { statement: "Statement.", requestedOutcome: "refund" },
      }),
    /verified JWS signature/,
  );
  assert.equal(server.requests.length, 0, "a refused packet never reaches the API");
}

console.log("✓ hosted filing transport matches the published People’s Court OpenAPI contract");
