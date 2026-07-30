import type { ClientExtension } from "@x402/core/client";
import type {
  DeepReadonly,
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  ResourceServerExtension,
} from "@x402/core/types";

import {
  acceptanceSigningMessage,
  canonicalSha256,
} from "./canonical.js";
import {
  peopleCourtDisputeExtensionSchema,
  peopleCourtDisputeSettlementSchema,
} from "./schema.js";
import {
  PEOPLE_COURT_DISPUTE,
  PEOPLE_COURT_DISPUTE_VERSION,
  type CreatePeopleCourtDisputeClientExtensionOptions,
  type CreatePeopleCourtDisputeResourceServerExtensionOptions,
  type PaymentBinding,
  type PeopleCourtDisputeAcceptanceStatementV1,
  type PeopleCourtDisputeAcceptanceV1,
  type PeopleCourtDisputeDeclarationV1,
  type PeopleCourtDisputeExtensionV1,
  type ValidationResult,
} from "./types.js";
import {
  validatePeopleCourtDisputeAcceptance,
  validatePeopleCourtDisputeDeclaration,
  validatePeopleCourtDisputeExtension,
} from "./validation.js";

export const PEOPLE_COURT_ACCEPTANCE_MATERIAL_LIMITATIONS = [
  "Payment is not automatically refundable.",
  "People's Court does not custody or automatically move ordinary x402 funds.",
  "A filing still requires registered authority, matching consent records for both parties, and exact confirmation.",
  "Signed offers, receipts, and acceptance artifacts are evidence, not automatic merits findings.",
] as const;

function defaultNonce(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error(
      "A nonce callback is required when crypto.randomUUID is unavailable.",
    );
  }
  return `pc_${globalThis.crypto.randomUUID().replaceAll("-", "")}`;
}

async function paymentRequirementRecord(
  requirement: PaymentRequirements,
): Promise<Record<string, unknown>> {
  return {
    scheme: requirement.scheme,
    network: requirement.network,
    asset: requirement.asset,
    amount: requirement.amount,
    payTo: requirement.payTo,
    maxTimeoutSeconds: requirement.maxTimeoutSeconds,
    extraHash: await canonicalSha256(requirement.extra),
  };
}

export async function paymentRequirementHash(
  binding: PaymentBinding,
): Promise<string> {
  return canonicalSha256({
    x402Version: binding.x402Version,
    resource: { url: binding.resourceUrl },
    accepted: await paymentRequirementRecord(binding.requirement),
    declarationHash: await canonicalSha256(binding.declaration),
  });
}

export function createPeopleCourtDisputeDeclaration(
  declaration: PeopleCourtDisputeDeclarationV1,
): PeopleCourtDisputeExtensionV1 {
  const result = validatePeopleCourtDisputeDeclaration(declaration);
  if (!result.valid) {
    throw new Error(`Invalid People's Court dispute declaration: ${result.errors.join("; ")}`);
  }
  return {
    info: { declaration: result.value },
    schema: peopleCourtDisputeExtensionSchema,
  };
}

export function declarePeopleCourtDisputeExtension(
  declaration: PeopleCourtDisputeDeclarationV1,
): Record<typeof PEOPLE_COURT_DISPUTE, PeopleCourtDisputeExtensionV1> {
  return {
    [PEOPLE_COURT_DISPUTE]:
      createPeopleCourtDisputeDeclaration(declaration),
  };
}

export function extractPeopleCourtDisputeExtension(
  extensions: Record<string, unknown> | undefined,
  options: { requireAcceptance?: boolean } = {},
): ValidationResult<PeopleCourtDisputeExtensionV1> {
  if (!extensions || !(PEOPLE_COURT_DISPUTE in extensions)) {
    return {
      valid: false,
      errors: [`extensions.${PEOPLE_COURT_DISPUTE} is required`],
    };
  }
  return validatePeopleCourtDisputeExtension(
    extensions[PEOPLE_COURT_DISPUTE],
    options,
  );
}

