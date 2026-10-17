# Base Sepolia verification, 2026-10-17

The [fresh second case](#case-2-fresh-isolated-end-to-end-run-2026-10-17) completed payment, refund request, evidence, signed referral, signed Answer, real-provider adjudication, Award service, and a confirmed Base Sepolia `void` returning 0.01 USDC to the payer.
Its stay was shortened only in the new isolated local database with sw's explicit approval and a timestamped backup.
This verifies the executor and chain path, not Rules-path timing.
No chain result or adjudication was mocked.
The earlier first-case failures below are preserved as history and do not describe the second case's outcome.
Commands in that history are not current instructions to operate on the old worktree.

## Provenance and environment

- Owner mandate: sw's instruction to implement and verify the kit locally on Base Sepolia, with local commits only.
- App source: `7bf8c920d22c8b59cc293dbaa9a61445088be0a4` in the supplied `mvp-x402r-kit` worktree.
- BackTrack reference: `0b1d94fb8fd6012f48cce01df015cd0d6b7e4910` of [arbiter-examples](https://github.com/BackTrackCo/arbiter-examples/tree/0b1d94fb8fd6012f48cce01df015cd0d6b7e4910).
- Runtime: Node `22.23.2`, Next `16.3.8`, local app `http://localhost:3417`, merchant `http://localhost:4021`.
- Chain: RPC-reported `84532`, with canonical Base Sepolia USDC and real testnet transactions.
- App data: isolated JSON database `tmp/kit-verification.db.json`, with live referral verification and real Z.ai provider configuration.
- Fees: `FEE_WAIVE_FILING=true` on this local instance, with the waiver recorded on the case.
- Model calls: zero because the cost configuration gate refused admission.
- Watcher: not started because the kit delivered a direct HMAC-authenticated referral.
- Application source: unchanged, apart from Next's temporary generated `next-env.d.ts` adjustment, which was restored after the run.

## Addresses and payment binding

| Role | Address |
|---|---|
| Payer | `0x6da64CDC42A5D8458e993ac7ff0613c2DbA288F6` |
| Merchant | `0x3987aA8b081e0A5a6772842aBeF203e4B42B831b` |
| Arbiter | `0xA64DC1d426ED26681508f2E99a600Cb46b217cbD` |
| PaymentOperator | [`0x80754BA4594aF01726ee8ce80F30B5362227eca7`](https://sepolia.basescan.org/address/0x80754BA4594aF01726ee8ce80F30B5362227eca7) |
| EscrowPeriod | `0xCF07EA214145c8CE16182804086B07F0bed55798` |
| RefundRequest | `0x37ffe6eb9f57243e478C7B7bc23A8251E948baf4` |
| RefundRequestEvidence | `0xe388B6f6ED46310ECa5644D6A5218E284144c78A` |
| AuthCaptureEscrow | `0xBdEA0D1bcC5966192B070Fdf62aB4EF5b4420cff` |

PaymentInfo hash: `0x28f5aa2ff740795450e0f6df57dacb4ab128b329f325a38cba2c317cdb965b13`.
Registered routed terms hash: `518669710687625d2c6260229475a23eef322879c607a0bd73fb588cbf113f1a`.
The payment's immutable salt equals that hash numerically and was included in the ERC-3009 nonce before signing.
The amount was `10000` base units, or `0.01` USDC.
The operator's capture and void conditions were checked against the SDK's deterministic arbiter-inclusive preset.
The post-capture refund condition remains the receiver condition, as distinct from arbiter-authorized voiding of an open authorization.
The on-chain hold duration is `2678400` seconds, or 31 days.
Authorization occurred at `2026-10-17T12:25:08Z` and the escrow window ends at `2026-11-17T12:25:08Z`.
Capture and refund deadlines are both `2026-11-18T12:25:06Z`.

## Confirmed transactions

| Step | Successful transaction | Block |
|---|---|---|
| Operator deployment batch | [`0x9db65e5ba2993e59af5f0e2effd5a7ed0c2344362a0f1bbf545eba4b87f5ee63`](https://sepolia.basescan.org/tx/0x9db65e5ba2993e59af5f0e2effd5a7ed0c2344362a0f1bbf545eba4b87f5ee63) | 48235781 |
| SDK deployment fallback transaction | [`0xa20610e4b346114bf958624fbda8a93dda7f7e5773fb887f286e5ec37ab8ed50`](https://sepolia.basescan.org/tx/0xa20610e4b346114bf958624fbda8a93dda7f7e5773fb887f286e5ec37ab8ed50) | 48235781 |
| Payer-authorized purchase | [`0x39da5128c37b312c0b1e5e002488d70f7bdd03c62939d78a9d2ae05ca2610e47`](https://sepolia.basescan.org/tx/0x39da5128c37b312c0b1e5e002488d70f7bdd03c62939d78a9d2ae05ca2610e47) | 48235810 |
| Payer refund request | [`0xff7df26ccc0fde4d45d0cb321906414afb166140917b49d6171b87788bded345`](https://sepolia.basescan.org/tx/0xff7df26ccc0fde4d45d0cb321906414afb166140917b49d6171b87788bded345) | 48235823 |
| Payer evidence | [`0x6a7f801c781004fda99c9de0ca46097c454884e95070ff64f4a7b7c27d0cf1e4`](https://sepolia.basescan.org/tx/0x6a7f801c781004fda99c9de0ca46097c454884e95070ff64f4a7b7c27d0cf1e4) | 48235825 |

The initial setup run hit the SDK's immediate bytecode-verification failure after these successful transactions.
Hashes were recovered from the merchant's mined transactions and independently receipt-checked because the SDK threw before returning its summary.
Subsequent read-only setup found the predicted contracts and verified their configuration.
The final kit saves each deployment broadcast before that verification and disables the SDK's automatic individual fallback writes.
That revised guard was checked on the existing deployment, without spending gas on another deployment.

The evidence URI was recovered from `RefundRequestEvidence` with the payer as submitter and role `0`.
Its JSON contains the actual response body and payment and refund references.
Its SHA-256 is `4b2f4f310fcaf39c328d941721b3cab65fbe1374a631cc19331f1e355271b125`.
The evidence bytes and chain observations are recorded in [verification/chain.json](verification/chain.json).
Contract addresses and deployment receipts are in [verification/contracts.json](verification/contracts.json) and [verification/setup-transactions.json](verification/setup-transactions.json).

## Case and signed Answer

Case ID: `dis_502a58eb-6de0-469c-a652-5afccebe1498`.
The local case page is `http://localhost:3417/disputes/dis_502a58eb-6de0-469c-a652-5afccebe1498`, available when the retained app is running with its private credentials.
This is a local case, so there is no hosted public case link.
The app verified the referral against the on-chain PaymentInfo and accepted the registered terms salt.
The merchant signed the exact message returned by the app and the Answer endpoint accepted the receiver wallet signature.
The app recorded service as proven by participation at `2026-10-17T12:25:59.750Z`.
Its jurisdiction gate recorded `decision:proceed`, `consentValid:true`, and `inScope:true`.
The case pin is `ai_fast` with `appealWaived:false`.
A second signed referral returned the same case ID and did not create another case.
Capability tokens and signatures remain in private `.state/` files and are not included here.
The nonsecret case diagnostic excerpt is [verification/local-case.json](verification/local-case.json).

## Exact commands and blockers

The app build was launched after loading its isolated environment in a parent Node process.

```bash
node -e 'process.loadEnvFile(".env"); const {spawn}=require("node:child_process"); const c=spawn(process.execPath,["node_modules/next/dist/bin/next","build"],{stdio:"inherit",env:process.env}); c.on("exit",c=>process.exit(c??1));'
node node_modules/next/dist/bin/next start -p 3417
```

The first build invocation used `node --env-file=.env node_modules/next/dist/bin/next build` and failed with the following output.

```text
Error: Initiated Worker with invalid NODE_OPTIONS env variable: --env-file= is not allowed in NODE_OPTIONS
code: 'ERR_WORKER_INVALID_EXEC_ARGV'
```

The corrected build passed compilation, TypeScript, and static page generation, with eight Edge-runtime warnings from existing app imports.

The kit commands were run in this sequence.

```bash
npm run setup
npm run setup -- --execute
npm run setup
npm run merchant
npm run client
npm run refund
npm run refer
npm run answer
npm run observe
npm run local-adjudicate -- --close-record
```

Initial setup refused missing infrastructure as designed.
Execution then failed after broadcast with this SDK output.

```text
ConfigError: Deploy verification failed: no bytecode at 0xCF07EA214145c8CE16182804086B07F0bed55798
Version: @x402r/core@0.3.0-alpha.0
```

Later chain reads found bytecode at every predicted address, and the next read-only setup passed.
This is consistent with RPC visibility lag, but that cause was not proved.

The local close-record operation already caused the app to queue a run, so the subsequent explicit adjudication call returned this output.

```text
POST /api/disputes/dis_502a58eb-6de0-469c-a652-5afccebe1498/adjudicate -> 409: An adjudication run is already queued for this case (run_once_36e470bb19de7e0fe565ac59c161ceca).
```

The existing run was processed through its authenticated operator endpoint, without creating a second run.

```text
POST /api/adjudication-runs/run_once_36e470bb19de7e0fe565ac59c161ceca/process
{"runId":"run_once_36e470bb19de7e0fe565ac59c161ceca","status":"succeeded"}
```

The operator observation then showed the actual case blocker.

```text
caseId: dis_502a58eb-6de0-469c-a652-5afccebe1498
status: procedure_hold
reasonCodes: assigned_ai_decides, human_appeal_retained, cost_budget_configuration_error
party_fast_attempt: failed
error: AdjudicationCostBudgetConfigurationError
releasedToParties: false
executeAfter: null
usage.calls: 0
```

I omitted `MODEL_PRICING_JSON` from the isolated app environment.
The source environment's JSON was valid but also lacked a price entry for the active `glm-5.3-flash` model, so copying it alone would not resolve the active-model pricing requirement.
The app did not retain the thrown error's full message, only the error class and hold reason.
`lib/llm.ts:1192-1226` requires valid pricing and rejects an unpriced model, while `lib/adjudication/run.ts:815-889` records the configuration hold.
The stored hold disposition is not a served merits Award, and its hash is not presented as one.
No restart, pricing-control change, case repair, or further adjudication attempt was made during the initial run after this refusal.

## Authorized continuation, 2026-10-17

The orchestrator authorized unsetting `ADJUDICATION_COST_BUDGET_USD` in the isolated app environment and one small real-provider case through the admin restart and worker path.
The isolated `.env` already had no assignment for that variable.
The continuation explicitly removed any assignment and deleted any inherited process override before starting the retained production build on port 3417.
No model prices were invented or added.
A new private local worker credential was prepared only in the isolated app `.env`, but no worker was started.
The database was backed up to `tmp/kit-verification.pre-continuation-20261017.json` before starting the app.

The requested local divergence from production was to disable the cost budget, but a disabled-budget run did not occur.
Although [`docs/deploy/env-manifest.md:159`](https://github.com/shunhe-wang/arbitrator-ai/blob/7bf8c920d22c8b59cc293dbaa9a61445088be0a4/docs/deploy/env-manifest.md#L159) row 17a describes the general default as disabled, this case is pinned to `ai_fast`.
[`lib/llm.ts:1920`](https://github.com/shunhe-wang/arbitrator-ai/blob/7bf8c920d22c8b59cc293dbaa9a61445088be0a4/lib/llm.ts#L1920) returns zero when the variable is unset, but [`lib/adjudication/run.ts:962`](https://github.com/shunhe-wang/arbitrator-ai/blob/7bf8c920d22c8b59cc293dbaa9a61445088be0a4/lib/adjudication/run.ts#L962) constructs this fast case's budget as follows.

```js
const configuredCost = adjudicationCostBudgetUsd();
const budget = new TokenBudget(adjudicationTokenBudgetLimit(routeMeritsModels(initial), boundedResearch ? activeProvider().provider : undefined),
  electedFast ? Math.min(configuredCost || 0.025, 0.025) : configuredCost);
```

Consequently, unsetting the environment override leaves a $0.025 runtime cap on this fast case, and explicit zero would do the same.
The general default does not disable this fast-track cap, so no successful disabled-budget verification or production parity is claimed.
This source/documentation mismatch was reported without changing app code or the case's pinned procedure.

Before submitting the admin restart, the worker's readiness prerequisite was checked with `GET http://localhost:3417/api/ready`.
It returned HTTP 503 on the first request, with this exact JSON body.

```json
{
  "ok": false,
  "status": "not_ready",
  "details": {
    "rulesVersion": "1.1",
    "backend": "json",
    "checks": [
      { "name": "store", "ok": true, "detail": "json" },
      { "name": "llm", "ok": true, "detail": "provider=zai keyPresent=true effectiveMock=false" },
      { "name": "research", "ok": true, "detail": "direct Z.ai key reused" },
      { "name": "model_configuration", "ok": true, "detail": "no retired or invalid model variables" },
      { "name": "metadata_parsers", "ok": true, "detail": "3 parsers resolve" },
      { "name": "admitted_image_delivery", "ok": true, "detail": "0 open image-dependent case(s); assigned image delivery available" },
      { "name": "deployment", "ok": false, "detail": "invalid=app_url_missing,public_demo_shared_rate_limit_missing,legal_research_architecture_missing" },
      { "name": "rules", "ok": true, "detail": "v1.1 sha256=fea33523dd43c2ce6c48db95920df052c9098f6d29938eb83ffb7ae864fa6925" },
      { "name": "schema", "ok": true, "detail": "json backend (no schema to verify)" },
      { "name": "database_environment", "ok": true, "detail": "json backend (no marker to verify)" }
    ]
  }
}
```

The real Z.ai provider was configured, but the missing deployment settings blocked worker readiness.
Following the instruction to stop on a failed step, there was no readiness retry, admin restart submission, worker launch, or model call.
The retained case still has only the original run `run_once_36e470bb19de7e0fe565ac59c161ceca`, attempt 1, and zero technical restarts.
Its actual status remains `procedure_hold`, with `releasedToParties:false` and `executeAfter:null`.
There is no served Award allocation, signature, or service timestamp to report, and the seven-day stay has not begun.

An independent Base Sepolia read at block `48236190`, observed at `2026-10-17T12:37:48.750Z`, confirmed `capturableAmountBaseUnits:"10000"` and `refundableAmountBaseUnits:"0"`.
The payment therefore remains open and fully capturable for 0.01 test USDC.
The nonsecret readiness response, retained case state, and chain read are preserved in [verification/continuation.json](verification/continuation.json).
Server PID `45773` was stopped with `SIGTERM`, and no listener remained on port 3417.
The app checkout, completed build, isolated `.env`, database, backup, and original private kit case handles remain available for authorized recovery.

## Case 1 historical future settlement command

The Award-only continuation's orchestrator instruction cancelled stay shortening and settlement verification for that first-case session.
No database was edited directly, no finality or timing field was changed, and no settlement sweep was run.
The following command remains a future procedure and is not authority to execute it during the Award-only continuation.

There is currently no eligible settlement execution because no Award has been served and no `executeAfter` exists.
After the configuration issues are resolved within a new authorization, an eligible admin restart completes, an actual Award is served, its `executeAfter` has passed, and no appeal or other stay blocks execution, start the retained app in its own terminal.

```bash
cd "$APP_WORKTREE"  # the local People's Court app checkout used for verification
env -u ADJUDICATION_COST_BUDGET_USD node node_modules/next/dist/bin/next start -p 3417
```

The app's execution clock will check due served Awards, and this exact command in a second terminal explicitly invokes the same gated sweep.
It is documented for future use and was not run during this continuation.

```bash
cd "$APP_WORKTREE"  # the local People's Court app checkout used for verification
node --env-file=.env --input-type=module <<'JS'
import assert from 'node:assert/strict';
assert.equal(process.env.X402R_CHAIN, 'base-sepolia');
const headers = { 'x-arb-admin-token': process.env.ARB_ADMIN_TOKEN };
const id = 'dis_502a58eb-6de0-469c-a652-5afccebe1498';
const base = 'http://localhost:3417';
const before = await fetch(`${base}/api/disputes/${id}`, { headers });
assert(before.ok, `Case read failed: HTTP ${before.status}`);
const { data } = await before.json();
assert(data.disposition?.releasedToParties && data.disposition.executeAfter,
  'No served Award and execution date.');
assert(Date.now() >= Date.parse(data.disposition.executeAfter), 'Execution stay has not ended.');
const result = await fetch(`${base}/api/proceedings/sweep`, { method: 'POST', headers });
console.log(`HTTP ${result.status}\n${await result.text()}`);
assert(result.ok, 'Sweep failed. Stop and inspect the recorded response.');
JS
```

The server rechecks finality and applicable stays and executes the bound Award through its adapter.
A successful sweep response alone is not proof of settlement, so verify the resulting case audit transaction hash, successful Base Sepolia receipt, and payment state afterward.
The `/api/disputes/{id}/settle` route is only a retry from `settlement_action_required`, not the initial execution route from `served_awaiting_execution`.

## Award-only continuation after readiness repair, 2026-10-17

The orchestrator supplied staging's real `MODEL_PRICING_JSON`, including the selected `glm-5.3-flash` model, in the isolated app `.env`.
That value was preserved without modification or display and is absent from the committed evidence.
The global budget environment override remains unset, and the pinned fast procedure's $0.025 cap remains enabled.
This was not a disabled-cost-budget run.
The latest scope authorized app-supported adjudication recovery and worker processing only, and expressly cancelled all database edits, timing changes, and settlement sweeps.

The following nonsecret local values were set in the isolated `.env`.

```dotenv
APP_URL=http://localhost:3417
PUBLIC_DEMO_ENABLED=false
LEGAL_RESEARCH_ARCHITECTURE=shared_clerk_judge_research_v2
NODE_ENV=development
ADJUDICATION_EXECUTION_MODE=queue
X402R_VERIFY_REFERRALS=true
X402R_ALLOW_SYNTHETIC_PAYMENT_STATE=false
```

Development mode permits the requested HTTP loopback origin because the production readiness profile requires HTTPS.
The existing compiled build was used, with no app source edits or rebuild needed for these runtime values.
This local development mode and the separate filing-fee waiver differ from a hosted production configuration.
The real provider remained Z.ai, live chain verification stayed enabled, and synthetic payment state stayed disabled.
The app printed Next's warning about its nonstandard `NODE_ENV` combination with `next start`, which was retained as a local verification limit.

At `2026-10-17T13:19:57.311Z`, authenticated `GET /api/ready` returned HTTP 200 with `status:"ready"` and every check passing, including `deployment:"valid"`.
The full nonsecret response is in [verification/award-attempt.json](verification/award-attempt.json).

The admin technical-restart path was inspected and invoked for the original case with revision 18 and source run `run_once_36e470bb19de7e0fe565ac59c161ceca`.
At `2026-10-17T13:25:53.611Z`, its POST returned HTTP 409 with this exact response.

```json
{
  "ok": false,
  "code": "restart_refused",
  "error": "The hold has another cause with its own cure; only an interrupted adjudication stage can be restarted. An opinion, disposition or fast memorandum exists; merits work cannot be restarted. The latest run is not a technical failure.",
  "data": {
    "refusals": [
      "attention_not_restartable",
      "merits_output_exists",
      "no_held_run"
    ]
  }
}
```

The technical-restart policy excludes every saved disposition and requires a failed or interrupted technical run, whereas the original cost-budget stop saved a no-merits disposition and marked the run succeeded.
The app's ordinary Administrator adjudication path explicitly permits retry of an unreleased no-merits stop record in `lib/adjudication/merits-work.ts:7-26`.
That supported retry path was used without clearing history, changing the Record, or editing the database directly.
At `2026-10-17T13:26:06.992Z`, `POST /api/disputes/dis_502a58eb-6de0-469c-a652-5afccebe1498/adjudicate` returned HTTP 202 with `queued:true` and run ID `run_5989855b-52b1-4938-b2cd-613f87c7726e`.

The actual `scripts/worker.mjs` process, PID `82726`, used only its isolated worker credential and local API URL.
It claimed that queued run at `2026-10-17T13:26:21.691Z` and failed at `2026-10-17T13:26:22.296Z`.
The stored run response reported the following exact failure.

```text
status: failed
failureKind: technical_failure
attempt: 1
error: Error: Frozen adjudication Record differs from its saved work.
```

The run's recorded messages were:

```text
Adjudication run queued.
Worker claimed and started adjudication pipeline.
Dispute rolled back from 'triaged' to 'procedure_hold' after technical failure.
Worker failed adjudication pipeline.
Bounded automatic retries are exhausted. The run is in a typed technical hold; an operator may repair and start a fresh bounded AI run but may not decide the merits.
```

`lib/adjudication/checkpoint.ts:158` refuses a journal whose saved `recordHash` differs from the current frozen Record hash.
The checkpoint was not bypassed, and the specific reason for the hash difference was not established in this bounded run.
After this run failure, no second worker run, further restart, or app fix was attempted.
The app and worker were stopped by PID, and no listener remained on port 3417.

The case remains `procedure_hold`, revision 22, with technical attention `interrupted_adjudication_stage`.
The prior no-merits disposition remains unserved, `releasedToParties:false`, and `executeAfter:null`.
There is no merits Award allocation, signature, or Award service timestamp to report.
The seven-day stay has not begun.
The failed run recorded zero merits call intents, and the retained disposition usage still reports zero model calls.
No provider result or mock response was substituted for an Award.

A read at Base Sepolia block `48237675`, observed at `2026-10-17T13:27:19.216Z`, confirmed the payment remains fully capturable for `10000` base units, with zero in the refundable slot.
No chain transaction was submitted during this continuation.
Comparison against the pre-run database backup confirmed that the existing disposition's finality fields and the case's procedure terms are unchanged.
The app build, isolated environment, database, backups, and private case handles are retained.
The latest attempt's readiness, recovery responses, worker failure, chain read, and unchanged-finality assertions are in [verification/award-attempt.json](verification/award-attempt.json).

## Hosted gaps and app observations, without fixes

The live staging discovery response was fetched read-only and reported `active:true`.
It advertised the production referral URL `https://peoplescourt.ai/api/x402r/referral`.
The endpoint is hard-coded in [`app/api/x402r/arbiter-registration/route.ts:16`](https://github.com/shunhe-wang/arbitrator-ai/blob/7bf8c920d22c8b59cc293dbaa9a61445088be0a4/app/api/x402r/arbiter-registration/route.ts#L16), which also explains why the local instance advertises production.
This is a staging-discovery defect to resolve before an outside developer follows that URL.

[`docs/deploy/env-manifest.md:90`](https://github.com/shunhe-wang/arbitrator-ai/blob/7bf8c920d22c8b59cc293dbaa9a61445088be0a4/docs/deploy/env-manifest.md#L90) specifies that staging's arbiter key is unset unless a separate test x402r settlement exercise is approved.
The manifest requires a read-only operator and terms registration plus escrow and payment recovery configuration for verified intake, with the writer key on the executor.
It does not establish the live presence of a staging x402r watcher or executor.
No Railway settings or secrets were inspected, so their actual presence remains unverified.
An outside developer must obtain an HMAC operator integration credential through `contact@peoplescourt.ai`, as discovery explicitly says, and arrange operator registration and service.
An active discovery document is insufficient proof of usable intake, watcher delivery, or execution.

The fee-confirm response returns an invite but no `messageToSign` when there is no registered receiver endpoint, as shown in [`app/api/x402r/fee/confirm/route.ts:140-159`](https://github.com/shunhe-wang/arbitrator-ai/blob/7bf8c920d22c8b59cc293dbaa9a61445088be0a4/app/api/x402r/fee/confirm/route.ts#L140).
This is a source-inspected handoff gap, not a fee payment tested in this run.
The example documents public service-notice delivery or operator relay rather than reconstructing consent text.

The initial local demo helper encountered the normal queue race described above.
The kit helper now looks for the existing queued run and handles that race, but was not rerun on the held case.
The app's processing response used `status:succeeded` even though the case was on hold, while the party-scoped read showed `submissions_complete`.
Those are observed status differences, not evidence of a served Award.
No app fix was attempted.

## Verification checks and remaining work

`npm ci --ignore-scripts` and `npm run check` passed in a separate clean copy of this directory.
All four contract checks passed, using independent signature, HMAC, deadline, and explicit chain/port requirements.
Every `.mjs` file passed `node --check`.
`npm run verify:record` independently reread the payment from RefundRequest storage, checked its hash and terms salt, all five successful receipts, contract bytecode, hold duration, and the on-chain evidence digest.
The final observed payment state was `[true,10000,0]`, meaning 10,000 base units remain capturable and the refundable slot is zero.
No root SDK checks or app source tests were claimed for this example-only change.

Remaining steps are:

1. Resolve the frozen-Record checkpoint mismatch and select an app-supported recovery for the saved no-merits disposition within a new authorization, preserving the original Record and journal.
2. Use the retained ready local configuration and real pricing to process that authorized AI run, then verify an actual served Award, signature, service timestamp, and `executeAfter`.
3. Wait the seven-day stay after actual Award service and resolve any timely appeal or other stay before letting the app executor act.
4. Record the resulting `void`, `capture`, or `refuse` receipt and compare its successful on-chain result to the Award and current payment state.
5. If a later run tests post-capture payer relief, separately verify merchant `refund()` and authenticated `/api/x402r/execution` receipt reporting.
6. Independently exercise fee collection, public service-notice delivery, watcher intake, and hosted staging configuration before claiming those paths verified.
7. Resolve staging discovery's production URL and confirm staging's operator registration, HMAC provisioning, executor key and funding, and watcher or direct-referral operation.

For any future eligible authorized restart, first read the technical-restart status and use its current revision and source run ID, with the operator's substantive technical reason.
The latest failed run is `run_5989855b-52b1-4938-b2cd-613f87c7726e`, and the original source run ID must not be reused as though it were current.
The saved no-merits disposition still requires a supported recovery decision before assuming that technical restart is eligible.
Process the returned new run ID at `POST /api/adjudication-runs/{runId}/process` with the operator credential, then use `npm run observe` and `npm run observe -- --operator` to verify the party and operational views.
Do not reuse a stale revision, silently repeat the completed run, or rerun the close-record helper on the held case.

The local database, private credentials and case handles are retained for operator recovery, and the app worktree remains at its supplied commit.
The app, merchant, and worker helper processes were stopped by their recorded PIDs before completion.
No push, PR, npm publication, deployment, Railway operation, third-party message, Base mainnet transaction, or use of port 3000 occurred.

## Case 2: fresh isolated end-to-end run, 2026-10-17

This new synthetic case completed the full local integration through a real Base Sepolia settlement transaction.
The allocation was 0.01 USDC to the claimant, who is the payer, with no merchant allocation or holdback.
This section reports allocation only and does not characterize the merits.
The seven-day stay was shortened only for this case with sw's express approval, as detailed below.
This verifies the executor and chain path, not Rules-path timing.

### Isolation, configuration, and commands

App checkout: `arbitrator ai/.claude/worktrees/mvp-x402r-kit2`, revision `7bf8c920d22c8b59cc293dbaa9a61445088be0a4`.
App URL: `http://localhost:3418`.
New JSON database: `tmp/kit2-verification.db.json`, absent before this run.
The older app checkout and its database were not accessed or modified during this run.
Ports 3000 and 3417 were not used.
The existing operator and funded payer and merchant wallets from the address table above were reused, without another deployment.
Kit state from case 1 was archived privately before obtaining the fresh offer and payment nonce.
The kit's app URL and operator credentials were set from the new isolated environment without printing them.
The app's prepared `.env` was not edited.
Its real staging `MODEL_PRICING_JSON` already covered `glm-5.3-flash` and was neither modified nor displayed.

The local environment disabled the optional general cost budget by leaving `ADJUDICATION_COST_BUDGET_USD` unset, consistent with [environment manifest row 17a](https://github.com/shunhe-wang/arbitrator-ai/blob/7bf8c920d22c8b59cc293dbaa9a61445088be0a4/docs/deploy/env-manifest.md#L159), which diverges from production.
This does not disable the fast procedure's separate $0.025 cap constructed in `lib/adjudication/run.ts`.
No model price was invented and no budget refusal was bypassed.
Other local differences were `NODE_ENV=development`, a JSON database, and `FEE_WAIVE_FILING=true`.
Prepared readiness settings included `APP_URL=http://localhost:3418`, `PUBLIC_DEMO_ENABLED=false`, and `LEGAL_RESEARCH_ARCHITECTURE=shared_clerk_judge_research_v2`.
Referral chain verification remained enabled and synthetic payment-state acceptance remained disabled.
Authenticated readiness returned HTTP 200 at `2026-10-17T13:41:18.810Z`, with `provider=zai keyPresent=true effectiveMock=false`.
See [readiness.json](verification/case2/readiness.json).

The build loaded the isolated environment in a parent process, with production mode for the build only.
It completed compilation, TypeScript, and static generation successfully.

```bash
node -e 'process.loadEnvFile(".env");const{spawn}=require("node:child_process");const c=spawn(process.execPath,["node_modules/next/dist/bin/next","build"],{env:{...process.env,NODE_ENV:"production"},stdio:"inherit"});c.on("exit",code=>process.exit(code??1));' > tmp/kit2-build.log 2>&1
```

The completed app was started on 3418 with its prepared development environment and the real `scripts/worker.mjs` worker.
Every signing or transaction path asserted `X402R_CHAIN=base-sepolia`, and the RPC reported chain ID `84532`.
The kit sequence was `npm run setup` for read-only reuse, then `merchant`, `client`, `refund`, `refer`, and `answer`.
The paid resource, refund evidence, signed HMAC referral, and receiver-signed Answer all used the fresh payment.
No watcher was needed because the direct signed referral was accepted.
The supported Administrator `POST /api/disputes/dis_15b1be10-b232-4e44-9b20-4a50df8ad6ce/exchange` closed the completed exchange at `2026-10-17T13:42:17.215Z` using real current time and the current revision.
Its audit recorded `forced:true` and the reason `Fresh local testnet kit verification: both protocol parties have filed; close the completed exchange through the app operator path.`
This closed the filing Record early through the app API, and did not alter Award service or finality.
The normal app path automatically queued run `run_once_097f6fa6381bf0d85a154ad2c57c1d93`.
The actual worker completed attempt 1 with `status:succeeded` and `step:party_fast_attempt_accepted`.
The real Z.ai `glm-5.3-flash` call recorded `1` model call and `4213` tokens.
No admin restart or adjudication retry was needed for this new case.
See [worker.json](verification/case2/worker.json) and [case.json](verification/case2/case.json).

### Fresh chain and case evidence

Case ID: `dis_15b1be10-b232-4e44-9b20-4a50df8ad6ce`.
Local case URL when the retained app is started: `http://localhost:3418/disputes/dis_15b1be10-b232-4e44-9b20-4a50df8ad6ce`.
This local database has no hosted public case URL.
PaymentInfo hash: `0x0158c673a6fdc2b235ea469b74fb6ddc7f174ede92771b19522bfecebcee94fd`.
Amount: `10000` base units, or 0.01 USDC.
The immutable salt equals `0x518669710687625d2c6260229475a23eef322879c607a0bd73fb588cbf113f1a`, binding the registered tuple before signing ERC-3009.
The on-chain hold remains 31 days, ending `2026-11-17T13:41:30.000Z`.
Authorization and refund deadlines remain `2026-11-18T13:41:27.000Z`.
No on-chain time, authorization deadline, or escrow duration was changed for the shortened-stay test.

| Step | Successful Base Sepolia transaction | Block | Block time UTC |
|---|---|---|---|
| authorization | [`0xc8e59281281faffe54229c20903b85648441351a3ec9b03f4c846c72bf033c35`](https://sepolia.basescan.org/tx/0xc8e59281281faffe54229c20903b85648441351a3ec9b03f4c846c72bf033c35) | 48238101 | 2026-10-17T13:41:30.000Z |
| refundRequest | [`0xf5e73763b243ffaf06b1ea3084a3c838fa4f6018e4e1f5c02f1f48af9518b848`](https://sepolia.basescan.org/tx/0xf5e73763b243ffaf06b1ea3084a3c838fa4f6018e4e1f5c02f1f48af9518b848) | 48238109 | 2026-10-17T13:41:46.000Z |
| evidence | [`0xaeb8b205af17786260066e4a7ea12c6a24ad3dbb356354e0416d4af243643f71`](https://sepolia.basescan.org/tx/0xaeb8b205af17786260066e4a7ea12c6a24ad3dbb356354e0416d4af243643f71) | 48238111 | 2026-10-17T13:41:50.000Z |
| settlement | [`0x42abd48f2c8eecfcb4d67319bb300efab495a99c0a1ff89656abe40e9a21f348`](https://sepolia.basescan.org/tx/0x42abd48f2c8eecfcb4d67319bb300efab495a99c0a1ff89656abe40e9a21f348) | 48238252 | 2026-10-17T13:46:32.000Z |

Each receipt was checked directly on chain for success, and the settlement receipt had `33` confirmations at the recorded independent read.
The payer submitted the evidence on chain with role `0`.
Its retrieved data URI bytes have SHA-256 `c4cb3a6f93981f08016ccee7809488a3bd56e3197d4a39fd9cbd12595bd33d1d`.
See [chain.json](verification/case2/chain.json) for PaymentInfo, receipt and block metadata, evidence binding, and payment-state observations.

### Served Award evidence

Disposition ID: `awd_f97bec58-d75d-45b7-82c1-14c76ba79be7`.
Award hash, recipe v3 SHA-256: `c9354075b25824992426fa4697b078c9d01043f9e9381cf8951474b853fa4fe9`.
Service timestamp: `2026-10-17T13:42:34.587Z`.
Original executeAfter: `2026-10-24T13:42:34.587Z`, exactly 168 hours after service.
Allocation: `claimant/payer: 0.01 USDC; respondent/merchant: 0; holdback: 0`.
Signature algorithm: `eip191`.
Trusted signer: `0xA64DC1d426ED26681508f2E99a600Cb46b217cbD`.
Signature time: `2026-10-17T13:42:34.848Z`.

```text
0x33718d030502f42a37183ee3359fdabba6d4bf76aed4b788e0df669516fbac351c2248e8a6f1826e1c0d2c937009a17ecec9b7845914c55ee4bef92f01437aaf1b
```

The signed hash equals the Award hash above.
An independent canonical-manifest SHA-256 recomputation and viem EIP-191 verification both passed.
The verification trust anchor was derived privately from the new isolated app's configured signing key, rather than trusting only the signer claimed by the response.
Party-authenticated downloads of all three actual served artifact formats returned HTTP 200 and matched their signed manifest's byte length and SHA-256.

| Served artifact | Byte length | SHA-256 |
|---|---|---|
| PDF | 36207 | `e92fb24bda0a1a472f12e529493eb6ae7f03a40aa6790e1013cfd8cfa7843521` |
| DOCX | 11798 | `ba8b99701f5e41ad75ee36b77cb68e09fc57f971427d348bb5eb2bab88945548` |
| JSON | 11572 | `a3372411d84dc7be194caff12b6386a0a2afe46198a485ce741c47b8f48eec73` |

At `2026-10-17T13:45:00.147Z`, before changing the stay, the live payment state was `[true, "10000", "0"]`, meaning 0.01 USDC remained fully capturable and nothing was already captured.
The signed manifest, signature, and independent proof are in [award.json](verification/case2/award.json).
After settlement, the same party-authenticated manifest and signature were retrieved again and remained identical.

### Stay shortened for local verification (sw-approved 2026-10-17)

The user explicitly relayed sw's approval: "You approve a direct edit of the stay in that local test database (it's a synthetic case with our own wallets)... yeah let's do (1) today".
No supported arbitrary test clock or Administrator stay-shortening command was found in the tested app source.
The Rules 1.1 stay is fixed, and the older `APPEAL_WINDOW_HOURS` override is not an applicable test clock for this case.
The approved direct edit was therefore limited to the new isolated database and this new case.
The worker PID `17137` and app PID `16403` were stopped with SIGTERM and their exit was verified before the edit.
The original database was copied byte-for-byte to `tmp/kit2-verification.db.before-stay-2026-10-17T13-46-10-321Z.json` before any change.
Backup SHA-256: `cb378e6b834e56d2696992dc1ba5abca94fd8ba70f9140a622ed7ffe18b93063`.

At `2026-10-17T13:46:10.321Z`, the following was the entire semantic database diff.

| JSON path | Old value | New value |
|---|---|---|
| `/dispositions/0/executeAfter` for disposition `awd_f97bec58-d75d-45b7-82c1-14c76ba79be7` | `2026-10-24T13:42:34.587Z` | `2026-10-17T13:45:10.322Z` |

No other field was changed directly.
There were no appeal records, appeal reservations, post-award requests, referral-arbitrator objections, or monetary supplements requiring another deadline change.
The service timestamp, appeal entitlement, Rules pin, immutable artifact revision, signed manifest, signature, allocation, and on-chain deadlines were preserved.
The source executor checks the explicit stored `executeAfter` in `lib/adjudication/executable-now.ts` and pending requests in its appeal and post-award predicates.
Unfiled post-award request windows did not create another execution gate.
A deep comparison against the backup asserted exactly the one path above before the edited JSON was atomically installed.
See [stay-change.json](verification/case2/stay-change.json).
This verifies the executor and chain path, not Rules-path timing.

### Gated settlement and live result

The app was restarted on 3418 as PID `35860`, with `X402R_CHAIN=base-sepolia` asserted and RPC chain ID 84532 checked again.
The completed worker was not restarted because no further adjudication was required.
After readiness passed, the authenticated `POST /api/proceedings/sweep` used the app's normal execution, procedure, service, pending-request, and signed-artifact gates.
No direct wallet execution script, mocked adapter, or injected chain result was used.
The sweep returned HTTP 200 at `2026-10-17T13:46:34.523Z` with the following relevant output.

```json
{"ok":true,"executedAwards":["dis_15b1be10-b232-4e44-9b20-4a50df8ad6ce"],"errors":[],"busy":[]}
```

The unabridged nonsecret response is in [sweep.json](verification/case2/sweep.json).
The settlement operation was confirmed after one submission attempt.
Transaction: [`0x42abd48f2c8eecfcb4d67319bb300efab495a99c0a1ff89656abe40e9a21f348`](https://sepolia.basescan.org/tx/0x42abd48f2c8eecfcb4d67319bb300efab495a99c0a1ff89656abe40e9a21f348).
The transaction sender was the configured arbiter `0xa64dc1d426ed26681508f2e99a600cb46b217cbd` and destination was the reused PaymentOperator `0x80754ba4594af01726ee8ce80f30b5362227eca7`.
The AuthCaptureEscrow emitted `PaymentVoided(0x0158c673a6fdc2b235ea469b74fb6ddc7f174ede92771b19522bfecebcee94fd, 10000)`.
Canonical Base Sepolia USDC emitted a transfer of `10000` base units from token store `0x5464155B2a9B3c0D844AF593fee60d0C4b3099E1` to payer `0x6da64CDC42A5D8458e993ac7ff0613c2DbA288F6`.
The live payment state became `[true, "0", "0"]`, with no remaining capturable or refundable balance.
Those independent observations match the Award's payer-only allocation.
The app's final status is `final_release_executed`.
This case needs no further settlement command.

### Defects, diagnostic errors, limits, and cleanup

No app failure blocked case 2, and no app source fix was made.
An app timestamp defect was observed: the journal's `confirmedAt`, disposition's `finalizedAt`, and `settlement_executed` audit timestamp are `2026-10-17T13:46:30.996Z`, before the transaction's block time `2026-10-17T13:46:32.000Z` and the actual confirmation log at `2026-10-17T13:46:34.515Z`.
[`lib/settlement/execution-journal.ts:234`](https://github.com/shunhe-wang/arbitrator-ai/blob/7bf8c920d22c8b59cc293dbaa9a61445088be0a4/lib/settlement/execution-journal.ts#L234) captures `now` before provider I/O, and [`finalizeConfirmed` at line 157](https://github.com/shunhe-wang/arbitrator-ai/blob/7bf8c920d22c8b59cc293dbaa9a61445088be0a4/lib/settlement/execution-journal.ts#L157) passes that earlier timestamp to finalization.
Those app timestamps should not be treated as chain confirmation times; the independent receipt and block observations above establish the actual chain result.
This metadata issue was reported without an app fix.
The known staging discovery URL defect, undocumented live executor/watcher configuration, and first-case frozen-Record failure remain as previously recorded and were not repaired.
The kit observer had read execution metadata from `dispute.settlementExecution`; this successful response places it on `disposition.settlementExecution`, so that kit output was corrected.
Active local defaults were moved to 3418 to avoid the old app's port.
Two read-only ad hoc proof commands had field-name mistakes and were each corrected once, with no failed chain write or duplicate submission.
Their exact error messages were `Error: GET /api/disputes/undefined -> 404: Not found` from using `disputeId` instead of the private handle's `caseId`, and `TypeError: Cannot read properties of undefined (reading 'toLowerCase')` from using `ctx.arbiterAddress` instead of `ctx.arbiter`.

Still unverified are the natural seven-day wait and subsequent execution, actual appeals or timely post-award requests, merchant-allocation capture, threshold refusal, split/partial capture, captured-payment merchant refund, watcher delivery/recovery, hosted fee collection and notice relay, and hosted provider/executor configuration.
An operator must address the hosted discovery destination, register the exact operator and terms tuple, provision an HMAC credential, and confirm the separate staging arbiter key, executor, worker, and any watcher before an outside developer can rely on hosted completion.
No inference about live hosted credentials is drawn from this local success.

App PID `16403`, worker PID `17137`, settlement app PID `35860`, and merchant PID `14783` were stopped by their recorded PIDs, with exit verified at `2026-10-17T13:48:04.948Z`.
No process was killed by pattern.
The new app worktree is clean after restoring only Next's generated `next-env.d.ts`.
The completed build, isolated environment, final database, timestamped backup, and private kit state remain in place.
Only public kit files and nonsecret evidence are included in the local commit.
After the small kit default and observer corrections, `npm run check` passed all four existing behavioral checks, and `git diff --check` passed.
Every new public JSON evidence file parsed successfully, and the public documentation and evidence were checked against the configured secret values without displaying those values.
