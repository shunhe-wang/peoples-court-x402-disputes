# Publication status and metadata

Apache-2.0, the package identity, and the public GitHub source repository are
approved.
The public-source checkpoint was completed on 2026-07-30. The package remains
unpublished on npm.

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

The npm-release checkpoint must still resolve:

- ownership of the `@peoples-court` npm organization and protected publisher roles;
- whether to add a monitored security email in addition to GitHub private
  vulnerability reporting;
- external protocol, security, privacy, and legal review;
- a controlled integration and approved Base Sepolia evidence run;
- a final repeat review of the repository tree and npm tarball immediately
  before publication; and
- npm publication with provenance.

The monorepo package must retain `"private": true`.
The standalone repository may omit it for publishability validation, but that
does not authorize `npm publish`.

Directory submissions, community announcements, and upstream pull requests
also require their own approval after the repository and package URLs are
stable.
