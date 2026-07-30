# Publication status and metadata

Apache-2.0, the package identity, and the private GitHub repository are
approved.
The package remains unpublished on npm, and the repository must remain private
until a separate public-release checkpoint.

The standalone repository uses:

```json
{
  "name": "@peoples-court/x402-disputes",
  "version": "0.1.0",
  "author": "Shunhe Wang",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/shunhe-wang/peoples-court-x402-disputes.git"
  },
  "homepage": "https://github.com/shunhe-wang/peoples-court-x402-disputes#readme",
  "bugs": {
    "url": "https://github.com/shunhe-wang/peoples-court-x402-disputes/issues"
  },
  "keywords": [
    "x402",
    "x402-extension",
    "disputes",
    "adjudication",
    "payment-evidence"
  ],
  "publishConfig": {
    "access": "public",
    "provenance": true
  }
}
```

The public-release checkpoint must still resolve:

- ownership of the `@peoples-court` npm organization and protected publisher roles;
- whether to add a monitored security email in addition to GitHub private
  vulnerability reporting;
- external protocol, security, privacy, and legal review;
- a controlled integration and approved Base Sepolia evidence run;
- final review of the repository tree and npm tarball;
- public repository visibility; and
- npm publication with provenance.

The monorepo package must retain `"private": true`.
The standalone repository may omit it for publishability validation, but that
does not authorize `npm publish`.
