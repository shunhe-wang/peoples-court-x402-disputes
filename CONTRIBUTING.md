# Contributing

Issues and technical feedback are welcome. Do not include secrets, private
case material, personal data, or security vulnerabilities in a public issue.

Report suspected vulnerabilities through the private process in
`SECURITY.md`.

## Code contributions

Code contributions must be licensed under the repository’s Apache License
2.0 terms and include a Developer Certificate of Origin sign-off in every
commit:

```text
Signed-off-by: Your Name <your-email@example.com>
```

Use `git commit -s` to add the sign-off. By signing off, you certify the
[Developer Certificate of Origin 1.1](https://developercertificate.org/).

Before opening a pull request:

1. run `npm ci`;
2. run `npm run check`;
3. explain the protocol or security effect of the change; and
4. update tests and conformance documentation when wire behavior changes.

Maintainers may decline changes that weaken explicit consent, transaction
binding, evidence integrity, authority gates, served-Award verification, or
the separation between adjudication and execution.
