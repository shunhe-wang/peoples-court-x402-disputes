import {
  decodeSignedOffers,
  extractOfferPayload,
  extractOffersFromPaymentRequired,
  extractReceiptPayload,
  findAcceptsObjectFromSignedOffer,
  isEIP712SignedOffer,
  isEIP712SignedReceipt,
  isJWSSignedOffer,
  isJWSSignedReceipt,
  verifyOfferSignatureEIP712,
  verifyReceiptSignatureEIP712,
  type OfferPayload,
  type ReceiptPayload,
  type SignedOffer,
  type SignedReceipt,
} from "@x402/extensions/offer-receipt";
import type {
  PaymentRequired,
  PaymentRequirements,
} from "@x402/core/types";

import { canonicalSha256 } from "./canonical.js";
import type {
  InspectedOfferArtifact,
  VerifiedReceiptArtifact,
} from "./types.js";

function sameRequirement(
  payload: OfferPayload,
  resourceUrl: string,
  requirement: PaymentRequirements,
): boolean {
  return (
    payload.version === 1 &&
    payload.resourceUrl === resourceUrl &&
    payload.scheme === requirement.scheme &&
    payload.network === requirement.network &&
    payload.asset === requirement.asset &&
    payload.payTo === requirement.payTo &&
    payload.amount === requirement.amount
  );
}

export function findSelectedSignedOffer(
  paymentRequired: PaymentRequired,
  requirement: PaymentRequirements,
): SignedOffer | undefined {
  const offers = extractOffersFromPaymentRequired(paymentRequired);
  if (!offers.length) return undefined;
  try {
    const decoded = decodeSignedOffers(offers);
    return decoded.find(
      (offer) =>
        findAcceptsObjectFromSignedOffer(offer, paymentRequired.accepts) ===
          requirement ||
        sameRequirement(
          offer,
          paymentRequired.resource.url,
          requirement,
        ),
    )?.signedOffer;
  } catch {
    return undefined;
  }
}

export async function inspectSignedOffer(input: {
  offer?: SignedOffer;
  resourceUrl: string;
  requirement: PaymentRequirements;
  acceptedAt?: string;
  verifyJws?: (
    offer: SignedOffer,
  ) => Promise<{ payload: OfferPayload; signer?: string }>;
}): Promise<InspectedOfferArtifact> {
  if (!input.offer) return { status: "absent" };
  let payload: OfferPayload;
  let signer: string | undefined;
  let status: InspectedOfferArtifact["status"] = "present_unverified";
  try {
    if (isEIP712SignedOffer(input.offer)) {
      const verified = await verifyOfferSignatureEIP712(input.offer);
      payload = verified.payload;
      signer = verified.signer;
      status = "verified";
    } else if (isJWSSignedOffer(input.offer) && input.verifyJws) {
      const verified = await input.verifyJws(input.offer);
      payload = verified.payload;
      signer = verified.signer;
      status = "verified";
    } else {
      payload = extractOfferPayload(input.offer);
    }
  } catch {
    return {
      status: "invalid",
      artifact: input.offer,
      artifactHash: await canonicalSha256(input.offer),
      errorCode: "offer_signature_or_payload_invalid",
    };
  }
  const artifactHash = await canonicalSha256(input.offer);
  if (!sameRequirement(payload, input.resourceUrl, input.requirement)) {
    return {
      status: "invalid",
      artifact: input.offer,
      artifactHash,
      payload,
      ...(signer === undefined ? {} : { signer }),
      errorCode: "offer_payment_mismatch",
    };
  }
  if (
    input.acceptedAt &&
    Number.isFinite(payload.validUntil) &&
    payload.validUntil < Math.floor(Date.parse(input.acceptedAt) / 1000)
  ) {
    return {
      status: "invalid",
      artifact: input.offer,
      artifactHash,
      payload,
      ...(signer === undefined ? {} : { signer }),
      errorCode: "offer_expired_before_acceptance",
    };
  }
  return {
    status,
    artifact: input.offer,
    artifactHash,
    payload,
    ...(signer === undefined ? {} : { signer }),
  };
}

export async function inspectSignedReceipt(input: {
  receipt?: SignedReceipt;
  resourceUrl: string;
  network: string;
  payer?: string;
  transaction: string;
  settledAt: string;
  maxAgeSeconds?: number;
  verifyJws?: (
    receipt: SignedReceipt,
  ) => Promise<{ payload: ReceiptPayload; signer?: string }>;
}): Promise<VerifiedReceiptArtifact> {
  if (!input.receipt) return { status: "absent" };
  if (!input.payer) {
    return {
      status: "invalid",
      artifact: input.receipt,
      artifactHash: await canonicalSha256(input.receipt),
      errorCode: "receipt_payer_binding_required",
    };
  }
  let payload: ReceiptPayload;
  let signer: string | undefined;
  let status: VerifiedReceiptArtifact["status"] = "present_unverified";
  try {
    if (isEIP712SignedReceipt(input.receipt)) {
      const verified = await verifyReceiptSignatureEIP712(input.receipt);
      payload = verified.payload;
      signer = verified.signer;
      status = "verified";
    } else if (isJWSSignedReceipt(input.receipt) && input.verifyJws) {
      const verified = await input.verifyJws(input.receipt);
      payload = verified.payload;
      signer = verified.signer;
      status = "verified";
    } else {
      payload = extractReceiptPayload(input.receipt);
    }
  } catch {
    return {
      status: "invalid",
      artifact: input.receipt,
      artifactHash: await canonicalSha256(input.receipt),
      errorCode: "receipt_signature_or_payload_invalid",
    };
  }
  const artifactHash = await canonicalSha256(input.receipt);
  const settledAtSeconds = Math.floor(Date.parse(input.settledAt) / 1000);
  const maxAgeSeconds = input.maxAgeSeconds ?? 3600;
  const payloadTransaction =
    typeof payload.transaction === "string" ? payload.transaction : "";
  const mismatch =
    payload.version !== 1 ||
    payload.resourceUrl !== input.resourceUrl ||
    payload.network !== input.network ||
    payload.payer.toLowerCase() !== input.payer.toLowerCase() ||
    (payloadTransaction.length > 0 &&
      payloadTransaction.toLowerCase() !== input.transaction.toLowerCase()) ||
    !Number.isSafeInteger(payload.issuedAt) ||
    payload.issuedAt > settledAtSeconds + 300 ||
    settledAtSeconds - payload.issuedAt > maxAgeSeconds;
  if (mismatch) {
    return {
      status: "invalid",
      artifact: input.receipt,
      artifactHash,
      payload,
      ...(signer === undefined ? {} : { signer }),
      errorCode: "receipt_settlement_mismatch",
    };
  }
  return {
    status,
    artifact: input.receipt,
    artifactHash,
    payload,
    ...(signer === undefined ? {} : { signer }),
  };
}
