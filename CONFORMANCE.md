# Implementation conformance index

The versioned manifest in `conformance/v1/manifest.json` indexes the behaviors enforced by this package's executable tests.

Run it with:

```sh
npm run build
npm test
```

The executable coverage lives in the repository source at `test/conformance.test.ts`. It is intentionally excluded from the compiled npm tarball. The test refuses a manifest entry without a matching implementation and refuses an implementation case that is not declared in the manifest.

The cases focus on wire behavior rather than People's Court's private application:

- strict declaration parsing;
- affirmative, transaction-bound acceptance;
- resource-replay and requirement-tampering refusal;
- refusal when acceptance proof material is missing;
- JSON Schema and runtime-validator parity for signature material, canonical
  amounts, networks, URLs, timestamps, and identifiers;
- packet integrity and canonical-size limits;
- signed-artifact and settlement cross-binding;
- explicit execution ownership; and
- verified served-Award binding before an execution-owner callback; and
- separation between ordinary x402 and the x402r rail.

This manifest is a human-readable implementation index, not a portable fixture set, cross-vendor certification, or independent standard. A future vendor-neutral suite would need complete versioned inputs, canonical outputs, and expected diagnostics that another implementation can consume without this package.

Passing these cases does not prove identity, authority, performance, recoverability, jurisdiction, legal enforceability, or the merits of a dispute.
