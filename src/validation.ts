import { canonicalJson } from "./canonical.js";
import {
  EXECUTION_MODES,
  GENERAL_CLAIM_CLASSES,
  MAX_X402_DISPUTE_PACKET_BYTES,
  PEOPLE_COURT_DISPUTE_VERSION,
  SUPPORTED_PAYMENT_SCHEMES,
  X402_DISPUTE_PACKET_VERSION,
  type AcceptanceVerification,
  type PeopleCourtDisputeAcceptanceProofV1,
  type PeopleCourtDisputeAcceptanceStatementV1,
  type PeopleCourtDisputeAcceptanceV1,
  type PeopleCourtDisputeDeclarationV1,
  type PeopleCourtDisputeExtensionV1,
  type ValidationResult,
  type VerifiedOfferArtifact,
  type VerifiedReceiptArtifact,
  type X402DisputeEvidenceReferenceV1,
  type X402DisputePacketV1,
} from "./types.js";

const HASH = /^[0-9a-f]{64}$/;
const ATOMIC_AMOUNT = /^(0|[1-9][0-9]{0,77})$/;
const DECIMAL_AMOUNT = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;
const NETWORK = /^[a-z0-9][a-z0-9-]{0,31}:[A-Za-z0-9._-]{1,96}$/;
const NONCE = /^[A-Za-z0-9._:-]{16,128}$/;
const IDENTIFIER = /^[^\u0000-\u001f\u007f]{1,200}$/;
const MEDIA_TYPE = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/;

