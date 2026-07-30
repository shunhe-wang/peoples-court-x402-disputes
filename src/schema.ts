const HASH_SCHEMA = {
  type: "string",
  pattern: "^[0-9a-f]{64}$",
} as const;

const URL_SCHEMA = {
  type: "string",
  minLength: 1,
  maxLength: 2048,
  format: "uri",
  pattern:
    "^(?:https://(?![^/?#]*@)[^\\s]+|http://(?:localhost|127\\.0\\.0\\.1|\\[::1\\])(?::[0-9]+)?(?:[/?#][^\\s]*)?)$",
} as const;

const IDENTIFIER_SCHEMA = {
  type: "string",
  minLength: 1,
  maxLength: 200,
  pattern: "^[^\\u0000-\\u001f\\u007f]{1,200}$",
} as const;

const NETWORK_SCHEMA = {
  type: "string",
  pattern: "^[a-z0-9][a-z0-9-]{0,31}:[A-Za-z0-9._-]{1,96}$",
} as const;

const CANONICAL_TIMESTAMP_SCHEMA = {
  type: "string",
  format: "date-time",
  pattern:
    "^(?:[0-9]{4}|[+-][0-9]{6})-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}Z$",
} as const;

export const peopleCourtDisputeExtensionSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  properties: {
    declaration: {
      type: "object",
      additionalProperties: false,
      required: [
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
      properties: {
        version: { const: 1 },
        provider: {
          type: "object",
          additionalProperties: false,
          required: ["id", "name", "forumUrl", "apiVersion"],
          properties: {
            id: IDENTIFIER_SCHEMA,
            name: { type: "string", minLength: 1, maxLength: 120 },
            forumUrl: URL_SCHEMA,
            apiVersion: { type: "string", minLength: 1, maxLength: 64 },
          },
        },
        seller: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: IDENTIFIER_SCHEMA,
            name: { type: "string", minLength: 1, maxLength: 200 },
          },
        },
        rules: {
          type: "object",
          additionalProperties: false,
          required: ["id", "version", "hash", "url"],
          properties: {
            id: IDENTIFIER_SCHEMA,
            version: { type: "string", minLength: 1, maxLength: 64 },
            hash: HASH_SCHEMA,
            url: URL_SCHEMA,
          },
        },
        terms: {
          type: "object",
          additionalProperties: false,
          required: ["version", "hash", "url"],
          properties: {
            version: { type: "string", minLength: 1, maxLength: 100 },
            hash: HASH_SCHEMA,
            url: URL_SCHEMA,
          },
        },
        scope: { type: "string", minLength: 1, maxLength: 1000 },
        supportedClaims: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          uniqueItems: true,
          items: {
            enum: [
              "nonperformance",
              "defective_performance",
              "service_level_breach",
              "payment_default",
              "refund_dispute",
              "misrepresentation",
              "scope_disagreement",
              "other",
            ],
          },
        },
        filingWindow: {
          type: "object",
          additionalProperties: false,
          required: ["startsAt", "durationSeconds"],
          properties: {
            startsAt: { const: "settlement" },
            durationSeconds: {
              type: "integer",
              minimum: 60,
              maximum: 31536000,
            },
          },
        },
        evidence: {
          type: "object",
          additionalProperties: false,
          required: [
            "offerReceipt",
            "paymentPayload",
            "settlementReference",
          ],
          properties: {
            offerReceipt: {
              enum: ["required", "recommended", "optional"],
            },
            paymentPayload: { const: "hash_only" },
            settlementReference: { const: "required" },
          },
        },
        execution: {
          type: "object",
          additionalProperties: false,
          required: ["owner", "modes", "automatic"],
          properties: {
            owner: IDENTIFIER_SCHEMA,
            modes: {
              type: "array",
              minItems: 1,
              maxItems: 2,
              uniqueItems: true,
              items: {
                enum: ["partner_executes", "x402r"],
              },
            },
            automatic: { const: false },
          },
        },
        resourceBinding: { const: "exact_url" },
        privacyNoticeUrl: URL_SCHEMA,
      },
    },
    acceptance: {
      type: "object",
      additionalProperties: false,
      required: ["version", "statement", "statementHash", "proof"],
      properties: {
        version: { const: 1 },
        statement: {
          type: "object",
          additionalProperties: false,
          required: [
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
          properties: {
            version: { const: 1 },
            declarationHash: HASH_SCHEMA,
            paymentRequirementHash: HASH_SCHEMA,
            resourceUrl: URL_SCHEMA,
            scheme: { const: "exact" },
            network: NETWORK_SCHEMA,
            asset: { type: "string", minLength: 1, maxLength: 256 },
            amount: {
              type: "string",
              pattern: "^(0|[1-9][0-9]{0,77})$",
            },
            payTo: { type: "string", minLength: 1, maxLength: 256 },
            payerId: IDENTIFIER_SCHEMA,
            counterpartyId: IDENTIFIER_SCHEMA,
            transactionId: IDENTIFIER_SCHEMA,
            rulesVersion: { type: "string", minLength: 1, maxLength: 64 },
            rulesHash: HASH_SCHEMA,
            termsVersion: { type: "string", minLength: 1, maxLength: 100 },
            termsHash: HASH_SCHEMA,
            scope: { type: "string", minLength: 1, maxLength: 1000 },
            acceptedAt: CANONICAL_TIMESTAMP_SCHEMA,
            nonce: {
              type: "string",
              minLength: 16,
              maxLength: 128,
              pattern: "^[A-Za-z0-9._:-]+$",
            },
          },
        },
        statementHash: HASH_SCHEMA,
        proof: {
          type: "object",
          additionalProperties: false,
          required: ["method", "artifactRef", "artifactHash"],
          allOf: [
            {
              if: {
                properties: {
                  method: {
                    enum: ["wallet_signature", "agent_signature"],
                  },
                },
                required: ["method"],
              },
              then: {
                required: ["signature"],
              },
            },
          ],
          properties: {
            method: {
              enum: [
                "clickthrough",
                "wallet_signature",
                "agent_signature",
                "signed_document",
              ],
            },
            artifactRef: {
              type: "string",
              minLength: 1,
              maxLength: 1000,
            },
            artifactHash: HASH_SCHEMA,
            signerId: IDENTIFIER_SCHEMA,
            signature: {
              type: "object",
              additionalProperties: false,
              required: ["format", "value"],
              properties: {
                format: {
                  enum: ["eip191", "eip712", "jws", "other"],
                },
                kid: { type: "string", minLength: 1, maxLength: 500 },
                value: { type: "string", minLength: 1, maxLength: 16384 },
              },
            },
          },
        },
      },
    },
  },
  required: ["declaration"],
} as const;

export const peopleCourtDisputeSettlementSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "declarationHash",
    "acceptanceHash",
    "transactionId",
    "executionOwner",
    "automaticExecution",
  ],
  properties: {
    declarationHash: HASH_SCHEMA,
    acceptanceHash: HASH_SCHEMA,
    transactionId: IDENTIFIER_SCHEMA,
    executionOwner: IDENTIFIER_SCHEMA,
    automaticExecution: { const: false },
  },
} as const;
