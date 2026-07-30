import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
} from "@x402/core/types";
import type {
  OfferPayload,
  ReceiptPayload,
  SignedOffer,
  SignedReceipt,
} from "@x402/extensions/offer-receipt";
import type {
  AcceptanceVerification,
  ExecutionMode,
  GeneralClaimClass,
  PeopleCourtDisputeAcceptanceProofV1,
  PeopleCourtDisputeAcceptanceStatementV1,
  PeopleCourtDisputeAcceptanceV1,
  PeopleCourtDisputeDeclarationV1,
  VerifiedProtocolArtifact,
  X402DisputeRail,
  X402DisputeEvidenceReferenceV1,
  X402DisputePacketV1,
} from "./wire-types.js";

export * from "./wire-types.js";

export type InspectedOfferArtifact = VerifiedProtocolArtifact<
  SignedOffer,
  OfferPayload
>;

export interface AcceptanceProofRequest {
  declaration: PeopleCourtDisputeDeclarationV1;
  statement: PeopleCourtDisputeAcceptanceStatementV1;
  statementHash: string;
  signingMessage: string;
  materialLimitations: string[];
}

export type CreateAcceptanceProof = (
  request: AcceptanceProofRequest,
) => Promise<PeopleCourtDisputeAcceptanceProofV1>;

export interface CreatePeopleCourtDisputeClientExtensionOptions {
  payerId: string;
  counterpartyId: string;
  transactionId: string;
  nonce?: () => string;
  now?: () => Date;
  createProof: CreateAcceptanceProof;
}

export interface CreatePeopleCourtDisputeResourceServerExtensionOptions {
  verifyAcceptanceProof?: (
    acceptance: PeopleCourtDisputeAcceptanceV1,
  ) => Promise<boolean>;
  now?: () => Date;
  maxAcceptanceAgeSeconds?: number;
}

export interface BuildX402DisputePacketInput {
  paymentRequired: PaymentRequired;
  paymentPayload: PaymentPayload;
  settlement: SettleResponse;
  rail: X402DisputeRail;
  claimClass: GeneralClaimClass;
  disputedAmount: {
    value: string;
    currency: string;
  };
  executionMode: ExecutionMode;
  settledAt: string;
  offer?: SignedOffer;
  receipt?: SignedReceipt;
  evidence?: X402DisputeEvidenceReferenceV1[];
  verifyJwsOffer?: (
    offer: SignedOffer,
  ) => Promise<{ payload: OfferPayload; signer?: string }>;
  verifyJwsReceipt?: (
    receipt: SignedReceipt,
  ) => Promise<{ payload: ReceiptPayload; signer?: string }>;
}

export interface VerifyX402DisputePacketOptions {
  verifyAcceptanceProof?: (
    acceptance: PeopleCourtDisputeAcceptanceV1,
    verification: AcceptanceVerification,
  ) => Promise<boolean>;
  verifyJwsOffer?: (
    offer: SignedOffer,
  ) => Promise<{ payload: OfferPayload; signer?: string }>;
  verifyJwsReceipt?: (
    receipt: SignedReceipt,
  ) => Promise<{ payload: ReceiptPayload; signer?: string }>;
}

export interface ValidationSuccess<T> {
  valid: true;
  value: T;
}

export interface ValidationFailure {
  valid: false;
  errors: string[];
}

export type ValidationResult<T> =
  | ValidationSuccess<T>
  | ValidationFailure;

export interface PreparedAdjudicationFiling {
  draftId: string;
  reservedCaseId: string;
  draftDigest: string;
  confirmationStatement: string;
  expiresAt: string;
  rules: { version: string; hash: string };
  fee: Record<string, unknown>;
}

export interface ConfirmedAdjudicationFiling {
  caseId: string;
  externalCaseId: string;
  status: string;
  accessSide: "claimant";
  rulesVersion: string;
  rulesHash: string;
  createdAt: string;
}

