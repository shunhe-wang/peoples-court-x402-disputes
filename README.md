# People’s Court x402 disputes

`@peoples-court/x402-disputes` is a consent-aware dispute declaration, acceptance, evidence packet, and adjudication adapter for x402 v2 transactions.

It lets a resource server advertise bounded dispute terms, requires the payer to create an explicit transaction-bound acceptance artifact before verification or settlement, and creates a strict packet that an authorized integration can use to prepare a People’s Court filing.

The package does not replace x402, act as a facilitator, reverse a payment, hold funds, or create a case from an API key alone.

Status: public Apache-2.0 SDK. Version `0.1.0` is the initial npm release.

This repository is the standalone integration SDK. The monorepo copy remains
marked private. Package publication does not deploy the hosted service or
authorize an external listing.

The local compatibility matrix covers Node 20 and 22 with `@x402/core` and `@x402/extensions` `2.19.x` and `2.20.x`.

## Protocol position

```text
402 declaration
    ↓
explicit payer acceptance
    ↓
ordinary x402 or x402r payment
    ↓
signed offer and receipt inspection
    ↓
tamper-evident dispute packet
    ↓
existing authority + bilateral consent + exact confirmation gates
    ↓
People’s Court case
```

The extension key is `peoples-court-dispute`.

It composes with the official `offer-receipt` extension.

EIP-712 offer and receipt signatures are verified locally.

JWS artifacts remain `present_unverified` unless the caller supplies the same trusted verifier during construction and every later integrity check.
The bundled Partner API adapter’s server currently accepts EIP-712 as its reproducibly verified format and rejects packets that claim verified JWS artifacts.

## Seller declaration

```ts
import {
  createPeopleCourtDisputeResourceServerExtension,
  declarePeopleCourtDisputeExtension,
  type PeopleCourtDisputeDeclarationV1,
} from "@peoples-court/x402-disputes";

const declaration: PeopleCourtDisputeDeclarationV1 = {
  version: 1,
  provider: {
    id: "peoples-court",
    name: "People's Court",
    forumUrl: "https://peoplescourt.ai",
    apiVersion: "2026-07-23",
  },
  seller: { id: "merchant-principal-123", name: "Example Merchant" },
  rules: {
    id: "arbitral-rules-v0.21",
    version: "0.21",
    hash: "<lowercase-sha256>",
    url: "https://peoplescourt.ai/rules",
  },
  terms: {
    version: "merchant-dispute-terms-v1",
    hash: "<lowercase-sha256>",
    url: "https://merchant.example/dispute-terms",
  },
  scope: "Claims arising from transaction merchant-order-123",
  supportedClaims: ["nonperformance", "defective_performance", "refund_dispute"],
  filingWindow: { startsAt: "settlement", durationSeconds: 2_592_000 },
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
  privacyNoticeUrl: "https://peoplescourt.ai/privacy",
};

const routeExtensions = {
  ...declarePeopleCourtDisputeExtension(declaration),
};

const serverExtension =
  createPeopleCourtDisputeResourceServerExtension({
    verifyAcceptanceProof: async (acceptance) =>
      merchantAcceptanceStore.verify(acceptance),
  });

resourceServer.registerExtension(serverExtension);
```

The server hooks fail closed when the echoed declaration, exact resource, selected payment requirement, terms, parties, or acceptance proof do not match.

## Payer acceptance

```ts
import {
  createPeopleCourtDisputeClientExtension,
} from "@peoples-court/x402-disputes";

const clientExtension = createPeopleCourtDisputeClientExtension({
  payerId: "buyer-principal-456",
  counterpartyId: "merchant-principal-123",
  transactionId: "merchant-order-123",
  createProof: async ({
    declaration,
    statement,
    statementHash,
    signingMessage,
    materialLimitations,
  }) => {
    await showTermsAndRequestConfirmation({
      declaration,
      statement,
      materialLimitations,
    });
    return acceptanceStore.record({
      statementHash,
      signingMessage,
      method: "clickthrough",
    });
  },
});

x402Client.registerExtension(clientExtension);
```

`createProof` is the application’s intentional user or agent act.

The package does not treat payment alone as acceptance.

For a wallet, agent, or document signature, the caller returns the matching
method and signature metadata and should provide a server-side verifier.

The general wire protocol supports all four acceptance methods. The bundled
People’s Court hosted-adjudication adapter currently accepts only
`clickthrough` and `signed_document`, because the hosted service does not yet
retain and verify the complete wallet or agent signature material. Unsupported
methods fail before the transport is called.

## Build a packet

```ts
import {
  buildX402DisputePacket,
} from "@peoples-court/x402-disputes";

const packet = await buildX402DisputePacket({
  paymentRequired,
  paymentPayload,
  settlement,
  rail: "x402",
  claimClass: "defective_performance",
  disputedAmount: { value: "25", currency: "USD" },
  executionMode: "partner_executes",
  settledAt: new Date().toISOString(),
  receipt,
  evidence: [
    {
      kind: "deliverable",
      sha256: "<lowercase-sha256>",
      mediaType: "application/json",
      artifactRef: "merchant://deliverables/merchant-order-123",
    },
  ],
});
```

