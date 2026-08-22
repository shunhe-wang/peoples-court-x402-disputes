import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageManifest = JSON.parse(
  readFileSync(path.join(packageRoot, "package.json"), "utf8"),
);
const x402Version =
  process.env.X402_COMPAT_VERSION ??
  packageManifest.devDependencies?.["@x402/core"];
assert.match(
  x402Version ?? "",
  /^\d+\.\d+\.\d+$/,
  "X402_COMPAT_VERSION must be an exact version",
);

function assertHostedRulesDiscovery(readme, source) {
  const sellerDeclaration = readme.match(/## Seller declaration([\s\S]*?)## Payer acceptance/)?.[1] ?? "";
  assert.match(sellerDeclaration, /\/api\/v2\/rules\/current/, `${source} discovers the current Rules tuple`);
  for (const assignment of [
    "id: currentRules.rulesetId",
    "version: currentRules.rulesVersion",
    "hash: currentRules.rulesHash",
  ]) {
    assert.match(sellerDeclaration, new RegExp(assignment.replaceAll(".", "\\.")), `${source} constructs the declaration from ${assignment}`);
  }
  assert.doesNotMatch(
    sellerDeclaration,
    /arbitral-rules-v\d+(?:\.\d+)*/,
    `${source} does not hard-code a numbered hosted Rules identifier`,
  );
  assert.match(
    sellerDeclaration,
    /Do not silently replace that tuple for an already accepted transaction when a later Rules version becomes current\./,
    `${source} preserves the accepted Rules tuple`,
  );
}

const readme = readFileSync(path.join(packageRoot, "README.md"), "utf8");
assertHostedRulesDiscovery(readme, "README");
assert.match(
  readme,
  new RegExp("Package version `" + packageManifest.version.replaceAll(".", "\\.") + "`"),
  "README labels the npm package version independently from the Rules version",
);

const scratch = mkdtempSync(
  path.join(tmpdir(), "peoples-court-x402-standalone-"),
);
const consumerRoot = path.join(scratch, "consumer");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: packageRoot,
    encoding: "utf8",
    ...options,
  });
  assert.equal(
    result.status,
    0,
    [
      `${command} ${args.join(" ")} failed`,
      result.stdout,
      result.stderr,
    ].join("\n"),
  );
  return result;
}

try {
  run("npm", [
    "pack",
    packageRoot,
    "--pack-destination",
    scratch,
    "--json",
  ]);
  const tarballs = readdirSync(scratch)
    .filter((file) =>
      /^peoples-court-x402-disputes-[0-9].*\.tgz$/.test(file),
    )
    .map((file) => path.join(scratch, file));
  assert.equal(tarballs.length, 1, "expected exactly one package tarball");
  const tarball = tarballs[0];
  assert.ok(tarball);

  const packedReadme = run("tar", ["-xOzf", tarball, "package/README.md"]).stdout;
  assertHostedRulesDiscovery(packedReadme, "packed README");

  const entries = run("tar", ["-tzf", tarball]).stdout
    .trim()
    .split(/\r?\n/);
  for (const required of [
    "package/package.json",
    "package/CONFORMANCE.md",
    "package/LICENSE",
    "package/NOTICE",
    "package/README.md",
    "package/PROTOCOL.md",
    "package/SECURITY.md",
    "package/TESTNET.md",
    "package/TRADEMARKS.md",
    "package/conformance/v1/manifest.json",
    "package/dist/index.js",
    "package/dist/index.d.ts",
    "package/scripts/verify-base-sepolia-evidence.mjs",
  ]) {
    assert.ok(entries.includes(required), `missing ${required}`);
  }
  assert.equal(
    entries.some(
      (entry) =>
        entry.startsWith("package/src/") ||
        entry.startsWith("package/test/") ||
        entry.startsWith("package/examples/") ||
        (entry.startsWith("package/scripts/") &&
          entry !==
            "package/scripts/verify-base-sepolia-evidence.mjs") ||
        entry.startsWith("package/.github/"),
    ),
    false,
    "the tarball must contain only the declared release surface",
  );
  for (const excluded of [
    "package/EXTRACTION.md",
    "package/LICENSE-DECISION.md",
    "package/PUBLICATION.md",
  ]) {
    assert.equal(
      entries.includes(excluded),
      false,
      `process-only file must not be published: ${excluded}`,
    );
  }

  mkdirSync(consumerRoot, { recursive: true });
  writeFileSync(
    path.join(consumerRoot, "package.json"),
    JSON.stringify(
      {
        name: "x402-disputes-standalone-consumer",
        private: true,
        type: "module",
      },
      null,
      2,
    ),
  );
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      tarball,
      `@x402/core@${x402Version}`,
      `@x402/extensions@${x402Version}`,
    ],
    { cwd: consumerRoot },
  );
  writeFileSync(
    path.join(consumerRoot, "smoke.mjs"),
    [
      'import { PEOPLE_COURT_DISPUTE, canonicalSha256, validatePeopleCourtDisputeDeclaration } from "@peoples-court/x402-disputes";',
      'if (PEOPLE_COURT_DISPUTE !== "peoples-court-dispute") throw new Error("wrong extension key");',
      'if ((await canonicalSha256({ b: 2, a: 1 })).length !== 64) throw new Error("wrong hash");',
      'if (typeof validatePeopleCourtDisputeDeclaration !== "function") throw new Error("missing validator");',
      "",
    ].join("\n"),
  );
  run(process.execPath, ["smoke.mjs"], { cwd: consumerRoot });

  const installedManifest = JSON.parse(
    readFileSync(
      path.join(
        consumerRoot,
        "node_modules",
        "@peoples-court",
        "x402-disputes",
        "package.json",
      ),
      "utf8",
    ),
  );
  assert.equal(installedManifest.name, packageManifest.name);
  assert.equal(installedManifest.version, packageManifest.version);

  console.log(
    `✓ package packs and imports in a clean consumer with x402 ${x402Version}`,
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