export async function buildAcceptanceStatement(input: {
  declaration: PeopleCourtDisputeDeclarationV1;
  paymentRequired: PaymentRequired;
  requirement: PaymentRequirements;
  payerId: string;
  counterpartyId: string;
  transactionId: string;
  acceptedAt: string;
  nonce: string;
}): Promise<PeopleCourtDisputeAcceptanceStatementV1> {
  if (input.paymentRequired.x402Version !== 2) {
    throw new Error("The People's Court dispute extension requires x402 v2.");
  }
  if (input.requirement.scheme !== "exact") {
    throw new Error(
      "The People's Court dispute extension supports only the exact x402 payment scheme.",
    );
  }
  if (input.counterpartyId !== input.declaration.seller.id) {
    throw new Error(
      "The counterparty identity must match the seller's declared identity.",
    );
  }
  if (input.payerId === input.counterpartyId) {
    throw new Error("The payer and counterparty identities must be distinct.");
  }
  const declarationHash = await canonicalSha256(input.declaration);
  return {
    version: PEOPLE_COURT_DISPUTE_VERSION,
    declarationHash,
    paymentRequirementHash: await paymentRequirementHash({
      x402Version: 2,
      resourceUrl: input.paymentRequired.resource.url,
      requirement: input.requirement,
      declaration: input.declaration,
    }),
    resourceUrl: input.paymentRequired.resource.url,
    scheme: "exact",
    network: input.requirement.network,
    asset: input.requirement.asset,
    amount: input.requirement.amount,
    payTo: input.requirement.payTo,
    payerId: input.payerId,
    counterpartyId: input.counterpartyId,
    transactionId: input.transactionId,
    rulesVersion: input.declaration.rules.version,
    rulesHash: input.declaration.rules.hash,
    termsVersion: input.declaration.terms.version,
    termsHash: input.declaration.terms.hash,
    scope: input.declaration.scope,
    acceptedAt: input.acceptedAt,
    nonce: input.nonce,
  };
}

export async function verifyAcceptanceBindings(input: {
  declaration: PeopleCourtDisputeDeclarationV1;
  acceptance: PeopleCourtDisputeAcceptanceV1;
  resourceUrl: string;
  requirement: PaymentRequirements;
  now?: Date;
  maxAcceptanceAgeSeconds?: number;
}): Promise<ValidationResult<PeopleCourtDisputeAcceptanceV1>> {
  const structural = validatePeopleCourtDisputeAcceptance(input.acceptance);
  if (!structural.valid) return structural;
  const acceptance = structural.value;
  const errors: string[] = [];
  const declarationHash = await canonicalSha256(input.declaration);
  const requirementHash = await paymentRequirementHash({
    x402Version: 2,
    resourceUrl: input.resourceUrl,
    requirement: input.requirement,
    declaration: input.declaration,
  });
  const expectedStatement = {
    declarationHash,
    paymentRequirementHash: requirementHash,
    resourceUrl: input.resourceUrl,
    scheme: input.requirement.scheme,
    network: input.requirement.network,
    asset: input.requirement.asset,
    amount: input.requirement.amount,
    payTo: input.requirement.payTo,
    counterpartyId: input.declaration.seller.id,
    rulesVersion: input.declaration.rules.version,
    rulesHash: input.declaration.rules.hash,
    termsVersion: input.declaration.terms.version,
    termsHash: input.declaration.terms.hash,
    scope: input.declaration.scope,
  } as const;
  for (const [field, expected] of Object.entries(expectedStatement)) {
    if (
      acceptance.statement[
        field as keyof PeopleCourtDisputeAcceptanceStatementV1
      ] !== expected
    ) {
      errors.push(`acceptance.statement.${field} does not match the payment declaration`);
    }
  }
  if (
    acceptance.statement.payerId === acceptance.statement.counterpartyId
  ) {
    errors.push("acceptance payer and counterparty must be distinct");
  }
  const statementHash = await canonicalSha256(acceptance.statement);
  if (statementHash !== acceptance.statementHash) {
    errors.push("acceptance.statementHash does not match the statement");
  }
  if (input.now) {
    const acceptedAt = Date.parse(acceptance.statement.acceptedAt);
    const clockSkewMs = 5 * 60 * 1000;
    if (acceptedAt > input.now.getTime() + clockSkewMs) {
      errors.push("acceptance.acceptedAt is too far in the future");
    }
    const maxAgeSeconds =
      input.maxAcceptanceAgeSeconds ?? input.requirement.maxTimeoutSeconds;
    if (
      input.now.getTime() - acceptedAt >
      Math.max(60, maxAgeSeconds) * 1000
    ) {
      errors.push("acceptance is older than the allowed payment window");
    }
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: acceptance };
}

