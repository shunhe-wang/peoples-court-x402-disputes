# People’s Court x402 dispute protocol v1

## Purpose

The protocol records a bounded dispute-resolution offer, an explicit payer acceptance, x402 payment and settlement references, optional official signed interaction artifacts, and content-addressed evidence references.

It creates a portable filing input.

It does not decide a dispute or execute an award.

## Extension key and versions

- Extension key: `peoples-court-dispute`
- Declaration version: `1`
- Packet version: `1`
- Supported x402 version: `2`
- Tested x402 package lines: `2.19.x` and `2.20.x`
- Package version: `0.1.0`

Unknown fields fail validation.

Future wire changes require a new version or an explicitly compatible optional field.

## Declaration

The seller’s `PaymentRequired.extensions["peoples-court-dispute"]` entry contains:

- a provider and Partner API version;
- the seller identity;
- versioned and hashed forum Rules;
- versioned and hashed transaction terms;
- transaction-specific scope;
- supported claim classes;
- a settlement-relative filing window;
- the offer and receipt evidence policy;
- the true execution owner and allowed modes;
- an exact-resource binding; and
- terms, Rules, forum, and privacy URLs.

The declaration requires `execution.automatic` to be `false`.

The declaration is included in the canonical payment requirement hash.

## Acceptance

The payer client copies the static declaration and adds `info.acceptance`.

The acceptance statement binds:

- the canonical declaration hash;
- the canonical selected payment requirement hash;
- the exact resource URL;
- scheme, network, asset, atomic amount, payee, and hashed `extra`;
- payer and counterparty identities;
- a stable external transaction identifier;
- Rules version and hash;
- terms version and hash;
- dispute scope;
- canonical acceptance time; and
- a replay nonce.

The proof records a method, artifact reference, artifact SHA-256, optional signer identity, and optional signature metadata.

The proof callback receives both the structured statement and a human-readable signing message.
It also receives the complete declaration and a fixed list of material limitations so the application can surface the forum URL, filing window, execution owner, refund limitation, authority gate, and evidentiary limits before payment.

Resource server hooks validate the acceptance before both verification and settlement.

Applications that need cryptographic proof validation provide `verifyAcceptanceProof`.

The general protocol supports `clickthrough`, `wallet_signature`,
`agent_signature`, and `signed_document`.
The bundled People’s Court hosted-adjudication adapter currently permits only
`clickthrough` and `signed_document`.
It rejects wallet and agent signatures before transport until the hosted
provisioning flow retains and verifies their complete signing material.

## Canonicalization

Hashes use the canonical JSON and SHA-256 implementation exported by the official `@x402/extensions/offer-receipt` package.

Object key order therefore does not alter a hash.

SHA-256 values are lowercase 64-character hexadecimal strings without a `0x` prefix.

The packet hash covers every packet field except `packetHash`.

## Signed offers and receipts

The packet uses official `offer-receipt` artifact types.

Artifact status is one of:

- `absent`;
- `present_unverified`;
- `verified`; or
- `invalid`.

EIP-712 artifacts are verified locally every time packet integrity is checked.

JWS artifacts are locally verified only when the caller supplies a trusted verifier on both construction and every later integrity check.

The current Partner API service does not have a trusted JWS identity-verification policy.
It therefore rejects packets that claim a JWS artifact is verified; use EIP-712 for reproducibly verified Partner API artifacts.

Verification checks the artifact signature and its resource, payment, payer, network, transaction, and timing bindings as applicable.

It does not establish that the signing key was authorized for a business identity unless the caller separately validates that authorization.

If the declaration requires signed offers and receipts, both must be locally verified before packet construction succeeds.

## Dispute packet

`X402DisputePacketV1` contains:

