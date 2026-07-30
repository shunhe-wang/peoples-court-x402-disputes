import {
  createPeopleCourtDisputeResourceServerExtension,
  declarePeopleCourtDisputeExtension,
  type PeopleCourtDisputeDeclarationV1,
} from "../src/index.js";

export const declaration: PeopleCourtDisputeDeclarationV1 = {
  version: 1,
  provider: {
    id: "peoples-court",
    name: "People's Court",
    forumUrl: "https://peoplescourt.ai",
    apiVersion: "2026-07-23",
  },
  seller: {
    id: "merchant-principal-123",
    name: "Example Merchant",
  },
  rules: {
    id: "arbitral-rules-v0.21",
    version: "0.21",
    hash: "a".repeat(64),
    url: "https://peoplescourt.ai/rules",
  },
  terms: {
    version: "merchant-dispute-terms-v1",
    hash: "b".repeat(64),
    url: "https://merchant.example/dispute-terms",
  },
  scope: "Claims arising from transaction merchant-order-123",
  supportedClaims: [
    "nonperformance",
    "defective_performance",
    "refund_dispute",
  ],
  filingWindow: {
    startsAt: "settlement",
    durationSeconds: 30 * 24 * 60 * 60,
  },
  evidence: {
    offerReceipt: "recommended",
    paymentPayload: "hash_only",
    settlementReference: "required",
  },
  execution: {
    owner: "merchant-platform",
    modes: ["partner_executes"],
    automatic: false,
  },
  resourceBinding: "exact_url",
  privacyNoticeUrl: "https://peoplescourt.ai/privacy",
};

export const routeExtensions =
  declarePeopleCourtDisputeExtension(declaration);

export const serverExtension =
  createPeopleCourtDisputeResourceServerExtension({
    verifyAcceptanceProof: async (acceptance) =>
      acceptance.proof.method === "clickthrough" &&
      acceptance.proof.artifactRef.startsWith("merchant://acceptance/"),
  });
