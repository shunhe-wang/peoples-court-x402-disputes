# Base Sepolia evidence runbook

Status: one complete protocol-level evidence run passed on 2026-07-30. This was
a local merchant fixture, not a deployed production integration.

Base Sepolia uses CAIP-2 network `eip155:84532`, EVM chain ID `84532` (`0x14a34`), and the official public read-only RPC endpoint `https://sepolia.base.org`.

Source: [Base network documentation](https://docs.base.org/base-chain/quickstart/connecting-to-base).

The verifier defaults to `https://base-sepolia-rpc.publicnode.com` because this repository has observed state lag across the load-balanced official endpoint during fresh-transaction verification. The official endpoint can still be supplied explicitly with `--rpc-url`.

## Completed evidence run

The approved run used x402 2.20.0 and SDK version 0.1.0 at commit
`a09781594e2aaf26bda1b73aad2c002cf4998251`.

- Transaction:
  [`0xd1aa7830aa1c87dccf04e85218a2feebc2b5e4b081eeafcf90ad9aa5b41a8819`](https://sepolia.basescan.org/tx/0xd1aa7830aa1c87dccf04e85218a2feebc2b5e4b081eeafcf90ad9aa5b41a8819)
- Base Sepolia block: `44832360`
- Asset: official Base Sepolia USDC at
  `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Transfer: `10,000` atomic units (`0.01` test USDC) from the dedicated payer
  to a separate merchant
- Packet hash:
  `381b62ecc9d0cb10081c621fb92da0ac5daf72f6ae78b25d2147849089856aee`
- Settlement time: `2026-07-30T17:36:48.000Z`

The run preserved the signed `PaymentPayload` in private ignored storage before
calling the facilitator. The derivative packet preserved the
`PaymentRequired`, facilitator verification and settlement responses, packet,
metadata, test artifacts, and hashes. The verifier independently reproduced
the successful receipt and exact transfer through both the default publicnode
endpoint and the official Base endpoint.

The run also recovered the acceptance signer, rejected an altered acceptance
resource before facilitator verification, and rejected packet copies with an
altered settlement transaction or payment amount.

This evidence proves the test transfer and the SDK packet bindings. It does not
prove dispute merits, service performance, production deployment, or an
external integration. No case, award, refund, or mainnet transaction occurred.

## Evidence record

After an approved ordinary-x402 test transaction, preserve this JSON record:

```json
{
  "schemaVersion": 1,
  "network": "eip155:84532",
  "transactionHash": "0x<64 hex characters>",
  "packet": {
    "<complete X402DisputePacketV1>": "..."
  }
}
```

The packet must have been built from the settled payment and must carry the same transaction hash. It contains payment and authorization hashes, not the raw authorization.

## Verification

Build the package, then verify the local bindings without making a network request:

```sh
npm run build
node scripts/verify-base-sepolia-evidence.mjs --offline evidence.json
```

Verify the chain, mined transaction, successful receipt, matching block, and exactly one ERC-20 `Transfer` whose token, payer, payee, and atomic amount match the packet:

```sh
node scripts/verify-base-sepolia-evidence.mjs evidence.json
```

An alternate approved read-only endpoint can be supplied with `--rpc-url`.

The verifier never requests a private key, signs, broadcasts, retries, or moves funds. It calls only `eth_chainId`, `eth_getTransactionByHash`, and `eth_getTransactionReceipt`.

This proves the packet is bound to the matching onchain token transfer. It does not independently prove the offchain x402 negotiation, facilitator policy, service performance, payer identity, or dispute merits; preserve the complete payment transcript separately.

## Approval gate for future runs

Before sending a test transaction:

1. approve the exact payer, seller, resource, amount, asset, and facilitator;
2. use a dedicated test wallet with bounded Base Sepolia ETH and test assets;
3. confirm the merchant declaration and payer acceptance are human-reviewed;
4. preserve the `PaymentRequired`, accepted `PaymentPayload`, `SettleResponse`, packet, package commit, x402 versions, and verifier output;
5. file the resulting public transaction URL without claiming production or security approval; and
6. rotate or destroy temporary credentials according to the approved wallet procedure.

This completed run does not authorize any additional transaction. Every future
testnet or mainnet value movement requires separate approval.