The packet stores hashes of the payment payload and authorization, not the raw payment authorization.

Signed offer and receipt artifacts are preserved when supplied.

The packet is capped at 128 KiB and rejects unknown fields.

## Prepare adjudication

```ts
import {
  createPeopleCourtAdjudicationAdapter,
} from "@peoples-court/x402-disputes";

const adjudication = createPeopleCourtAdjudicationAdapter(partnerTransport);

const prepared = await adjudication.prepare({
  packet,
  idempotencyKey: crypto.randomUUID(),
  externalCaseId: packet.transactionId,
  policyVersion: "merchant-policy-v1",
  authorityGrantId: "authority-grant-id",
  consentArtifactIds: {
    claimant: "claimant-consent-id",
    respondent: "respondent-consent-id",
  },
  summary: "The purchased response did not satisfy the declared specification.",
  amount: { value: 25, currency: "USD" },
  parties: {
    claimant: { externalId: "buyer-principal-456", name: "Buyer" },
    respondent: { externalId: "merchant-principal-123", name: "Merchant" },
  },
  claim: {
    statement: "The delivered result omitted the purchased data.",
    requestedOutcome: "refund",
  },
});
```

The adapter verifies packet integrity and exact party and amount bindings before calling the transport.

The Partner API then independently checks registered authority, both parties’ consent records, policy, terms, current Rules, the prepared digest, and exact confirmation.

After retrieving the existing signed served-award package, call
`reportServedX402Award` with an adapter whose mode and exact owner identity
match the packet. The adapter must first verify the served Award and return its
case ID, x402 transaction ID, Award hash, signed-manifest ID, revision, signer,
and trust-policy ID. The helper cross-checks those bindings before it can call
the reporting callback.

```ts
const awardReportIdempotencyKey = crypto.randomUUID();

const result = await reportServedX402Award(
  {
    packet,
    servedAward,
    idempotencyKey: awardReportIdempotencyKey,
  },
  {
    executionMode: "partner_executes",
    executionOwner: "merchant-platform",
    verifyServedAward: async ({ servedAward }) =>
      awardVerifier.verifyServedPackage(servedAward),
    reportServedAward: async ({ verification, idempotencyKey }) =>
      merchantPayments.reportAward({
        caseId: verification.caseId,
        awardHash: verification.awardHash,
        idempotencyKey,
      }),
  },
);
```

The verifier must return `verified: true` and the exact structured bindings
defined by `X402ServedAwardVerification`, including `transactionId` for the
packet’s x402 transaction. That value is distinct from any Partner API
`externalCaseId`. A false or malformed result fails closed. The helper never
runs automatically and refuses a mismatched execution owner.

## Ordinary x402 and x402r

| Transaction rail | Packet mode | Filing path | Who controls funds |
| --- | --- | --- | --- |
| Ordinary x402 | `partner_executes` | Partner API adapter | The actual merchant or platform |
| x402r | `x402r` | Existing x402r referral path | x402r |
| Bilateral security contract | Not supported in packet v1 | Existing bilateral case flow | The separate bilateral contract |

An ordinary x402 payment is not converted into a refundable payment.

An x402r payment stays x402r and is not rerouted through the Partner API adapter.

The v1 declaration permits only `partner_executes` and `x402r`.
A standard x402 payment does not prove a separate bilateral contract was funded, and the initial ordinary-x402 workflow requires a named partner execution owner.

## Schema validation

The exported JSON Schema is useful for early wire-shape validation. Consumers
should enable standard `uri` and `date-time` format validation in their JSON
Schema implementation.

The package runtime validators remain authoritative. They enforce semantic and
canonical constraints that JSON Schema implementations may treat differently,
including URL parsing and normalization, exact cross-field bindings, packet
size, and canonical hashing.

## Development

```text
npm ci
npm run check
```

From the repository root:

```text
npm run test:x402-disputes
npx tsc --noEmit
```

Read:

- [PROTOCOL.md](PROTOCOL.md) for the wire contract;
- [CONFORMANCE.md](CONFORMANCE.md) for the indexed implementation behaviors and their limits;
- [SECURITY.md](SECURITY.md) for the trust and deployment boundaries;
- [TESTNET.md](TESTNET.md) for the no-secret Base Sepolia evidence verifier;
- [LICENSE](LICENSE) for the Apache License 2.0 terms;
- [TRADEMARKS.md](TRADEMARKS.md) for the People’s Court brand boundary.

## License and product boundary

Copyright 2026 Shunhe Wang.

The files in this standalone SDK repository are licensed under the Apache
License 2.0. That license covers the SDK source, examples, tests, conformance
materials, and bundled documentation in this repository.

It does not open-source or grant access to the separately operated People’s
Court hosted service, private application, adjudication models or prompts,
case records, internal Rules implementation, signing infrastructure,
credentials, settlement adapters, website, or deployment configuration.
Those systems are not included in this repository.

The Apache license does not grant trademark rights in the People’s Court name,
logos, or branding. See [TRADEMARKS.md](TRADEMARKS.md).
