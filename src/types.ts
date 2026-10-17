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

/** Party classification in the canonical People’s Court filing contract. */
export type PeopleCourtPrincipalKind =
  | "individual"
  | "organization"
  | "autonomous_agent";

/** Adjudicator track. Omit it to let the forum assign the default before consent. */
export type PeopleCourtCaseTrack =
  | "ai_fast"
  | "ai_standard"
  | "ai_assisted_human";

export interface PeopleCourtFiatMoney {
  currency: "USD";
  /** Non-negative integer string in cents. */
  minorUnits: string;
}

export interface PeopleCourtFilingParty {
  externalId: string;
  name: string;
  principalKind: PeopleCourtPrincipalKind;
}

export interface PeopleCourtFilingParticipant {
  side?: "claimant" | "respondent";
  partnerId?: string;
  agentId?: string;
  role: "claimant_representative" | "respondent_representative";
}

/**
 * Request body of the canonical `POST /api/filings` operation, limited to the
 * fields this adapter supports. The published People’s Court OpenAPI document
 * is authoritative.
 */
export interface PeopleCourtPrepareFilingInput {
  externalCaseId: string;
  transactionId: string;
  policyVersion: string;
  authorityGrantId: string;
  /** Omit `respondent` for `claimant_initiated` filings with a hosted respondent. */
  consentArtifactIds: {
    claimant?: string;
    respondent?: string;
  };
  /** The People’s Court account that must accept the filing packet before confirmation. */
  claimantAcceptanceIdentity: {
    email: string;
    accountId?: string;
    walletAddress?: string;
  };
  intakeMode:
    | "claimant_initiated"
    | "claimant_proposed"
    | "bilateral_api"
    | "bundled_bilateral";
  confirmationPolicy: {
    mode: "initiator_only" | "all_participants" | "bundled_authorizations";
  };
  claimAmount: PeopleCourtFiatMoney;
  parties: {
    claimant: PeopleCourtFilingParty;
    respondent: PeopleCourtFilingParty;
  };
  summary: string;
  backgroundFacts?: string;
  claim: {
    statement: string;
    requestedOutcome: "refund" | "release" | "split" | "other";
    requestedItems?: Array<{
      id: string;
      kind: "monetary" | "declaratory" | "order";
      text: string;
    }>;
  };
  caseTrack?: PeopleCourtCaseTrack;
  appealWaived?: boolean;
  participants?: PeopleCourtFilingParticipant[];
  schedule?: Record<string, unknown>;
  metadata?: Record<string, string>;
}

export interface PeopleCourtFilingConfirmationState {
  participantId: string;
  side: "claimant" | "respondent";
  required: boolean;
  status: string;
  confirmationStatement: string;
  partnerId?: string;
  authorizationMode?: string;
}

export interface PeopleCourtFilingParticipantState {
  participantId: string;
  side: "claimant" | "respondent";
  principalId: string;
  agentId?: string;
  partnerId?: string;
  authorizationMode?: string;
  role?: string;
}

/** Canonical filing draft returned by `POST /api/filings` and `GET /api/filings/{id}`. */
export interface PreparedAdjudicationFiling {
  draftId: string;
  reservedCaseId: string;
  externalCaseId: string;
  status: string;
  draftDigest: string;
  expiresAt: string;
  caseTrack?: PeopleCourtCaseTrack;
  rules: { version: string; hash: string };
  fee: Record<string, unknown>;
  participants: PeopleCourtFilingParticipantState[];
  confirmations: PeopleCourtFilingConfirmationState[];
  /**
   * Show-once link where the claimant’s People’s Court account accepts the
   * exact filing packet. Returned by preparation only; the HTTP transport
   * resolves it against its base URL.
   */
  hostedAcceptanceUrl?: string;
  [field: string]: unknown;
}

/** Canonical result of `POST /api/filings/{id}/confirmations`. */
export interface ConfirmedAdjudicationFiling {
  /** Present once the last required confirmation opened the case. */
  caseId?: string;
  externalCaseId?: string;
  status: string;
  rules?: { version: string; hash: string };
  createdAt?: string;
  [field: string]: unknown;
}

/** Request body of `POST /api/filings/{id}/confirmations`. */
export interface PeopleCourtConfirmFilingInput {
  participantId: string;
  draftDigest: string;
  confirmationStatement: string;
  actorId: string;
  principalId: string;
  confirmationMethod: "protocol_act";
  confirmationReference: string;
}

export interface PeopleCourtEvidenceFile {
  filename: string;
  mediaType: string;
  bytes: Uint8Array;
}

/** Multipart fields of `POST /api/cases/{id}/submissions` for a partner credential. */
export interface PeopleCourtEvidenceSubmission {
  party: "claimant" | "respondent";
  brief: string;
  files?: PeopleCourtEvidenceFile[];
}

export interface PeopleCourtPartnerTransport {
  prepareFiling(
    input: PeopleCourtPrepareFilingInput,
    idempotencyKey: string,
  ): Promise<{ data: PreparedAdjudicationFiling; requestId?: string }>;
  getFiling(
    draftId: string,
  ): Promise<{ data: PreparedAdjudicationFiling; requestId?: string }>;
  confirmFiling(
    draftId: string,
    input: PeopleCourtConfirmFilingInput,
    idempotencyKey: string,
  ): Promise<{ data: ConfirmedAdjudicationFiling; requestId?: string }>;
  submitEvidence?(
    caseId: string,
    input: PeopleCourtEvidenceSubmission,
    idempotencyKey: string,
  ): Promise<{ data: Record<string, unknown>; requestId?: string }>;
  getCase(
    caseId: string,
  ): Promise<{ data: Record<string, unknown>; requestId?: string }>;
  getServedAward(
    caseId: string,
  ): Promise<{ data: Record<string, unknown>; requestId?: string }>;
}

export type PeopleCourtAdjudicationPrepareInput = Omit<
  PeopleCourtPrepareFilingInput,
  "transactionId" | "claimAmount"
> & {
  packet: X402DisputePacketV1;
  idempotencyKey: string;
};

export interface PeopleCourtAdjudicationConfirmInput {
  /** Defaults to the claimant participant’s immutable agent ID. */
  actorId?: string;
  /** Defaults to the claimant participant’s principal ID. */
  principalId?: string;
  confirmationReference: string;
  idempotencyKey: string;
}

export interface PeopleCourtPacketEvidenceInput {
  packet: X402DisputePacketV1;
  /** Replaces the default exhibit description. */
  brief?: string;
}

export interface PeopleCourtAdjudicationAdapter {
  prepare(
    input: PeopleCourtAdjudicationPrepareInput,
  ): Promise<PreparedAdjudicationFiling>;
  confirm(
    draftId: string,
    input: PeopleCourtAdjudicationConfirmInput,
  ): Promise<ConfirmedAdjudicationFiling>;
  submitPacketEvidence(
    caseId: string,
    input: PeopleCourtPacketEvidenceInput,
    idempotencyKey: string,
  ): Promise<Record<string, unknown>>;
  submitEvidence(
    caseId: string,
    input: PeopleCourtEvidenceSubmission,
    idempotencyKey: string,
  ): Promise<Record<string, unknown>>;
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
  transactionId: string;
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
