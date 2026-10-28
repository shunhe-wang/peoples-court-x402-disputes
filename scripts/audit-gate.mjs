import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Advisories the release may ship with, each limited to the severity recorded
// when it was accepted, the packages it may reach, and a date after which the
// gate fails until someone reviews it again.
export const ACCEPTED_ADVISORIES = [
  {
    // Zod memory exhaustion on oversized constrained collections, fixed in
    // zod 4.6.6. Every supported @x402 line still requires zod 3. Retire when
    // x402 moves to zod 4.
    id: "GHSA-mrhx-c7xc-m3w5",
    package: "zod",
    severity: "high",
    reaches: ["@x402/core", "@x402/extensions"],
    reviewBy: "2027-01-31",
  },
];

const SEVERITY = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const BLOCKING = SEVERITY.moderate;
// Unknown severity strings block rather than pass.
const blocks = (severity) => (SEVERITY[severity] ?? SEVERITY.critical) >= BLOCKING;

const advisoryId = (advisory) =>
  String(advisory.url ?? "").split("/").pop() || String(advisory.source);

const reviewDeadline = (exception) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exception.reviewBy ?? "")) return NaN;
  return Date.parse(`${exception.reviewBy}T23:59:59Z`);
};

/**
 * Returns the reasons an `npm audit --json` report must block a release. An
 * empty list means the report passes.
 */
export function evaluateAudit(report, now = new Date(), accepted = ACCEPTED_ADVISORIES) {
  if (!report || report.error || report.auditReportVersion !== 2 || typeof report.vulnerabilities !== "object" || report.vulnerabilities === null)
    return [`npm audit did not return a usable version 2 report: ${JSON.stringify(report?.error ?? report?.auditReportVersion ?? null)}`];
  const audited = report.metadata?.dependencies;
  if (!audited || !(audited.dev > 0) || !(audited.total > 1))
    return [`npm audit described no development dependencies (${JSON.stringify(audited ?? null)})`];

  const failures = [];
  for (const exception of accepted) {
    if (Number.isNaN(reviewDeadline(exception)))
      failures.push(`the exception for ${exception.id} has an invalid review date: ${JSON.stringify(exception.reviewBy)}`);
  }

  const vulnerabilities = report.vulnerabilities;
  // Package name -> accepted advisories that explain its own findings.
  const acceptedRoots = new Map();
  for (const [name, entry] of Object.entries(vulnerabilities)) {
    if (!Array.isArray(entry?.via) || entry.via.some((via) => typeof via !== "string" && (typeof via !== "object" || via === null))) {
      failures.push(`${name}: the report gives no readable advisory or dependency path`);
      continue;
    }
    for (const advisory of entry.via.filter((via) => typeof via === "object" && via !== null)) {
      if (!blocks(advisory.severity)) continue;
      const id = advisoryId(advisory);
      const exception = accepted.find((item) => item.id === id && item.package === advisory.name && advisory.name === name);
      const deadline = exception ? reviewDeadline(exception) : NaN;
      if (!exception) {
        failures.push(`${name}: ${id} (${advisory.severity}) ${advisory.title ?? ""}`.trim());
      } else if (advisory.severity !== exception.severity) {
        failures.push(`${name}: ${id} is now ${JSON.stringify(advisory.severity)}, not the accepted ${exception.severity}; review it again`);
      } else if (Number.isNaN(deadline) || now.getTime() > deadline) {
        failures.push(`${name}: the exception for ${id} expired on ${exception.reviewBy}; review it again`);
      } else {
        acceptedRoots.set(name, [...(acceptedRoots.get(name) ?? []), exception]);
      }
    }
  }

  // A package flagged through its dependencies must trace, along every
  // dependency path, to at least one accepted root that may reach it.
  for (const [name, entry] of Object.entries(vulnerabilities)) {
    if (!Array.isArray(entry?.via) || !blocks(entry.severity)) continue;
    const paths = entry.via.filter((via) => typeof via === "string");
    if (paths.length === 0) continue;
    const seen = new Set([name]);
    const pending = [...paths];
    const roots = new Set();
    while (pending.length > 0) {
      const next = pending.pop();
      if (seen.has(next)) continue;
      seen.add(next);
      const dependency = vulnerabilities[next];
      if (!dependency || !Array.isArray(dependency.via)) {
        failures.push(`${name}: depends on ${next}, which the report does not describe`);
        continue;
      }
      if (acceptedRoots.has(next)) roots.add(next);
      pending.push(...dependency.via.filter((via) => typeof via === "string"));
    }
    if (roots.size === 0) failures.push(`${name}: flagged through ${paths.join(", ")} without tracing to an accepted advisory`);
    for (const root of roots) {
      for (const exception of acceptedRoots.get(root)) {
        if (!exception.reaches.includes(name))
          failures.push(`${name}: ${exception.id} may reach only ${exception.reaches.join(", ")}`);
      }
    }
  }
  // Each exception doubles as a canary: if its advisory is no longer reported,
  // either the exception can be retired or the audit skipped part of the tree
  // (npm keeps full metadata counts even when an omit setting drops findings).
  for (const exception of accepted) {
    if (!(acceptedRoots.get(exception.package) ?? []).includes(exception) && !failures.some((failure) => failure.startsWith(`${exception.package}:`)))
      failures.push(`${exception.id} was not reported for ${exception.package}; retire the exception or check for an omit setting`);
  }
  return [...new Set(failures)];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = spawnSync(
    "npm",
    ["audit", "--json", "--include=dev", "--include=peer", "--include=optional"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    report = { error: result.stderr || "npm audit produced no JSON" };
  }
  const failures = evaluateAudit(report);
  const counts = report?.metadata?.vulnerabilities;
  if (counts) console.log(`npm audit: ${JSON.stringify(counts)} over ${JSON.stringify(report.metadata.dependencies)}`);
  for (const item of ACCEPTED_ADVISORIES)
    console.log(`Accepted until ${item.reviewBy}: ${item.id} (${item.severity}) in ${item.package} via ${item.reaches.join(", ")}`);
  if (failures.length > 0) {
    console.error(`Dependency audit failed:\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log("Dependency audit passed.");
}
