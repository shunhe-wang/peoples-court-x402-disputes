# Base Sepolia evidence runbook

Status: the verifier is implemented locally. No transaction has been sent.

Base Sepolia uses CAIP-2 network `eip155:84532`, EVM chain ID `84532` (`0x14a34`), and the official public read-only RPC endpoint `https://sepolia.base.org`.

Source: [Base network documentation](https://docs.base.org/base-chain/quickstart/connecting-to-base).

The verifier defaults to `https://base-sepolia-rpc.publicnode.com` because this repository has observed state lag across the load-balanced official endpoint during fresh-transaction verification. The official endpoint can still be supplied explicitly with `--rpc-url`.

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

## Approval gate for the actual run

Before sending a test transaction:

1. approve the exact payer, seller, resource, amount, asset, and facilitator;
2. use a dedicated test wallet with bounded Base Sepolia ETH and test assets;
3. confirm the merchant declaration and payer acceptance are human-reviewed;
4. preserve the `PaymentRequired`, accepted `PaymentPayload`, `SettleResponse`, packet, package commit, x402 versions, and verifier output;
5. file the resulting public transaction URL without claiming production or security approval; and
6. rotate or destroy temporary credentials according to the approved wallet procedure.

The transaction itself remains deferred until credentials, test funding, and external execution are explicitly approved.
