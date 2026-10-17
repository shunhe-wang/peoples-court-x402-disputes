# People's Court x402r arbiter kit

This standalone example uses Base Sepolia, two funded developer wallets, and the People's Court x402r API.
The fresh second case reached a signed merchant Answer, a served Award allocating 0.01 USDC to the payer, and a confirmed Base Sepolia `void` returning that amount.
sw approved shortening that synthetic case's stay in its isolated local database for this verification.
This verifies the executor and chain path, not Rules-path timing.
See [VERIFICATION.md](VERIFICATION.md#case-2-fresh-isolated-end-to-end-run-2026-10-17) for receipts, the case ID, the exact timing edit, and remaining limits.

## Source and layout

The procedural source is the [People's Court integration guide at the tested app revision](https://github.com/shunhe-wang/arbitrator-ai/blob/7bf8c920d22c8b59cc293dbaa9a61445088be0a4/docs/x402r-integration-guide.md).
That repository may require access from its owner.
The guide's companion [agent intake contract](https://github.com/shunhe-wang/arbitrator-ai/blob/7bf8c920d22c8b59cc293dbaa9a61445088be0a4/docs/x402r-agent-intake.md) describes the registered terms tuples.
The tuple in `arbitration-terms.json` was copied from `scripts/lib/protocol-arbitration-terms.mjs` at that revision, rather than from the guide's older inline JSON example.
It must match the tuple the app operator registers for your PaymentOperator.

The directory follows [BackTrack's arbiter-examples](https://github.com/BackTrackCo/arbiter-examples/tree/0b1d94fb8fd6012f48cce01df015cd0d6b7e4910/x402r-kleros-example): a private ESM package, environment configuration, setup and party scripts, and saved deployment context.
The minimal HTTP merchant borrows the auth-capture facilitator pattern from BackTrack's `x402r-ai-garbage-detector` and embeds it in the merchant process.
It uses the SDK's verification and settlement implementation and x402's standard header encoders.
It does not require a third developer wallet or a separately funded facilitator.
The app's setup, canary payload builder, payer refund, merchant Answer, watcher, and full-demo scripts supplied the integration logic.
There are no runtime imports from the app or from the SDK package at this repository's root.

BackTrack's checked revision requests `@x402r/core|sdk` with `^0.3.0`, while its HTTP example requests `@x402r/evm` with `^0.2.0-alpha.1`.
This example pins the app-compatible `@x402r/core|helpers|sdk` to `0.3.0-alpha.0`, `@x402r/evm` to `0.2.0-alpha.1`, `@x402/core|evm` to `2.19.0`, and `viem` to `2.56.0`.
The lockfile makes installation reproducible.

## Procedure and settlement

Under the guide's current procedure, an AI-only claim below $100 has one AI arbiter and a claim of $100 or more has three AI panelists.
Both parties retain the internal human appeal, and x402r intake never records an appeal waiver.
Execution waits for the seven-day stay after service of the Award, and longer for a timely appeal or another applicable stay.
The published minimum escrow hold is 30 days from on-chain authorization.
This example selects a 31-day EscrowPeriod and sets capture and refund deadlines approximately 32 days after the offer.
An appeal may outlast even that hold, after which the protocol's refund default can govern regardless of the Award.
The separate filing fee never comes out of the disputed payment.

| Payment state and decision | Expected action after finality |
|---|---|
| Open authorization, payer wins | Arbiter `void()`, returning USDC to payer |
| Open authorization, merchant wins | Arbiter `capture()`, paying merchant |
| Threshold decline | Arbiter `refuse()`, closing the request without moving the corpus |
| Captured payment, refund denied | `refuse()`, without a second capture |
| Captured payment, payer receives relief | Merchant-funded `refund()` followed by verified receipt reporting |
| Open authorization split | Escalation unless partial capture is verified on that deployment |
| Conditional relief or execution failure | No unsupported chain call |

This kit leaves the authorization open and never includes a direct award-execution command.
The app executor must enforce the case's service, finality, appeal, and integrity controls.
Keep `X402R_PARTIAL_CAPTURE=false` on the app until partial capture is independently verified for that deployment.

## Prerequisites

Use Node 22.23.2 or later and npm.
Fund the merchant and payer with Base Sepolia ETH for gas and the payer with at least 0.01 Base Sepolia USDC for the purchase.
The payer also needs any separately quoted filing fee if the app collects it.
The canonical test USDC address is `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.
Use [Circle's testnet faucet](https://faucet.circle.com/) for test USDC if needed.
The kit refuses any `X402R_CHAIN` other than `base-sepolia` and checks the RPC reports chain ID `84532` before signing or broadcasting.
Port 3000 is forbidden, and the defaults are merchant port 4021 and local app port 3418.

Get the arbiter's Base Sepolia address, the registered operator configuration, and an HMAC operator integration credential from People's Court before using a hosted endpoint.
Discovery at `/api/x402r/arbiter-registration` tells developers to contact `contact@peoplescourt.ai` for that credential.
No self-service issuance endpoint is advertised.
The developer needs only the arbiter's public address, never its private key.
The merchant can deploy the permissionless arbiter-keyed RefundRequest and evidence infrastructure with its own funded wallet.

## 1. Install and deploy or reuse

Run all commands in this directory.

```bash
npm ci --ignore-scripts
cp .env.example .env
chmod 600 .env
```

Fill in the two developer private keys, RPC, arbiter address, app URL, and HMAC credential in `.env`.
The public terms hash is already supplied.
Review the proposed operator and balances first.

```bash
npm run setup
```

If infrastructure is missing, that command stops with its predicted addresses.
Deploy it on Base Sepolia with the following command.

```bash
npm run setup -- --execute
```

Setup uses the SDK's `deployDeliveryProtectionOperator` with `allowArbiterRefund:true`.
Its capture condition is arbiter OR payer, and its void condition is escrow expiry OR merchant OR arbiter.
The post-capture refund path stays merchant-controlled, as the guide requires.
An explicit `X402R_OPERATOR_ADDRESS` must equal the verified deterministic preset for this merchant, arbiter, and hold duration.
For reuse, choose that merchant and arbiter, set the address, and run setup without `--execute`.
Arbitrary condition trees are outside this example's reuse path.
Setup saves `.state/context.json` and verifies deployed code, condition addresses, and hold duration.

The operator contract has no native arbitration `termsHash` field.
The app operator must register the PaymentOperator and exact tuple through its server-side configuration before any payment.
Send the nonsecret configuration lines printed by setup through your agreed onboarding process.
This kit does not edit the hosted service.
The corresponding app settings are `X402R_OPERATOR_ADDRESS`, `X402R_ESCROW_PERIOD_ADDRESS`, `X402R_REFUND_REQUEST_ADDRESS`, `X402R_PAYMENT_INDEX_RECORDER`, and `X402R_OPERATOR_TERMS_HASH`.

The alpha SDK may see missing bytecode immediately after a mined deployment on a lagging RPC.
Every setup broadcast is saved, and the kit disables the SDK's automatic individual deployment retry.
Inspect the saved receipts and rerun read-only setup after chain state is visible.
Do not discard state and blindly send another deployment.

## 2. Start the merchant

```bash
npm run merchant
```

`GET http://localhost:4021/resource` returns an x402 v2 HTTP 402 challenge with auth-capture requirements, the exact arbitration tuple, and long deadlines.
The paid response deliberately has a missing temperature to create a small, disclosed test dispute.
It is a test fixture, not a claim about a real commercial delivery.
The merchant embeds the SDK facilitator and pays the authorization transaction's gas.
It saves a pending marker before settlement and the transaction hash as soon as broadcast.
An ambiguous outcome requires receipt reconciliation before another attempt.

## 3. Pay as the payer

In a second terminal, run the following command.

```bash
npm run client
```

The terms-aware builder sets `PaymentInfo.salt = BigInt('0x' + termsHash)` before computing the escrow nonce and signing ERC-3009.
The wire payload carries `salt: '0x' + termsHash`.
Changing the salt after signing invalidates the authorization, and a stock random-salt client does not provide this integration's payment-time consent.
The builder validates the operator, receiver, test USDC, amount, fee cap, tuple, and deadlines.
The client saves the payment hash, receipt hash, and exact paid response privately and verifies that 10,000 base units remain capturable.
It resumes a known payment without authorizing a second one.

## 4. Request the refund with evidence

Review `claim.json` and `answer.json` before filing so their facts match the response actually purchased.

```bash
npm run refund
```

Only the payer wallet signs `requestRefund(paymentInfo, amount)`.
The next transaction calls `RefundRequestEvidence.submitEvidence` with a small self-contained JSON data URI containing the claim, paid response, and receipt references.
The contract's URI field is named `cid`, and the kit uses a data URI rather than claiming it is an IPFS CID.
Do not put private information on-chain.
For a larger real exhibit, use a separately hosted or pinned evidence URI and follow the app's evidence limits.
The referral also carries the Complaint and response text because the refund-request event itself carries no claim text.

## 5. Refer to People's Court

```bash
npm run refer
```

The kit reads the authorization time and duration on-chain, then POSTs the full referral to `${ARBITRATOR_API_URL}/api/x402r/referral`.
The HMAC covers `v1`, Unix timestamp, delivery ID, uppercase method, pathname, and SHA-256 of the exact body bytes, joined with newlines.
Retries retain the body and delivery ID and use a fresh timestamp and signature.
The response's claimant token, invite token, and exact consent message are stored in `.state/case.json` and never printed.

If the app returns HTTP 402, the case is not docketed and no Answer clock runs yet.
Review the separate fee challenge and run the following commands only when ready to pay it.

```bash
npm run fee
npm run fee -- --pay
```

The fee helper uses the guide's supported testnet `txHash` confirmation route for a separate USDC transfer and caps this example's fee at 100 test USDC.
It saves the transaction before confirmation and reuses that receipt on retries.
This fee path was built but was not exercised in the recorded fee-waived local run.
The current fee-confirm response returns `respondentInvite` but omits `messageToSign`, so a hosted fee-gated integration must receive or obtain the actual service notice.
Before referral, configure `ARBITRATION_NOTICE_ENDPOINT` with a public HTTPS URL forwarding to this merchant's `POST /notice`, or arrange operator relay of the exact notice into `.state/notice.json`.
The app's SSRF guard rejects private loopback notice URLs.
The merchant stores a notice but never answers automatically, and the Answer helper checks its case, payment hash, and receiver before using it.
Do not reconstruct the consent message from an assumed Rules version.

The alternative is the app's `scripts/x402r-watch.mjs`, configured by the app operator before the refund request.
It watches `RefundRequested` on the configured RefundRequest contract and sends the signed referral itself.
It filters foreign operators, uses the terms tuple named by the payment salt, and opens only a default Complaint.
The watcher still needs an HMAC credential, and the payer needs a relayed claimant token to add its pleaded evidence.
It logs and drops non-2xx deliveries rather than maintaining a retry queue.
This kit uses direct signed referral, so no watcher is required for the recorded run.
Running both relies on one-case-per-payment idempotency, and the operator must relay the winning acknowledgment's credentials.

## 6. Answer and observe

```bash
npm run answer
npm run observe
```

The merchant signs the server's exact `messageToSign` using EIP-191 and files the reviewed Answer with the one-time invite.
The signer must be the payment receiver.
Observe uses the claimant capability to read the case and reads payment state directly from Base Sepolia.
It shows a served Award's hash, execution date, funds instructions, and any exposed settlement receipt information when available.
Do not treat a hold disposition hash or a run marked `succeeded` as evidence that an Award was served.

On a local app operated by you, these optional commands close the completed Record, request AI adjudication, and show operator diagnostics.

```bash
npm run local-adjudicate -- --close-record
npm run observe -- --operator
```

They require the local app's `ARB_ADMIN_TOKEN` and refuse hosted URLs.
They use real current time and do not waive the appeal, backdate service, or shorten finality.
The normal hosted path instead uses the proceeding clock and the operator's queued-run worker.
Keep the app and its executor operating after service and finality, then rerun observe and check the case's execution audit hash against its successful Base Sepolia receipt.
No settlement is verified until the actual chain state and receipt agree with the Award.

## Local app operator setup

The example is standalone, but a local tribunal requires a separate app checkout and its own dependencies.
Use the chosen app revision's integration guide and environment catalog rather than importing app code here.
Keep a fresh `DATA_BACKEND=json` database under that checkout's `tmp/` directory.
Configure the testnet read tuple printed by setup, HMAC secret, admin token, real provider credentials and model selections, and an Award signing key or supported testnet signing fallback.
Production referral verification stays enabled under `next start`.
The recorded runs used `FEE_WAIVE_FILING=true` only on isolated local instances.
Supply a valid `MODEL_PRICING_JSON` covering every active model and provider operation before adjudication because current procedure uses cost admission controls even for a fee-waived filing.
For the fresh second case, the orchestrator supplied real staging pricing covering `glm-5.3-flash`, and the kit preserved it without modification or display.
The prepared environment left the general `ADJUDICATION_COST_BUDGET_USD` override unset, which disables that optional override under [environment manifest row 17a](https://github.com/shunhe-wang/arbitrator-ai/blob/7bf8c920d22c8b59cc293dbaa9a61445088be0a4/docs/deploy/env-manifest.md#L159) and differs from production.
The pinned fast case still enforces its $0.025 budget even when the global override is unset.
Local worker readiness passed with `APP_URL=http://localhost:3418`, `PUBLIC_DEMO_ENABLED=false`, `LEGAL_RESEARCH_ARCHITECTURE=shared_clerk_judge_research_v2`, and `NODE_ENV=development`.
The queue remained configured for real Z.ai calls, with `X402R_VERIFY_REFERRALS=true` and `X402R_ALLOW_SYNTHETIC_PAYMENT_STATE=false`.
This local development mode and waived filing fee differ from hosted production.
The first case's failed recovery remains documented in the verification history.
The second case used a fresh database and completed on its first adjudication attempt after the app operator closed the completed exchange through the supported API.
After Award service, the app and worker were stopped and only that case's stored `executeAfter` was shortened under sw's explicit approval, with a timestamped backup and a one-field diff.
The restarted app's gated sweep then executed the Award, and the immutable served manifest and signature remained unchanged.
That local verification exception is separate from the normal seven-day procedure described above and is not a kit setup step.

Build first and start the completed artifact on port 3418.

```bash
NODE_ENV=production node node_modules/next/dist/bin/next build
X402R_CHAIN=base-sepolia NODE_ENV=development node node_modules/next/dist/bin/next start -p 3418
```

Start the app's worker in another terminal with its private credential loaded from that app checkout's `.env`.

```bash
X402R_CHAIN=base-sepolia API_URL=http://localhost:3418 node --env-file=.env scripts/worker.mjs
```

Next reads that checkout's `.env` itself.
The explicit local development mode permits the HTTP loopback origin, while production readiness requires HTTPS.
Next warns about this combination with `next start`, so it is a local verification setup rather than production parity.
Do not put `--env-file` on the Next build invocation because the tested Next/Node combination propagates it into a worker's forbidden options.
Do not rebuild the same `.next` directory while its server is running.

## Hosted Base Sepolia status, checked 2026-10-17

Staging discovery at `https://web-staging-c077.up.railway.app/api/x402r/arbiter-registration` reported `active:true` and the referral URL `https://peoplescourt.ai/api/x402r/referral`.
That production URL is hard-coded in [`app/api/x402r/arbiter-registration/route.ts`](https://github.com/shunhe-wang/arbitrator-ai/blob/7bf8c920d22c8b59cc293dbaa9a61445088be0a4/app/api/x402r/arbiter-registration/route.ts#L16), including for local and staging instances.
Do not send a testnet referral to that discovered production URL on this example's behalf.
Have the operator confirm the staging referral destination and override `ARBITRATOR_API_URL` explicitly.
The environment manifest says staging's arbiter key is unset unless a separate test x402r settlement exercise is approved.
It requires verified intake's operator, terms hash, escrow, and at least one payment recovery source, and reserves the writer key for the executor.
The manifest and public discovery do not prove that a staging executor or x402r watcher is running or that their credentials are configured.
No Railway settings were read or changed for this work.
Before a hosted run, the operator must confirm those settings, register your operator and tuple, provision your HMAC credential, and arrange respondent service and queued-run processing.
Hosted fee collection and settlement remain separate from merely advertising an active discovery document.

## State, checks, and recovery

`.env`, `.state/`, dependencies, and logs are ignored by Git.
State includes signed authorizations and capability tokens, so retain its private file permissions and never commit it.
The payment salt is fixed by the terms, so reusing an identical PaymentInfo also reuses its hash and nonce.
For a new independent run, archive the old state securely and obtain a fresh offer with different expiry timestamps.
For a lost HTTP response, recover the authorization receipt from the merchant's saved broadcast and settlement state, then confirm the payment hash on-chain before updating the private payment record.
An existing refund request or evidence record without a saved receipt stops automatic rebroadcast.
Do not delete a pending marker to make an uncertain operation appear new.

```bash
npm run check
```

The checks verify terms-bound signatures using [ERC-3009's typed data contract](https://eips.ethereum.org/EIPS/eip-3009), salt substitution failure, HMAC bytes, forbidden chain and port settings, and minimum deadlines.
Real-chain evidence and verification limits are recorded separately in [VERIFICATION.md](VERIFICATION.md).