export class PeopleCourtDisputeValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(errors.join("; "));
    this.name = "PeopleCourtDisputeValidationError";
    this.errors = errors;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: unknown,
  path: string,
  required: readonly string[],
  optional: readonly string[],
  errors: string[],
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}.${key} is not supported`);
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      errors.push(`${path}.${key} is required`);
    }
  }
  return true;
}

function stringValue(
  value: unknown,
  path: string,
  min: number,
  max: number,
  errors: string[],
): value is string {
  if (
    typeof value !== "string" ||
    value.length < min ||
    value.length > max
  ) {
    errors.push(`${path} must be a string between ${min} and ${max} characters`);
    return false;
  }
  return true;
}

function identifier(
  value: unknown,
  path: string,
  errors: string[],
): value is string {
  if (!stringValue(value, path, 1, 200, errors)) return false;
  if (!IDENTIFIER.test(value)) {
    errors.push(`${path} contains control characters`);
    return false;
  }
  return true;
}

function hashValue(
  value: unknown,
  path: string,
  errors: string[],
): value is string {
  if (typeof value !== "string" || !HASH.test(value)) {
    errors.push(`${path} must be a lowercase SHA-256 hex digest`);
    return false;
  }
  return true;
}

function urlValue(
  value: unknown,
  path: string,
  errors: string[],
): value is string {
  if (!stringValue(value, path, 1, 2048, errors)) return false;
  try {
    const parsed = new URL(value);
    const local =
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "[::1]");
    if (parsed.protocol !== "https:" && !local) {
      errors.push(`${path} must use HTTPS, except for loopback development`);
      return false;
    }
    if (parsed.username || parsed.password) {
      errors.push(`${path} must not contain URL credentials`);
      return false;
    }
  } catch {
    errors.push(`${path} must be an absolute URL`);
    return false;
  }
  return true;
}

function isoDate(
  value: unknown,
  path: string,
  errors: string[],
): value is string {
  if (typeof value !== "string") {
    errors.push(`${path} must be an ISO timestamp`);
    return false;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    errors.push(`${path} must be a canonical ISO timestamp`);
    return false;
  }
  return true;
}

function validateDeclarationInto(
  value: unknown,
  path: string,
  errors: string[],
): value is PeopleCourtDisputeDeclarationV1 {
  if (
    !exactKeys(
      value,
      path,
      [
        "version",
        "provider",
        "seller",
        "rules",
        "terms",
        "scope",
        "supportedClaims",
        "filingWindow",
        "evidence",
        "execution",
        "resourceBinding",
        "privacyNoticeUrl",
      ],
      [],
      errors,
    )
  ) {
    return false;
  }
  if (value.version !== PEOPLE_COURT_DISPUTE_VERSION) {
    errors.push(`${path}.version must equal ${PEOPLE_COURT_DISPUTE_VERSION}`);
  }
  if (
    exactKeys(
      value.provider,
      `${path}.provider`,
      ["id", "name", "forumUrl", "apiVersion"],
      [],
      errors,
    )
  ) {
    identifier(value.provider.id, `${path}.provider.id`, errors);
    stringValue(value.provider.name, `${path}.provider.name`, 1, 120, errors);
    urlValue(value.provider.forumUrl, `${path}.provider.forumUrl`, errors);
    stringValue(
      value.provider.apiVersion,
      `${path}.provider.apiVersion`,
      1,
      64,
      errors,
    );
  }
  if (
    exactKeys(
      value.seller,
      `${path}.seller`,
      ["id"],
      ["name"],
      errors,
    )
  ) {
    identifier(value.seller.id, `${path}.seller.id`, errors);
    if (value.seller.name !== undefined) {
      stringValue(value.seller.name, `${path}.seller.name`, 1, 200, errors);
    }
  }
  if (
    exactKeys(
      value.rules,
      `${path}.rules`,
      ["id", "version", "hash", "url"],
      [],
      errors,
    )
  ) {
    identifier(value.rules.id, `${path}.rules.id`, errors);
    stringValue(value.rules.version, `${path}.rules.version`, 1, 64, errors);
    hashValue(value.rules.hash, `${path}.rules.hash`, errors);
    urlValue(value.rules.url, `${path}.rules.url`, errors);
  }
  if (
    exactKeys(
      value.terms,
      `${path}.terms`,
      ["version", "hash", "url"],
      [],
      errors,
    )
  ) {
    stringValue(value.terms.version, `${path}.terms.version`, 1, 100, errors);
    hashValue(value.terms.hash, `${path}.terms.hash`, errors);
    urlValue(value.terms.url, `${path}.terms.url`, errors);
  }
  stringValue(value.scope, `${path}.scope`, 1, 1000, errors);
  if (
    !Array.isArray(value.supportedClaims) ||
    value.supportedClaims.length < 1 ||
    value.supportedClaims.length > GENERAL_CLAIM_CLASSES.length ||
    new Set(value.supportedClaims).size !== value.supportedClaims.length ||
    value.supportedClaims.some(
      (claim) =>
        !GENERAL_CLAIM_CLASSES.includes(
          claim as (typeof GENERAL_CLAIM_CLASSES)[number],
        ),
    )
  ) {
    errors.push(`${path}.supportedClaims is invalid`);
  }
  if (
    exactKeys(
      value.filingWindow,
      `${path}.filingWindow`,
      ["startsAt", "durationSeconds"],
      [],
      errors,
    )
  ) {
    if (value.filingWindow.startsAt !== "settlement") {
      errors.push(`${path}.filingWindow.startsAt must equal settlement`);
    }
    if (
      !Number.isSafeInteger(value.filingWindow.durationSeconds) ||
      Number(value.filingWindow.durationSeconds) < 60 ||
      Number(value.filingWindow.durationSeconds) > 31_536_000
    ) {
      errors.push(
        `${path}.filingWindow.durationSeconds must be an integer between 60 and 31536000`,
      );
    }
  }
  if (
    exactKeys(
      value.evidence,
      `${path}.evidence`,
      ["offerReceipt", "paymentPayload", "settlementReference"],
      [],
      errors,
    )
  ) {
    if (
      !["required", "recommended", "optional"].includes(
        String(value.evidence.offerReceipt),
      )
    ) {
      errors.push(`${path}.evidence.offerReceipt is invalid`);
    }
    if (value.evidence.paymentPayload !== "hash_only") {
      errors.push(`${path}.evidence.paymentPayload must equal hash_only`);
    }
    if (value.evidence.settlementReference !== "required") {
      errors.push(
        `${path}.evidence.settlementReference must equal required`,
      );
    }
  }
  if (
    exactKeys(
      value.execution,
      `${path}.execution`,
      ["owner", "modes", "automatic"],
      [],
      errors,
    )
  ) {
    identifier(value.execution.owner, `${path}.execution.owner`, errors);
    if (
      !Array.isArray(value.execution.modes) ||
      value.execution.modes.length < 1 ||
      value.execution.modes.length > EXECUTION_MODES.length ||
      new Set(value.execution.modes).size !== value.execution.modes.length ||
      value.execution.modes.some(
        (mode) =>
          !EXECUTION_MODES.includes(
            mode as (typeof EXECUTION_MODES)[number],
          ),
      )
    ) {
      errors.push(`${path}.execution.modes is invalid`);
    }
    if (value.execution.automatic !== false) {
      errors.push(`${path}.execution.automatic must equal false`);
    }
  }
  if (value.resourceBinding !== "exact_url") {
    errors.push(`${path}.resourceBinding must equal exact_url`);
  }
  urlValue(value.privacyNoticeUrl, `${path}.privacyNoticeUrl`, errors);
  return errors.length === 0;
}

export function validatePeopleCourtDisputeDeclaration(
  value: unknown,
): ValidationResult<PeopleCourtDisputeDeclarationV1> {
  const errors: string[] = [];
  validateDeclarationInto(value, "declaration", errors);
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as PeopleCourtDisputeDeclarationV1 };
}

function validateProofInto(
  value: unknown,
  path: string,
  errors: string[],
): value is PeopleCourtDisputeAcceptanceProofV1 {
  if (
    !exactKeys(
      value,
      path,
      ["method", "artifactRef", "artifactHash"],
      ["signerId", "signature"],
      errors,
    )
  ) {
    return false;
  }
  if (
    ![
      "clickthrough",
      "wallet_signature",
      "agent_signature",
      "signed_document",
    ].includes(String(value.method))
  ) {
    errors.push(`${path}.method is invalid`);
  }
  stringValue(value.artifactRef, `${path}.artifactRef`, 1, 1000, errors);
  hashValue(value.artifactHash, `${path}.artifactHash`, errors);
  if (value.signerId !== undefined) {
    identifier(value.signerId, `${path}.signerId`, errors);
  }
  if (value.signature !== undefined) {
    if (
      exactKeys(
        value.signature,
        `${path}.signature`,
        ["format", "value"],
        ["kid"],
        errors,
      )
    ) {
      if (
        !["eip191", "eip712", "jws", "other"].includes(
          String(value.signature.format),
        )
      ) {
        errors.push(`${path}.signature.format is invalid`);
      }
      if (value.signature.kid !== undefined) {
        stringValue(
          value.signature.kid,
          `${path}.signature.kid`,
          1,
          500,
          errors,
        );
      }
      stringValue(
        value.signature.value,
        `${path}.signature.value`,
        1,
        16_384,
        errors,
      );
    }
  }
  if (
    ["wallet_signature", "agent_signature"].includes(String(value.method)) &&
    value.signature === undefined
  ) {
    errors.push(`${path}.signature is required for signature methods`);
  }
  return errors.length === 0;
}

function validateStatementInto(
  value: unknown,
  path: string,
  errors: string[],
): value is PeopleCourtDisputeAcceptanceStatementV1 {
  if (
    !exactKeys(
      value,
      path,
      [
        "version",
        "declarationHash",
        "paymentRequirementHash",
        "resourceUrl",
        "scheme",
        "network",
        "asset",
        "amount",
        "payTo",
        "payerId",
        "counterpartyId",
        "transactionId",
        "rulesVersion",
        "rulesHash",
        "termsVersion",
        "termsHash",
        "scope",
        "acceptedAt",
        "nonce",
      ],
      [],
      errors,
    )
  ) {
    return false;
  }
  if (value.version !== PEOPLE_COURT_DISPUTE_VERSION) {
    errors.push(`${path}.version must equal ${PEOPLE_COURT_DISPUTE_VERSION}`);
  }
  hashValue(value.declarationHash, `${path}.declarationHash`, errors);
  hashValue(
    value.paymentRequirementHash,
    `${path}.paymentRequirementHash`,
    errors,
  );
  urlValue(value.resourceUrl, `${path}.resourceUrl`, errors);
  if (
    !SUPPORTED_PAYMENT_SCHEMES.includes(
      value.scheme as (typeof SUPPORTED_PAYMENT_SCHEMES)[number],
    )
  ) {
    errors.push(
      `${path}.scheme must be one of ${SUPPORTED_PAYMENT_SCHEMES.join(", ")}`,
    );
  }
  if (typeof value.network !== "string" || !NETWORK.test(value.network)) {
    errors.push(`${path}.network must be a CAIP-2 network identifier`);
  }
  stringValue(value.asset, `${path}.asset`, 1, 256, errors);
  if (typeof value.amount !== "string" || !ATOMIC_AMOUNT.test(value.amount)) {
    errors.push(`${path}.amount must be a canonical atomic-unit integer`);
  }
  stringValue(value.payTo, `${path}.payTo`, 1, 256, errors);
  identifier(value.payerId, `${path}.payerId`, errors);
  identifier(value.counterpartyId, `${path}.counterpartyId`, errors);
  identifier(value.transactionId, `${path}.transactionId`, errors);
  stringValue(value.rulesVersion, `${path}.rulesVersion`, 1, 64, errors);
  hashValue(value.rulesHash, `${path}.rulesHash`, errors);
  stringValue(value.termsVersion, `${path}.termsVersion`, 1, 100, errors);
  hashValue(value.termsHash, `${path}.termsHash`, errors);
  stringValue(value.scope, `${path}.scope`, 1, 1000, errors);
  isoDate(value.acceptedAt, `${path}.acceptedAt`, errors);
  if (typeof value.nonce !== "string" || !NONCE.test(value.nonce)) {
    errors.push(`${path}.nonce is invalid`);
  }
  return errors.length === 0;
}

export function validatePeopleCourtDisputeAcceptance(
  value: unknown,
): ValidationResult<PeopleCourtDisputeAcceptanceV1> {
  const errors: string[] = [];
  if (
    exactKeys(
      value,
      "acceptance",
      ["version", "statement", "statementHash", "proof"],
      [],
      errors,
    )
  ) {
    if (value.version !== PEOPLE_COURT_DISPUTE_VERSION) {
      errors.push(
        `acceptance.version must equal ${PEOPLE_COURT_DISPUTE_VERSION}`,
      );
    }
    validateStatementInto(value.statement, "acceptance.statement", errors);
    hashValue(value.statementHash, "acceptance.statementHash", errors);
    validateProofInto(value.proof, "acceptance.proof", errors);
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as PeopleCourtDisputeAcceptanceV1 };
}

export function validatePeopleCourtDisputeExtension(
  value: unknown,
  options: { requireAcceptance?: boolean } = {},
): ValidationResult<PeopleCourtDisputeExtensionV1> {
  const errors: string[] = [];
  if (
    exactKeys(value, "extension", ["info", "schema"], [], errors) &&
    exactKeys(
      value.info,
      "extension.info",
      ["declaration"],
      ["acceptance"],
      errors,
    )
  ) {
    validateDeclarationInto(
      value.info.declaration,
      "extension.info.declaration",
      errors,
    );
    if (value.info.acceptance !== undefined) {
      const result = validatePeopleCourtDisputeAcceptance(
        value.info.acceptance,
      );
      if (!result.valid) errors.push(...result.errors);
    } else if (options.requireAcceptance) {
      errors.push("extension.info.acceptance is required");
    }
    if (!isRecord(value.schema)) {
      errors.push("extension.schema must be an object");
    }
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as PeopleCourtDisputeExtensionV1 };
}

function validateAcceptanceVerification(
  value: unknown,
  path: string,
  errors: string[],
): value is AcceptanceVerification {
  if (
    !exactKeys(
      value,
      path,
      ["status"],
      ["verifier", "checkedAt", "errorCode"],
      errors,
    )
  ) {
    return false;
  }
  if (!["unverified", "verified", "invalid"].includes(String(value.status))) {
    errors.push(`${path}.status is invalid`);
  }
  if (value.verifier !== undefined) {
    identifier(value.verifier, `${path}.verifier`, errors);
  }
  if (value.checkedAt !== undefined) {
    isoDate(value.checkedAt, `${path}.checkedAt`, errors);
  }
  if (value.errorCode !== undefined) {
    stringValue(value.errorCode, `${path}.errorCode`, 1, 120, errors);
  }
  if (value.status === "verified" && value.verifier === undefined) {
    errors.push(`${path}.verifier is required when verified`);
  }
  if (value.status === "verified" && value.checkedAt === undefined) {
    errors.push(`${path}.checkedAt is required when verified`);
  }
  if (value.status === "invalid" && value.errorCode === undefined) {
    errors.push(`${path}.errorCode is required when invalid`);
  }
  if (
    value.status === "unverified" &&
    (value.verifier !== undefined ||
      value.checkedAt !== undefined ||
      value.errorCode !== undefined)
  ) {
    errors.push(`${path} unverified status cannot carry verification claims`);
  }
  return errors.length === 0;
}

function validateArtifact(
  value: unknown,
  path: string,
  kind: "offer" | "receipt",
  errors: string[],
): value is VerifiedOfferArtifact | VerifiedReceiptArtifact {
  if (
    !exactKeys(
      value,
      path,
      ["status"],
      ["artifact", "artifactHash", "payload", "signer", "errorCode"],
      errors,
    )
  ) {
    return false;
  }
  if (
    !["absent", "present_unverified", "verified", "invalid"].includes(
      String(value.status),
    )
  ) {
    errors.push(`${path}.status is invalid`);
  }
  if (value.status === "absent") {
    if (
      value.artifact !== undefined ||
      value.artifactHash !== undefined ||
      value.payload !== undefined ||
      value.signer !== undefined
    ) {
      errors.push(`${path} absent status cannot carry an artifact`);
    }
    return errors.length === 0;
  }
  if (!isRecord(value.artifact)) {
    errors.push(`${path}.artifact is required`);
  }
  hashValue(value.artifactHash, `${path}.artifactHash`, errors);
  if (value.payload !== undefined && !isRecord(value.payload)) {
    errors.push(`${path}.payload must be an object`);
  }
  if (value.signer !== undefined) {
    stringValue(value.signer, `${path}.signer`, 1, 500, errors);
  }
  if (value.errorCode !== undefined) {
    stringValue(value.errorCode, `${path}.errorCode`, 1, 120, errors);
  }
  if (value.status === "verified" && !isRecord(value.payload)) {
    errors.push(`${path}.payload is required when verified`);
  }
  if (value.status === "invalid" && value.errorCode === undefined) {
    errors.push(`${path}.errorCode is required when invalid`);
  }
  if (
    isRecord(value.artifact) &&
    !["jws", "eip712"].includes(String(value.artifact.format))
  ) {
    errors.push(`${path}.artifact.format is invalid`);
  }
  if (
    isRecord(value.payload) &&
    (value.payload.version !== 1 ||
      typeof value.payload.resourceUrl !== "string")
  ) {
    errors.push(`${path}.payload is not a valid ${kind} payload`);
  }
  return errors.length === 0;
}

function validateEvidenceReference(
  value: unknown,
  path: string,
  errors: string[],
): value is X402DisputeEvidenceReferenceV1 {
  if (
    !exactKeys(
      value,
      path,
      ["kind", "sha256", "mediaType"],
      ["artifactRef"],
      errors,
    )
  ) {
    return false;
  }
  if (
    !["deliverable", "request", "response", "message", "other"].includes(
      String(value.kind),
    )
  ) {
    errors.push(`${path}.kind is invalid`);
  }
  hashValue(value.sha256, `${path}.sha256`, errors);
  if (
    typeof value.mediaType !== "string" ||
    value.mediaType.length > 200 ||
    !MEDIA_TYPE.test(value.mediaType)
  ) {
    errors.push(`${path}.mediaType is invalid`);
  }
  if (value.artifactRef !== undefined) {
    stringValue(value.artifactRef, `${path}.artifactRef`, 1, 1000, errors);
  }
  return errors.length === 0;
}

export function validateX402DisputePacketStructure(
  value: unknown,
): ValidationResult<X402DisputePacketV1> {
  const errors: string[] = [];
  if (
    !exactKeys(
      value,
      "packet",
      [
        "version",
        "protocol",
        "x402Version",
        "rail",
        "transactionId",
        "createdAt",
        "resourceUrl",
        "claimClass",
        "parties",
        "disputedAmount",
        "payment",
        "executionMode",
        "paymentRequirementHash",
        "paymentPayloadHash",
        "authorizationHash",
        "settlement",
        "declaration",
        "declarationHash",
        "acceptance",
        "acceptanceVerification",
        "offer",
        "receipt",
        "evidence",
        "packetHash",
      ],
      [],
      errors,
    )
  ) {
    return { valid: false, errors };
  }
  if (value.version !== X402_DISPUTE_PACKET_VERSION) {
    errors.push(`packet.version must equal ${X402_DISPUTE_PACKET_VERSION}`);
  }
  if (value.protocol !== "x402") errors.push("packet.protocol must equal x402");
  if (value.x402Version !== 2) errors.push("packet.x402Version must equal 2");
  if (!["x402", "x402r"].includes(String(value.rail))) {
    errors.push("packet.rail is invalid");
  }
  identifier(value.transactionId, "packet.transactionId", errors);
  isoDate(value.createdAt, "packet.createdAt", errors);
  urlValue(value.resourceUrl, "packet.resourceUrl", errors);
  if (
    !GENERAL_CLAIM_CLASSES.includes(
      value.claimClass as (typeof GENERAL_CLAIM_CLASSES)[number],
    )
  ) {
    errors.push("packet.claimClass is invalid");
  }
  if (
    exactKeys(
      value.parties,
      "packet.parties",
      ["claimantId", "respondentId"],
      [],
      errors,
    )
  ) {
    identifier(value.parties.claimantId, "packet.parties.claimantId", errors);
    identifier(
      value.parties.respondentId,
      "packet.parties.respondentId",
      errors,
    );
    if (value.parties.claimantId === value.parties.respondentId) {
      errors.push("packet parties must be distinct");
    }
  }
  if (
    exactKeys(
      value.disputedAmount,
      "packet.disputedAmount",
      ["value", "currency"],
      [],
      errors,
    )
  ) {
    if (
      typeof value.disputedAmount.value !== "string" ||
      !DECIMAL_AMOUNT.test(value.disputedAmount.value) ||
      Number(value.disputedAmount.value) <= 0 ||
      Number(value.disputedAmount.value) > 1_000_000_000
    ) {
      errors.push("packet.disputedAmount.value is invalid");
    }
    if (
      typeof value.disputedAmount.currency !== "string" ||
      !/^[A-Z0-9]{2,12}$/.test(value.disputedAmount.currency)
    ) {
      errors.push("packet.disputedAmount.currency is invalid");
    }
  }
  if (
    exactKeys(
      value.payment,
      "packet.payment",
      [
        "scheme",
        "network",
        "asset",
        "amount",
        "payTo",
        "maxTimeoutSeconds",
        "extraHash",
      ],
      [],
      errors,
    )
  ) {
    if (
      !SUPPORTED_PAYMENT_SCHEMES.includes(
        value.payment
          .scheme as (typeof SUPPORTED_PAYMENT_SCHEMES)[number],
      )
    ) {
      errors.push(
        `packet.payment.scheme must be one of ${SUPPORTED_PAYMENT_SCHEMES.join(", ")}`,
      );
    }
    if (
      typeof value.payment.network !== "string" ||
      !NETWORK.test(value.payment.network)
    ) {
      errors.push("packet.payment.network must be a CAIP-2 network identifier");
    }
    stringValue(value.payment.asset, "packet.payment.asset", 1, 256, errors);
    if (
      typeof value.payment.amount !== "string" ||
      !ATOMIC_AMOUNT.test(value.payment.amount)
    ) {
      errors.push(
        "packet.payment.amount must be a canonical atomic-unit integer",
      );
    }
    stringValue(value.payment.payTo, "packet.payment.payTo", 1, 256, errors);
    if (
      !Number.isSafeInteger(value.payment.maxTimeoutSeconds) ||
      Number(value.payment.maxTimeoutSeconds) <= 0 ||
      Number(value.payment.maxTimeoutSeconds) > 86_400
    ) {
      errors.push("packet.payment.maxTimeoutSeconds is invalid");
    }
    hashValue(value.payment.extraHash, "packet.payment.extraHash", errors);
  }
  if (
    !EXECUTION_MODES.includes(
      value.executionMode as (typeof EXECUTION_MODES)[number],
    )
  ) {
    errors.push("packet.executionMode is invalid");
  }
  hashValue(
    value.paymentRequirementHash,
    "packet.paymentRequirementHash",
    errors,
  );
  hashValue(value.paymentPayloadHash, "packet.paymentPayloadHash", errors);
  hashValue(value.authorizationHash, "packet.authorizationHash", errors);
  if (
    exactKeys(
      value.settlement,
      "packet.settlement",
      ["transaction", "network", "settledAt"],
      ["payer"],
      errors,
    )
  ) {
    stringValue(
      value.settlement.transaction,
      "packet.settlement.transaction",
      1,
      500,
      errors,
    );
    if (
      typeof value.settlement.network !== "string" ||
      !NETWORK.test(value.settlement.network)
    ) {
      errors.push(
        "packet.settlement.network must be a CAIP-2 network identifier",
      );
    }
    if (value.settlement.payer !== undefined) {
      stringValue(
        value.settlement.payer,
        "packet.settlement.payer",
        1,
        256,
        errors,
      );
    }
    isoDate(value.settlement.settledAt, "packet.settlement.settledAt", errors);
  }
  validateDeclarationInto(value.declaration, "packet.declaration", errors);
  hashValue(value.declarationHash, "packet.declarationHash", errors);
  const acceptance = validatePeopleCourtDisputeAcceptance(value.acceptance);
  if (!acceptance.valid) errors.push(...acceptance.errors);
  validateAcceptanceVerification(
    value.acceptanceVerification,
    "packet.acceptanceVerification",
    errors,
  );
  validateArtifact(value.offer, "packet.offer", "offer", errors);
  validateArtifact(value.receipt, "packet.receipt", "receipt", errors);
  if (!Array.isArray(value.evidence) || value.evidence.length > 20) {
    errors.push("packet.evidence must be an array of at most 20 items");
  } else {
    value.evidence.forEach((item, index) =>
      validateEvidenceReference(item, `packet.evidence[${index}]`, errors),
    );
    const hashes = value.evidence
      .filter(isRecord)
      .map((item) => String(item.sha256));
    if (new Set(hashes).size !== hashes.length) {
      errors.push("packet.evidence contains duplicate hashes");
    }
  }
  hashValue(value.packetHash, "packet.packetHash", errors);
  try {
    const bytes = new TextEncoder().encode(canonicalJson(value)).byteLength;
    if (bytes > MAX_X402_DISPUTE_PACKET_BYTES) {
      errors.push(
        `packet exceeds ${MAX_X402_DISPUTE_PACKET_BYTES} canonical bytes`,
      );
    }
  } catch {
    errors.push("packet is not canonically serializable");
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as unknown as X402DisputePacketV1 };
}

export function assertValidX402DisputePacket(
  value: unknown,
): X402DisputePacketV1 {
  const result = validateX402DisputePacketStructure(value);
  if (!result.valid) throw new PeopleCourtDisputeValidationError(result.errors);
  return result.value;
}
