#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyX402DisputePacketIntegrity } from "../dist/index.js";

export const BASE_SEPOLIA_NETWORK = "eip155:84532";
export const BASE_SEPOLIA_CHAIN_ID = "0x14a34";
export const DEFAULT_BASE_SEPOLIA_RPC =
  "https://base-sepolia-rpc.publicnode.com";

const TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX_QUANTITY = /^0x[0-9a-fA-F]+$/;
const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const RPC_TIMEOUT_MS = 15_000;

function exactKeys(value, expected, label) {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  assert.deepEqual(
    Object.keys(value).sort(),
    [...expected].sort(),
    `${label} has missing or unsupported fields`,
  );
}

async function rpc(rpcUrl, method, params, fetchImpl) {
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });
  assert.equal(
    response.ok,
    true,
    `${method} returned HTTP ${response.status}`,
  );
  const body = await response.json();
  assert.equal(
    body.error,
    undefined,
    `${method} failed: ${JSON.stringify(body.error)}`,
  );
  return body.result;
}

function addressTopic(address) {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
}

function matchingPaymentTransfer(packet, receipt) {
  assert.match(
    packet.payment.asset,
    EVM_ADDRESS,
    "packet.payment.asset must be an EVM token address",
  );
  assert.match(
    packet.payment.payTo,
    EVM_ADDRESS,
    "packet.payment.payTo must be an EVM address",
  );
  assert.match(
    packet.settlement.payer ?? "",
    EVM_ADDRESS,
    "packet.settlement.payer is required for onchain payment verification",
  );
  assert.ok(
    Array.isArray(receipt.logs),
    "transaction receipt has no log array",
  );
  const asset = packet.payment.asset.toLowerCase();
  const fromTopic = addressTopic(packet.settlement.payer);
  const toTopic = addressTopic(packet.payment.payTo);
  const amount = BigInt(packet.payment.amount);
  const matches = receipt.logs.filter((log) => {
    if (
      !log ||
      typeof log !== "object" ||
      log.removed === true ||
      String(log.address).toLowerCase() !== asset ||
      !Array.isArray(log.topics) ||
      log.topics.length !== 3 ||
      String(log.topics[0]).toLowerCase() !== ERC20_TRANSFER_TOPIC ||
      String(log.topics[1]).toLowerCase() !== fromTopic ||
      String(log.topics[2]).toLowerCase() !== toTopic ||
      typeof log.data !== "string" ||
      !HEX_QUANTITY.test(log.data)
    ) {
      return false;
    }
    return BigInt(log.data) === amount;
  });
  assert.equal(
    matches.length,
    1,
    "receipt must contain exactly one ERC-20 Transfer matching packet asset, payer, payee, and amount",
  );
  return matches[0];
}

