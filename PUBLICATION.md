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
- a final repeat review of the repository tree and npm tarball immediately
  before publication; and
- npm publication with provenance.

The approved Base Sepolia protocol-level evidence run completed on 2026-07-30.
It validates the SDK acceptance, settlement, packet, and chain bindings against
a local merchant fixture. It is not an external production integration or a
substitute for the remaining external reviews.

The monorepo package must retain `"private": true`.
The standalone repository may omit it for publishability validation, but that
does not authorize `npm publish`.

Directory submissions, community announcements, and upstream pull requests
also require their own approval after the repository and package URLs are
stable.

## npm ownership and release control

The intended npm organization is `peoples-court`, and the intended package is
`@peoples-court/x402-disputes`.

The npm organization owner must:

1. enable two-factor authentication for authorization and writes;
2. create the public-only `peoples-court` organization;
3. enable organization-wide two-factor-authentication enforcement; and
4. retain the owner role without sharing personal npm credentials.

The `npm-release` GitHub environment is the release boundary. Configure it with
a required reviewer and prevent administrators from bypassing its protection
rules. Publication is manual, requires an exact package-version
acknowledgement, and must run from the matching `v<version>` Git tag.

### First publication

npm trusted publishing cannot be attached until the package exists. For the
first publication only:

1. complete every open release checkpoint above;
2. create a short-lived granular npm token restricted to the
   `@peoples-court` organization with package-write access;
3. save it as the `NPM_TOKEN` secret in the protected `npm-release`
   environment, not as a repository-level secret;
4. create and push the reviewed `v0.1.0` tag;
5. manually run the **Publish npm package** workflow from that tag and enter
   `@peoples-court/x402-disputes@0.1.0`; and
6. verify the package, provenance statement, and tarball on npm.

The workflow repeats the build, tests, package-consumer test, dependency audit,
unpublished-version check, and tarball inspection before publishing.

### Subsequent publications

Immediately after the first publication:

1. configure npm trusted publishing for GitHub user `shunhe-wang`, repository
   `peoples-court-x402-disputes`, workflow `publish.yml`, and environment
   `npm-release`;
2. change package publishing access to require two-factor authentication and
   disallow token-based publication;
3. delete the `NPM_TOKEN` GitHub environment secret; and
4. revoke the bootstrap token on npm.

Future releases use the same reviewed-tag and protected-environment workflow,
but npm authenticates the workflow through short-lived OpenID Connect
credentials. A long-lived npm publication token is not part of the steady-state
release process.
