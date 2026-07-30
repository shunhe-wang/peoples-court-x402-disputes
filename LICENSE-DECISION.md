# Public license decision

Status: Apache License 2.0 approved and activated for the standalone SDK on
2026-07-30.

This is practical release guidance, not legal advice. The copyright holder or counsel should approve the final choice.

## Recommendation

Use Apache License 2.0 for the dedicated integration package only.

The approved copyright notice is:

`Copyright 2026 Shunhe Wang.`

Apache 2.0 is permissive: downstream users may use, modify, distribute, and commercialize the package without publishing their own source or modifications. It also gives an express patent license from contributors and includes patent-litigation termination. Redistribution requires preserving the license and relevant notices and marking modified files.

That combination fits an integration SDK: low adoption friction, clearer patent treatment than the MIT text, and alignment with the official x402 repository's Apache 2.0 license.

Apache 2.0 does not grant rights to People's Court names or trademarks and does not imply endorsement. It also does not require a separately operated hosted adjudication service, private application code, Rules, case records, models, data, or credentials to be open sourced unless those materials are deliberately placed within the licensed work.

This recommendation would change if the package itself contains a patentable invention or the commercially differentiating adjudication implementation.
Apache 2.0 grants recipients rights under contributor patent claims necessarily infringed by the licensed contribution.
The repository owner approved that grant after a preliminary engineering
patent-candidate screen found no obvious SDK-level patent moat.
That screen is not a patentability, validity, or freedom-to-operate opinion.

## Current ecosystem check

Verified 2026-07-30 against the repositories linked from the official x402 third-party extensions page.

| Project | Public integration repository | Current license |
| --- | --- | --- |
| x402 core | `x402-foundation/x402` | Apache 2.0 |
| World AgentKit | `worldcoin/agentkit` | MIT |
| OMATrust | `oma3dao/omatrust-sdk` | MIT |
| PEAC Protocol | `peacprotocol/peac` | Apache 2.0 |
| x402r | `BackTrackCo/x402r-sdk` | Apache 2.0 |
| zauth | `zauthofficial/zauthSDK` | MIT |

The precise conclusion is not that most curated extensions use Apache 2.0.
Among the five currently listed extensions, two use Apache 2.0 and three use MIT.
The consistent pattern is a permissively licensed integration surface.

x402r also demonstrates why repository scope matters.
Its public SDK is Apache 2.0, while its separate `x402r-contracts` repository uses Business Source License 1.1.
That contract license permits non-production and testing use, requires a commercial license for other current production use, and changes to MIT on 2029-12-09.
Its arbiter examples are separately licensed under Apache 2.0.

The comparable People's Court split is:

- Apache 2.0 for declarations, types, validators, packet construction, public transport interfaces, conformance cases, and examples needed to integrate;
- private or separately licensed terms for the hosted adjudication service, case operations, model and prompt implementation, signing and trust infrastructure, internal data, and credentials; and
- a new license decision if People's Court later publishes a commercially differentiating smart-contract rail or other core execution technology.

Apache 2.0 permits a competitor to fork and host the licensed SDK.
It does not give that competitor the unlicensed hosted service, private backend, brand, data, operational trust, or distribution relationships.
If the SDK itself becomes the product moat rather than the adoption surface, Apache 2.0 is the wrong choice and the scope should be reconsidered before publication.

## Options

| Option | What downstream users can do | What they must share | Practical fit |
| --- | --- | --- | --- |
| Apache 2.0 | Use, modify, redistribute, sublicense, and commercialize | License and relevant notices; modified files must be marked | Recommended for a protocol SDK because it is permissive and has an express patent grant |
| MIT | Use, modify, redistribute, sublicense, and commercialize | Copyright and permission notice | Simple permissive fallback, but the short text has less explicit patent treatment |
| MPL 2.0 | Use commercially and combine with proprietary code | Source for distributed modifications to MPL-covered files | Useful only if file-level reciprocal sharing is an intentional product goal |
| AGPL 3.0 | Use and modify under strong copyleft | Corresponding source for distributed versions and qualifying modified network services | High adoption friction for merchant and platform integrations |
| Proprietary or source-available | Only the permissions written in custom terms | Whatever the custom terms require | Preserves control but is not an open-source posture and weakens ecosystem reuse |

A public repository with no license is not a neutral compromise. Copyright defaults leave outsiders without clear permission to copy, modify, or redistribute the code.

## Activated scope

Apache-2.0 applies to the dedicated repository’s code, examples, tests,
conformance vectors, protocol text, and bundled documentation.

The People’s Court name, logos, and branding are subject to the separate
trademark boundary in `TRADEMARKS.md`.
The hosted service, private application, Rules implementation, case data,
models, prompts, credentials, settlement adapters, website, and deployment
configuration are not included in the licensed repository.

Outside contributions use Apache inbound-equals-outbound terms and Developer
Certificate of Origin sign-off, as described in `CONTRIBUTING.md`.

Primary texts:

- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- [MIT License](https://opensource.org/license/mit)
- [Mozilla Public License 2.0 FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)
- [GNU Affero General Public License 3.0](https://www.gnu.org/licenses/agpl-3.0.en.html)
- [x402 repository](https://github.com/x402-foundation/x402)
- [x402 third-party extensions](https://docs.x402.org/dev-tools/third-party-extensions)
- [x402r SDK license](https://github.com/BackTrackCo/x402r-sdk/blob/main/LICENSE)
- [x402r contracts license](https://github.com/BackTrackCo/x402r-contracts/blob/main/LICENSE)