export function createPeopleCourtDisputeClientExtension(
  options: CreatePeopleCourtDisputeClientExtensionOptions,
): ClientExtension {
  return {
    key: PEOPLE_COURT_DISPUTE,
    enrichPaymentPayload: async (
      paymentPayload: PaymentPayload,
      paymentRequired: PaymentRequired,
    ): Promise<PaymentPayload> => {
      if (paymentRequired.x402Version !== 2 || paymentPayload.x402Version !== 2) {
        throw new Error(
          "The People's Court dispute extension requires x402 v2.",
        );
      }
      const extracted = extractPeopleCourtDisputeExtension(
        paymentRequired.extensions,
      );
      if (!extracted.valid) {
        throw new Error(extracted.errors.join("; "));
      }
      const acceptedAt = (options.now?.() ?? new Date()).toISOString();
      const statement = await buildAcceptanceStatement({
        declaration: extracted.value.info.declaration,
        paymentRequired,
        requirement: paymentPayload.accepted,
        payerId: options.payerId,
        counterpartyId: options.counterpartyId,
        transactionId: options.transactionId,
        acceptedAt,
        nonce: (options.nonce ?? defaultNonce)(),
      });
      const statementHash = await canonicalSha256(statement);
      const proof = await options.createProof({
        declaration: extracted.value.info.declaration,
        statement,
        statementHash,
        signingMessage: acceptanceSigningMessage(statement, statementHash),
        materialLimitations: [
          ...PEOPLE_COURT_ACCEPTANCE_MATERIAL_LIMITATIONS,
        ],
      });
      const acceptance: PeopleCourtDisputeAcceptanceV1 = {
        version: PEOPLE_COURT_DISPUTE_VERSION,
        statement,
        statementHash,
        proof,
      };
      const validated = validatePeopleCourtDisputeAcceptance(acceptance);
      if (!validated.valid) {
        throw new Error(
          `Invalid People's Court acceptance proof: ${validated.errors.join("; ")}`,
        );
      }
      const current =
        paymentPayload.extensions?.[PEOPLE_COURT_DISPUTE];
      const currentRecord =
        current && typeof current === "object" && !Array.isArray(current)
          ? (current as Record<string, unknown>)
          : {};
      const currentInfo =
        currentRecord.info &&
        typeof currentRecord.info === "object" &&
        !Array.isArray(currentRecord.info)
          ? (currentRecord.info as Record<string, unknown>)
          : {};
      return {
        ...paymentPayload,
        resource: paymentRequired.resource,
        extensions: {
          ...paymentPayload.extensions,
          [PEOPLE_COURT_DISPUTE]: {
            ...currentRecord,
            info: {
              ...currentInfo,
              acceptance: validated.value,
            },
          },
        },
      };
    },
  };
}

function immutableRequirement(
  requirement: DeepReadonly<PaymentRequirements>,
): PaymentRequirements {
  return {
    scheme: requirement.scheme,
    network: requirement.network,
    asset: requirement.asset,
    amount: requirement.amount,
    payTo: requirement.payTo,
    maxTimeoutSeconds: requirement.maxTimeoutSeconds,
    extra: { ...requirement.extra },
  };
}

