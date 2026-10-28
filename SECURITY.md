# Security and trust boundary

## Current status

This source repository and SDK package are public. The SDK is not a deployed
service.

It has not received a professional external security audit or jurisdiction-specific legal review.

Do not use the current package to claim automatic refunds, custody, escrow protection, or production-money readiness.

## Fail-closed behavior

The validators reject unknown fields, malformed identifiers, non-canonical timestamps, unsafe URLs, oversized packets, unsupported claims, unsupported execution modes, invalid hashes, and cross-transaction artifact mismatches.

Resource server hooks abort verification and settlement when the required acceptance is missing or does not match the exact declaration, resource, and selected payment requirement.
The expected resource URL must come from explicit server `resourceUrl` configuration, not the client payload.
A resolver may select a configured URL using transport context, but request-derived URLs and headers are not trusted configuration.
Missing configuration aborts, including for the exported unconfigured singleton.
Thrown validation/proof/resolver exceptions are converted to generic explicit aborts because x402 may otherwise continue after a thrown hook error.

The hosted filing adapter reverifies packet integrity before preparing a filing and again before filing the packet exhibit.
The hosted People’s Court service does not parse or verify the packet; it stores the packet hash in the confirmed filing’s metadata and the exhibit bytes as claimant evidence.

## Proof status

`verified` has a narrow meaning.

For an EIP-712 offer or receipt, it means the signature was reverified and the encoded protocol fields match the packet.

For JWS, it means the caller-supplied verifier returned a payload that matches the packet during the current integrity check.
The caller must supply that verifier again at every later integrity boundary.
The hosted filing adapter refuses packets claiming verified JWS artifacts because the hosted service has no trusted JWS identity-verification policy yet.

It does not prove that a key was authorized to represent a merchant, that an agent had delegated authority, or that performance was satisfactory.

Pin trusted signer authorization through an independent identity, DID, DNS, onchain, or contractual policy.

Handle key rotation and revocation explicitly.

## Acceptance

The package validates acceptance structure and transaction bindings.

Cryptographic or durable clickthrough verification is application-specific.

Production resource servers should provide `verifyAcceptanceProof`.
It must return exactly `true`; false, non-boolean values, and exceptions abort both verification and settlement.

The People’s Court API separately requires a registered claimant consent record for the same transaction, parties, Rules, and procedure terms, and the claimant’s hosted acceptance of the exact filing.
It does not compare that record with the packet’s acceptance artifact; register the consent record with the packet’s acceptance artifact hash and declaration terms hash so the two can be reconciled.

Respondent consent is either a registered record or the respondent’s hosted acceptance of the pinned case terms.

An API key is never sufficient authority to file for another principal.

## Sensitive data

The packet stores hashes of the full payment payload and authorization payload.

It does not store the raw payment authorization or its signature.

Callers should not place secrets, bearer credentials, private keys, unrestricted URLs, or unnecessary personal data in declaration, proof, metadata, or evidence reference fields.

Signed offer and receipt artifacts can contain wallet and transaction identifiers.

Treat packets as confidential case evidence and apply retention, access, deletion, and incident-response controls.

## Execution

The extension and packet never move funds.

`execution.automatic` must be `false`.

Ordinary x402 awards can be reported to the merchant or platform that actually controls the payment.

x402r remains on the existing x402r execution path.

The separate bilateral security contract remains on its own audited funding and settlement path.

Unknown or pending execution outcomes must be reconciled before retry.

`reportServedX402Award` is an explicit adapter action.
It requires the adapter to verify the formally served Award and signed artifact
manifest before the reporting callback can run.
The verifier must return the case ID, external x402 transaction ID, Award hash,
manifest ID, revision, signer address, and signer trust-policy ID.
The helper validates those values, binds the external transaction to the
packet, and rejects an adapter whose execution mode or exact declared owner
identity does not match.
It is never triggered by case status alone.

## Operational requirements before production use

- Publish releases with protected provenance.
- Add supported-version and vulnerability-reporting policies.
- Pin exact compatible x402 versions and test upgrades before release.
- Run clean-install, type, unit, integration, and production build checks in CI.
- Obtain external protocol and security review.
- Review arbitration, consumer, privacy, data-processing, sanctions, custody, and money-transmission implications for target uses.
- Validate a real testnet x402 interaction without representing testnet results as mainnet readiness.
- Establish signing-key authorization, rotation, revocation, and incident response.
- Establish Partner API tenant onboarding, quotas, monitoring, support, and credential rotation.
- Submit any x402 documentation listing only after the repository, package, and documentation URLs are stable.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

Use
[GitHub Security Advisories](https://github.com/shunhe-wang/peoples-court-x402-disputes/security/advisories/new)
to report and discuss vulnerabilities privately.

Private vulnerability reporting is enabled for the public repository. No
public security email is listed until a monitored mailbox is available.
