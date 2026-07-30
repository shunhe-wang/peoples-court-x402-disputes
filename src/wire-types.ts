export const PEOPLE_COURT_DISPUTE = "peoples-court-dispute" as const;
export const PEOPLE_COURT_DISPUTE_VERSION = 1 as const;
export const X402_DISPUTE_PACKET_VERSION = 1 as const;
export const MAX_X402_DISPUTE_PACKET_BYTES = 128 * 1024;
export const SUPPORTED_PAYMENT_SCHEMES = ["exact"] as const;

export const GENERAL_CLAIM_CLASSES = [
  "nonperformance",
  "defective_performance",
  "service_level_breach",
  "payment_default",
  "refund_dispute",
  "misrepresentation",
  "scope_disagreement",
  "other",
] as const;

export type GeneralClaimClass = (typeof GENERAL_CLAIM_CLASSES)[number];

export const EXECUTION_MODES = ["partner_executes", "x402r"] as const;

export type ExecutionMode = (typeof EXECUTION_MODES)[number];
export type X402DisputeRail = "x402" | "x402r";
export type OfferReceiptPolicy = "required" | "recommended" | "optional";
export type AcceptanceMethod =
  | "clickthrough"
  | "wallet_signature"
  | "agent_signature"
  | "signed_document";
export type AcceptanceVerificationStatus =
  | "unverified"
  | "verified"
  | "invalid";
export type ArtifactVerificationStatus =
  | "absent"
  | "present_unverified"
  | "verified"
  | "invalid";

export interface PeopleCourtDisputeDeclarationV1 {
  version: typeof PEOPLE_COURT_DISPUTE_VERSION;
  provider: {
    id: string;
    name: string;
    forumUrl: string;
    apiVersion: string;
  };
  seller: {
    id: string;
    name?: string;
  };
  rules: {
    id: string;
    version: string;
    hash: string;
    url: string;
  };
  terms: {
    version: string;
    hash: string;
    url: string;
  };
  scope: string;
  supportedClaims: GeneralClaimClass[];
  filingWindow: {
    startsAt: "settlement";
    durationSeconds: number;
  };
  evidence: {
    offerReceipt: OfferReceiptPolicy;
    paymentPayload: "hash_only";
    settlementReference: "required";
  };
  execution: {
    owner: string;
    modes: ExecutionMode[];
    automatic: false;
  };
  resourceBinding: "exact_url";
  privacyNoticeUrl: string;
}

export interface PeopleCourtDisputeAcceptanceStatementV1 {
  version: typeof PEOPLE_COURT_DISPUTE_VERSION;
  declarationHash: string;
  paymentRequirementHash: string;
  resourceUrl: string;
  scheme: "exact";
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  payerId: string;
  counterpartyId: string;
  transactionId: string;
  rulesVersion: string;
  rulesHash: string;
  termsVersion: string;
  termsHash: string;
  scope: string;
  acceptedAt: string;
  nonce: string;
}

export interface PeopleCourtDisputeAcceptanceProofV1 {
  method: AcceptanceMethod;
  artifactRef: string;
  artifactHash: string;
  signerId?: string;
  signature?: {
    format: "eip191" | "eip712" | "jws" | "other";
    kid?: string;
    value: string;
  };
}

export interface PeopleCourtDisputeAcceptanceV1 {
  version: typeof PEOPLE_COURT_DISPUTE_VERSION;
  statement: PeopleCourtDisputeAcceptanceStatementV1;
  statementHash: string;
  proof: PeopleCourtDisputeAcceptanceProofV1;
}

export interface PeopleCourtDisputeExtensionInfoV1 {
  declaration: PeopleCourtDisputeDeclarationV1;
  acceptance?: PeopleCourtDisputeAcceptanceV1;
}

export interface PeopleCourtDisputeExtensionV1 {
  info: PeopleCourtDisputeExtensionInfoV1;
  schema: Record<string, unknown>;
}

export interface X402OfferPayloadV1 {
  version: number;
  resourceUrl: string;
  scheme: "exact";
  network: string;
  asset: string;
  payTo: string;
  amount: string;
  validUntil: number;
}

export type X402SignedOfferArtifact =
  | {
      format: "jws";
      acceptIndex?: number;
      signature: string;
    }
  | {
      format: "eip712";
      acceptIndex?: number;
      payload: X402OfferPayloadV1;
      signature: string;
    };

export interface X402ReceiptPayloadV1 {
  version: number;
  network: string;
  resourceUrl: string;
  payer: string;
  issuedAt: number;
  transaction: string;
}

export type X402SignedReceiptArtifact =
  | {
      format: "jws";
      signature: string;
    }
  | {
      format: "eip712";
      payload: X402ReceiptPayloadV1;
      signature: string;
    };

export interface VerifiedProtocolArtifact<TArtifact, TPayload> {
  status: ArtifactVerificationStatus;
  artifact?: TArtifact;
  artifactHash?: string;
  payload?: TPayload;
  signer?: string;
  errorCode?: string;
}

export type VerifiedOfferArtifact = VerifiedProtocolArtifact<
  X402SignedOfferArtifact,
  X402OfferPayloadV1
>;
export type VerifiedReceiptArtifact = VerifiedProtocolArtifact<
  X402SignedReceiptArtifact,
  X402ReceiptPayloadV1
>;

export interface AcceptanceVerification {
  status: AcceptanceVerificationStatus;
  verifier?: string;
  checkedAt?: string;
  errorCode?: string;
}

export interface X402DisputeEvidenceReferenceV1 {
  kind: "deliverable" | "request" | "response" | "message" | "other";
  sha256: string;
  mediaType: string;
  artifactRef?: string;
}

export interface X402DisputePacketV1 {
  version: typeof X402_DISPUTE_PACKET_VERSION;
  protocol: "x402";
  x402Version: 2;
  rail: X402DisputeRail;
  transactionId: string;
  createdAt: string;
  resourceUrl: string;
  claimClass: GeneralClaimClass;
  parties: {
    claimantId: string;
    respondentId: string;
  };
  disputedAmount: {
    value: string;
    currency: string;
  };
  payment: {
    scheme: "exact";
    network: string;
    asset: string;
    amount: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extraHash: string;
  };
  executionMode: ExecutionMode;
  paymentRequirementHash: string;
  paymentPayloadHash: string;
  authorizationHash: string;
  settlement: {
    transaction: string;
    network: string;
    payer?: string;
    settledAt: string;
  };
  declaration: PeopleCourtDisputeDeclarationV1;
  declarationHash: string;
  acceptance: PeopleCourtDisputeAcceptanceV1;
  acceptanceVerification: AcceptanceVerification;
  offer: VerifiedOfferArtifact;
  receipt: VerifiedReceiptArtifact;
  evidence: X402DisputeEvidenceReferenceV1[];
  packetHash: string;
}

export type UnsignedX402DisputePacketV1 = Omit<
  X402DisputePacketV1,
  "packetHash"
>;