- packet, protocol, and x402 versions;
- actual transaction rail;
- external transaction identity and creation time;
- resource, claim class, parties, and disputed fiat amount;
- accepted payment requirement fields with `extraHash`;
- execution owner mode;
- hashes of the payment requirement, complete payment payload, and authorization payload;
- settlement transaction, network, payer when present, and observation time;
- declaration, acceptance, and their hashes;
- acceptance verification state;
- signed offer and receipt artifacts and verification states;
- content-addressed evidence references; and
- the canonical packet hash.

The raw payment payload and authorization are not embedded in the packet.

The packet does not independently prove those source bytes unless the holder separately preserves and matches them to the packet hashes.

The packet is limited to 128 KiB.

## Rail and execution invariants

An ordinary packet v1 must use `partner_executes`.

An x402r packet must use `rail: "x402r"` and `executionMode: "x402r"`.

The Partner API adjudication adapter refuses x402r packets because the existing signed x402r referral is the authoritative filing and execution path.

The packet v1 declaration permits only `partner_executes` and `x402r`.

The separate bilateral contract is not a standard x402 `exact` payment and must be proven through its existing funding and case flow.

An unnamed execution owner is not permitted because the initial ordinary-x402 filing workflow requires a named execution owner.

No packet authorizes automatic award execution.

## Served-award reporting

The optional `reportServedX402Award` helper reports an already served Award to
the exact execution owner identified in an ordinary x402 packet.
It never decides a dispute and never moves funds itself.

Before reporting, the adapter must verify the served Award and return a
structured binding containing:

- the People’s Court case ID;
- the packet’s external x402 transaction ID;
- the lowercase SHA-256 Award hash;
- the signed artifact-manifest ID;
- a positive Award revision;
- the trusted signer address; and
- the signer trust-policy ID.

The helper validates those fields and cross-checks `transactionId` against the
packet’s x402 transaction. That identifier is distinct from a Partner API
`externalCaseId`. It also checks the
execution mode, and exact execution-owner identity.
A failed or malformed verification prevents the reporting callback from
running.

Runtime validation is authoritative for semantic and canonical constraints
that JSON Schema cannot express or that validators may implement differently.
Consumers of the exported schema should enable standard `uri` and `date-time`
format validation.

## Partner API binding

The optional `x402DisputePacket` field is an additive extension to Partner API version `2026-07-23`.

When present, the server:

1. validates the strict packet structure and canonical integrity;
2. rejects x402r packets on the Partner API path;
3. matches transaction, parties, amount, provider, Rules, terms, scope, acceptance method, and acceptance artifact to stored records;
4. includes the packet in the prepared filing digest;
5. requires a second exact confirmation;
6. stores the canonical packet as case evidence and retains its original bytes; and
7. returns the packet hash on case reads.

The existing policy, authority grant, claimant consent, and respondent consent remain mandatory.

The packet does not replace any of them.

## Evidence semantics

A signed offer is evidence that a signer committed to the encoded payment terms.

A signed receipt is evidence that a signer asserted the encoded interaction and settlement reference.

An acceptance artifact is evidence of the recorded acceptance act.

None of these artifacts is a merits finding, proof of satisfactory performance, proof of delegated authority, proof of notice, or a guarantee that an award can be executed.

The adjudicator determines weight and merits under the applicable Rules.

## Reference implementation crosswalk

The package deliberately preserves several safety patterns confirmed in
external arbiter integrations:

- Kleros-style internal and external identifiers remain distinct so a local
  case can be correlated with the payment or execution system.
- The packet and private intake bind immutable payment information by hash
  before any later reporting or execution step.
- Evidence is content-addressed, while the private proceeding may accept later
  evidence without rewriting the original transaction packet.
- Decision, service, and execution remain separate states, so an execution
  failure cannot erase or reverse a served Award.
- Event-driven x402r intake remains on the separate x402r path with replay and
  operator checks.

The package does not adopt first-evidence-only adjudication, fresh random model
seeds, or direct decide-and-execute flows used by narrower experimental
arbiters. Those patterns are not suitable for this Rules-bound bilateral
dispute process.