export interface PeopleCourtPrepareFilingInput {
  externalCaseId: string;
  transactionId: string;
  policyVersion: string;
  authorityGrantId: string;
  consentArtifactIds: {
    claimant: string;
    respondent: string;
  };
  summary: string;
  backgroundFacts?: string;
  amount: {
    value: number;
    currency: "USD";
  };
  parties: {
    claimant: { externalId: string; name: string };
    respondent: { externalId: string; name: string };
  };
  claim: {
    statement: string;
    requestedOutcome: "refund" | "release" | "split" | "other";
  };
  metadata?: Record<string, string>;
  x402DisputePacket: X402DisputePacketV1;
}

export interface PeopleCourtConfirmFilingInput {
  draftDigest: string;
  confirmationStatement: string;
  actorId: string;
  principalId: string;
  confirmationMethod: "protocol_act";
  confirmationReference: string;
}

export interface PeopleCourtPartnerTransport {
  prepareFiling(
    input: PeopleCourtPrepareFilingInput,
    idempotencyKey: string,
  ): Promise<{ data: PreparedAdjudicationFiling; requestId?: string }>;
  confirmFiling(
    draftId: string,
    input: PeopleCourtConfirmFilingInput,
    idempotencyKey: string,
  ): Promise<{ data: ConfirmedAdjudicationFiling; requestId?: string }>;
  submitEvidence?(
    caseId: string,
    input: unknown,
    idempotencyKey: string,
  ): Promise<unknown>;
  getCase(
    caseId: string,
  ): Promise<{ data: Record<string, unknown>; requestId?: string }>;
  getServedAward(
    caseId: string,
  ): Promise<{ data: Record<string, unknown>; requestId?: string }>;
}

export interface PeopleCourtAdjudicationAdapter {
  prepare(
    input: Omit<
      PeopleCourtPrepareFilingInput,
      "transactionId" | "x402DisputePacket"
    > & {
      packet: X402DisputePacketV1;
      idempotencyKey: string;
    },
  ): Promise<PreparedAdjudicationFiling>;
  confirm(
    draftId: string,
    input: PeopleCourtConfirmFilingInput & {
      idempotencyKey: string;
    },
  ): Promise<ConfirmedAdjudicationFiling>;
  submitEvidence(
    caseId: string,
    input: unknown,
    idempotencyKey: string,
  ): Promise<unknown>;
  getCase(caseId: string): Promise<Record<string, unknown>>;
  getServedAward(caseId: string): Promise<Record<string, unknown>>;
}

export interface X402AwardReportRequest<TAward = Record<string, unknown>> {
  packet: X402DisputePacketV1;
  servedAward: TAward;
  idempotencyKey: string;
}

export interface X402ServedAwardVerification {
  verified: true;
  caseId: string;
  externalCaseId: string;
  awardHash: string;
  manifestId: string;
  awardRevision: number;
  signerAddress: string;
  trustPolicyId: string;
}

export interface X402ServedAwardVerificationFailure {
  verified: false;
  errors?: string[];
}

export type X402ServedAwardVerificationResult =
  | X402ServedAwardVerification
  | X402ServedAwardVerificationFailure;

export interface VerifiedX402AwardReportRequest<
  TAward = Record<string, unknown>,
> extends X402AwardReportRequest<TAward> {
  verification: X402ServedAwardVerification;
}

export interface X402AwardExecutionAdapter<
  TAward = Record<string, unknown>,
  TResult = unknown,
> {
  executionMode: "partner_executes" | "x402r";
  executionOwner: string;
  verifyServedAward(
    request: X402AwardReportRequest<TAward>,
  ): Promise<X402ServedAwardVerificationResult>;
  reportServedAward(
    request: VerifiedX402AwardReportRequest<TAward>,
  ): Promise<TResult>;
}

export interface PaymentBinding {
  x402Version: 2;
  resourceUrl: string;
  requirement: PaymentRequirements;
  declaration: PeopleCourtDisputeDeclarationV1;
}