export async function verifyBaseSepoliaEvidence(
  value,
  options = {},
) {
  exactKeys(
    value,
    ["schemaVersion", "network", "transactionHash", "packet"],
    "evidence",
  );
  assert.equal(value.schemaVersion, 1, "evidence.schemaVersion must equal 1");
  assert.equal(
    value.network,
    BASE_SEPOLIA_NETWORK,
    `evidence.network must equal ${BASE_SEPOLIA_NETWORK}`,
  );
  assert.match(
    value.transactionHash,
    TRANSACTION_HASH,
    "evidence.transactionHash must be a 32-byte EVM transaction hash",
  );

  const packet = await verifyX402DisputePacketIntegrity(value.packet);
  assert.equal(
    packet.valid,
    true,
    `packet integrity failed: ${packet.valid ? "" : packet.errors.join("; ")}`,
  );
  assert.equal(
    packet.value.payment.network,
    BASE_SEPOLIA_NETWORK,
    "packet payment is not on Base Sepolia",
  );
  assert.equal(
    packet.value.settlement.network,
    BASE_SEPOLIA_NETWORK,
    "packet settlement is not on Base Sepolia",
  );
  assert.equal(
    packet.value.settlement.transaction.toLowerCase(),
    value.transactionHash.toLowerCase(),
    "packet settlement transaction does not match evidence.transactionHash",
  );

  const summary = {
    valid: true,
    mode: options.offline ? "offline" : "online",
    network: BASE_SEPOLIA_NETWORK,
    transactionHash: value.transactionHash.toLowerCase(),
    packetHash: packet.value.packetHash,
    chain: null,
  };
  if (options.offline) return summary;

  const rpcUrl = options.rpcUrl ?? DEFAULT_BASE_SEPOLIA_RPC;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  assert.equal(typeof fetchImpl, "function", "fetch is not available");
  const chainId = await rpc(rpcUrl, "eth_chainId", [], fetchImpl);
  assert.equal(
    String(chainId).toLowerCase(),
    BASE_SEPOLIA_CHAIN_ID,
    "RPC endpoint is not Base Sepolia",
  );
  const transaction = await rpc(
    rpcUrl,
    "eth_getTransactionByHash",
    [value.transactionHash],
    fetchImpl,
  );
  assert.ok(transaction, "transaction was not found");
  assert.equal(
    String(transaction.hash).toLowerCase(),
    value.transactionHash.toLowerCase(),
    "RPC transaction hash mismatch",
  );
  assert.equal(
    String(transaction.chainId).toLowerCase(),
    BASE_SEPOLIA_CHAIN_ID,
    "transaction chain ID is not Base Sepolia",
  );
  const receipt = await rpc(
    rpcUrl,
    "eth_getTransactionReceipt",
    [value.transactionHash],
    fetchImpl,
  );
  assert.ok(receipt, "transaction receipt was not found");
  assert.equal(
    String(receipt.transactionHash).toLowerCase(),
    value.transactionHash.toLowerCase(),
    "RPC receipt hash mismatch",
  );
  assert.equal(receipt.status, "0x1", "transaction receipt is not successful");
  assert.match(
    receipt.blockNumber,
    HEX_QUANTITY,
    "transaction receipt has no block number",
  );
  assert.match(
    receipt.blockHash,
    TRANSACTION_HASH,
    "transaction receipt has no block hash",
  );
  assert.equal(
    transaction.blockNumber,
    receipt.blockNumber,
    "transaction and receipt block numbers do not match",
  );
  assert.equal(
    String(transaction.blockHash).toLowerCase(),
    String(receipt.blockHash).toLowerCase(),
    "transaction and receipt block hashes do not match",
  );
  const paymentTransfer = matchingPaymentTransfer(packet.value, receipt);

  return {
    ...summary,
    chain: {
      chainId: BASE_SEPOLIA_CHAIN_ID,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      status: receipt.status,
      paymentTransfer: {
        logIndex: paymentTransfer.logIndex,
        asset: packet.value.payment.asset.toLowerCase(),
        payer: packet.value.settlement.payer.toLowerCase(),
        payTo: packet.value.payment.payTo.toLowerCase(),
        amount: packet.value.payment.amount,
      },
      rpcSource:
        rpcUrl === DEFAULT_BASE_SEPOLIA_RPC
          ? "base-public"
          : "caller-supplied",
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const offlineIndex = args.indexOf("--offline");
  const offline = offlineIndex !== -1;
  if (offline) args.splice(offlineIndex, 1);
  const rpcIndex = args.indexOf("--rpc-url");
  let rpcUrl;
  if (rpcIndex !== -1) {
    rpcUrl = args[rpcIndex + 1];
    assert.ok(rpcUrl, "--rpc-url requires a URL");
    args.splice(rpcIndex, 2);
  }
  assert.equal(
    args.length,
    1,
    "usage: node scripts/verify-base-sepolia-evidence.mjs [--offline] [--rpc-url URL] evidence.json",
  );
  const inputPath = path.resolve(args[0]);
  const value = JSON.parse(await readFile(inputPath, "utf8"));
  const result = await verifyBaseSepoliaEvidence(value, { offline, rpcUrl });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
