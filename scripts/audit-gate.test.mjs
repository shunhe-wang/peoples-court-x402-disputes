import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCEPTED_ADVISORIES, evaluateAudit } from "./audit-gate.mjs";

// Shape of the real `npm audit --json` report on 2026-10-28: zod 3 flagged
// through the two @x402 packages. Expected outcomes follow the independent
// review recorded on the pull request that added this gate.
const zodAdvisory = {
  source: 1243066,
  name: "zod",
  title: "Zod can exhaust memory while validating oversized constrained collections",
  url: "https://github.com/advisories/GHSA-mrhx-c7xc-m3w5",
  severity: "high",
  range: "<4.6.6",
};
const audited = { prod: 1, dev: 79, optional: 47, peer: 0, peerOptional: 0, total: 79 };
const report = (extra = {}, overrides = {}) => ({
  auditReportVersion: 2,
  vulnerabilities: {
    "@x402/core": { name: "@x402/core", severity: "high", via: ["zod"] },
    "@x402/extensions": { name: "@x402/extensions", severity: "high", via: ["@x402/core", "zod"] },
    zod: { name: "zod", severity: "high", via: [zodAdvisory] },
    ...extra,
  },
  metadata: { dependencies: audited },
  ...overrides,
});
const beforeReview = new Date("2026-10-28T12:00:00Z");
const advisory = (name, severity, ghsa = "GHSA-test-test-test") => ({
  source: 1, name, title: `${name} advisory`, url: `https://github.com/advisories/${ghsa}`, severity,
});

test("the accepted zod advisory passes on its known paths before review", () => {
  assert.deepEqual(evaluateAudit(report(), beforeReview), []);
});

test("the zod exception fails once its review date passes", () => {
  const failures = evaluateAudit(report(), new Date("2027-02-01T00:00:00Z"));
  assert.ok(failures.some((failure) => failure.includes("expired")));
});

test("any other moderate advisory blocks", () => {
  const failures = evaluateAudit(report({
    "fast-uri": { name: "fast-uri", severity: "moderate", via: [advisory("fast-uri", "moderate")] },
  }), beforeReview);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /fast-uri/);
});

test("the zod advisory reaching another package blocks", () => {
  const failures = evaluateAudit(report({
    "other-lib": { name: "other-lib", severity: "high", via: ["zod"] },
  }), beforeReview);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /other-lib/);
});

test("a low advisory on an allowed package does not open a path for others", () => {
  const vulnerabilities = report().vulnerabilities;
  const failures = evaluateAudit(report({
    "@x402/core": { ...vulnerabilities["@x402/core"], via: ["zod", advisory("@x402/core", "low")] },
    "new-lib": { name: "new-lib", severity: "high", via: ["@x402/core"] },
  }), beforeReview);
  assert.ok(failures.some((failure) => failure.startsWith("new-lib")));
});

test("a flagged dependency cycle with no accepted advisory blocks", () => {
  const failures = evaluateAudit(report({
    a: { name: "a", severity: "high", via: ["b"] },
    b: { name: "b", severity: "high", via: ["a"] },
  }), beforeReview);
  assert.ok(failures.some((failure) => failure.startsWith("a:")));
  assert.ok(failures.some((failure) => failure.startsWith("b:")));
});

test("critical advisories are never accepted", () => {
  const failures = evaluateAudit(report({
    zod: { name: "zod", severity: "critical", via: [{ ...zodAdvisory, severity: "critical" }] },
  }), beforeReview);
  assert.ok(failures.some((failure) => failure.startsWith("zod:")));
});

test("the exception holds only at the severity it was accepted at", () => {
  for (const severity of ["High", "severe", "moderate"]) {
    const failures = evaluateAudit(report({
      zod: { name: "zod", severity: "high", via: [{ ...zodAdvisory, severity }] },
    }), beforeReview);
    assert.ok(failures.some((failure) => failure.startsWith("zod:")), severity);
  }
});

test("the exception applies only to the package it names", () => {
  const failures = evaluateAudit(report({
    "zod-mini": { name: "zod-mini", severity: "high", via: [zodAdvisory] },
  }), beforeReview);
  assert.ok(failures.some((failure) => failure.startsWith("zod-mini:")));
});

test("an exception with an unreadable review date blocks", () => {
  const typo = ACCEPTED_ADVISORIES.map((item) => ({ ...item, reviewBy: "2030-13-45x" }));
  const failures = evaluateAudit(report(), beforeReview, typo);
  assert.ok(failures.some((failure) => failure.includes("invalid review date")));
});

test("every accepted advisory has a readable review date", () => {
  assert.deepEqual(evaluateAudit(report(), beforeReview, ACCEPTED_ADVISORIES).filter((failure) => failure.includes("review date")), []);
});

test("an audit that skipped development dependencies blocks", () => {
  // npm keeps full metadata counts under --omit=dev and drops the findings.
  const omitted = report({}, { vulnerabilities: {} });
  assert.ok(evaluateAudit(omitted, beforeReview).some((failure) => failure.includes("was not reported")));
  const empty = report({}, { metadata: { dependencies: { prod: 1, dev: 0, optional: 0, peer: 0, peerOptional: 0, total: 1 } } });
  assert.equal(evaluateAudit(empty, beforeReview).length, 1);
});

test("an exception whose advisory is gone asks to be retired", () => {
  const fixed = report({}, { vulnerabilities: {} });
  assert.deepEqual(evaluateAudit(fixed, beforeReview), [
    "GHSA-mrhx-c7xc-m3w5 was not reported for zod; retire the exception or check for an omit setting",
  ]);
});

test("a malformed path entry blocks", () => {
  const failures = evaluateAudit(report({
    "odd-lib": { name: "odd-lib", severity: "high", via: [null] },
  }), beforeReview);
  assert.ok(failures.some((failure) => failure.startsWith("odd-lib:")));
});

test("low advisories do not block", () => {
  assert.deepEqual(evaluateAudit(report({
    "low-lib": { name: "low-lib", severity: "low", via: [advisory("low-lib", "low")] },
  }), beforeReview), []);
});

test("an unusable report blocks", () => {
  assert.equal(evaluateAudit({ error: { code: "ENOAUDIT" } }, beforeReview).length, 1);
  assert.equal(evaluateAudit({ ...report(), auditReportVersion: 1 }, beforeReview).length, 1);
});