function immutableDeclaration(
  declaration: unknown,
): ValidationResult<PeopleCourtDisputeDeclarationV1> {
  const parsed = validatePeopleCourtDisputeExtension(declaration);
  if (!parsed.valid) {
    return parsed;
  }
  return {
    valid: true,
    value: parsed.value.info.declaration,
  };
}

export function createPeopleCourtDisputeResourceServerExtension(
  options: CreatePeopleCourtDisputeResourceServerExtensionOptions = {},
): ResourceServerExtension {
  const validateContext = async (
    declarationValue: unknown,
    context: {
      paymentPayload: DeepReadonly<PaymentPayload>;
      requirements: DeepReadonly<PaymentRequirements>;
    },
  ): Promise<
    | { ok: true; acceptance: PeopleCourtDisputeAcceptanceV1 }
    | { ok: false; errors: string[] }
  > => {
    const declaration = immutableDeclaration(declarationValue);
    if (!declaration.valid) return { ok: false, errors: declaration.errors };
    const extension = extractPeopleCourtDisputeExtension(
      context.paymentPayload.extensions,
      { requireAcceptance: true },
    );
    if (!extension.valid) return { ok: false, errors: extension.errors };
    const acceptance = extension.value.info.acceptance;
    if (!acceptance) {
      return { ok: false, errors: ["Payment acceptance is required."] };
    }
    const resourceUrl = context.paymentPayload.resource?.url;
    if (!resourceUrl) {
      return {
        ok: false,
        errors: ["The payment payload must echo the exact resource URL."],
      };
    }
    const bound = await verifyAcceptanceBindings({
      declaration: declaration.value,
      acceptance,
      resourceUrl,
      requirement: immutableRequirement(context.requirements),
      now: options.now?.() ?? new Date(),
      ...(options.maxAcceptanceAgeSeconds === undefined
        ? {}
        : { maxAcceptanceAgeSeconds: options.maxAcceptanceAgeSeconds }),
    });
    if (!bound.valid) return { ok: false, errors: bound.errors };
    if (
      options.verifyAcceptanceProof &&
      !(await options.verifyAcceptanceProof(acceptance))
    ) {
      return {
        ok: false,
        errors: ["The acceptance proof did not verify."],
      };
    }
    return { ok: true, acceptance };
  };

  return {
    key: PEOPLE_COURT_DISPUTE,
    hooks: {
      onBeforeVerify: async (declaration, context) => {
        const result = await validateContext(declaration, context);
        if (!result.ok) {
          return {
            abort: true,
            reason: "peoples_court_dispute_acceptance_invalid",
            message: result.errors.join("; ").slice(0, 1000),
          };
        }
      },
      onBeforeSettle: async (declaration, context) => {
        const result = await validateContext(declaration, context);
        if (!result.ok) {
          return {
            abort: true,
            reason: "peoples_court_dispute_acceptance_invalid",
            message: result.errors.join("; ").slice(0, 1000),
          };
        }
      },
    },
    enrichSettlementResponse: async (declarationValue, context) => {
      if (!context.result.success) return undefined;
      const declaration = immutableDeclaration(declarationValue);
      if (!declaration.valid) return undefined;
      const extension = extractPeopleCourtDisputeExtension(
        context.paymentPayload.extensions as
          | Record<string, unknown>
          | undefined,
        { requireAcceptance: true },
      );
      const acceptance = extension.valid
        ? extension.value.info.acceptance
        : undefined;
      if (!acceptance) return undefined;
      return {
        info: {
          declarationHash: await canonicalSha256(declaration.value),
          acceptanceHash: await canonicalSha256(acceptance),
          transactionId: acceptance.statement.transactionId,
          executionOwner: declaration.value.execution.owner,
          automaticExecution: false,
        },
        schema: peopleCourtDisputeSettlementSchema,
      };
    },
  };
}

export const peopleCourtDisputeResourceServerExtension =
  createPeopleCourtDisputeResourceServerExtension();
