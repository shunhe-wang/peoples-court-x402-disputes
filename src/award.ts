import type {
  VerifyX402DisputePacketOptions,
  X402AwardExecutionAdapter,
  X402AwardReportRequest,
} from "./types.js";
import { verifyX402DisputePacketIntegrity } from "./packet.js";
import { PeopleCourtDisputeValidationError } from "./validation.js";

const SHA256 = /^[0-9a-f]{64}$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function reportServedX402Award<
  TAward,
  TResult,
>(
  request: X402AwardReportRequest<TAward>,
  adapter: X402AwardExecutionAdapter<TAward, TResult>,
  verificationOptions: VerifyX402DisputePacketOptions = {},
): Promise<TResult> {
  const verified = await verifyX402DisputePacketIntegrity(
    request.packet,
    verificationOptions,
  );
  if (!verified.valid) {
    throw new PeopleCourtDisputeValidationError(verified.errors);
  }
  if (verified.value.executionMode !== adapter.executionMode) {
    throw new PeopleCourtDisputeValidationError([
      "The award reporting adapter does not match the transaction’s actual execution owner mode.",
    ]);
  }
  if (verified.value.declaration.execution.owner !== adapter.executionOwner) {
    throw new PeopleCourtDisputeValidationError([
      "The award reporting adapter does not match the transaction’s exact declared execution owner.",
    ]);
  }
  const awardVerification = await adapter.verifyServedAward(request);
  if (!awardVerification.verified) {
    throw new PeopleCourtDisputeValidationError([
      "The served Award could not be verified against the configured signer trust policy.",
      ...(awardVerification.errors ?? []),
    ]);
  }
  const verificationErrors: string[] = [];
  if (!awardVerification.caseId.trim()) {
    verificationErrors.push("The verified Award is missing its People’s Court case identifier.");
  }
  if (awardVerification.transactionId !== verified.value.transactionId) {
    verificationErrors.push(
      "The verified Award external transaction does not match the x402 packet.",
    );
  }
  if (!SHA256.test(awardVerification.awardHash)) {
    verificationErrors.push("The verified Award hash is not a lowercase SHA-256 digest.");
  }
  if (!awardVerification.manifestId.trim()) {
    verificationErrors.push("The verified Award is missing its signed manifest identifier.");
  }
  if (
    !Number.isSafeInteger(awardVerification.awardRevision) ||
    awardVerification.awardRevision < 1
  ) {
    verificationErrors.push("The verified Award revision must be a positive integer.");
  }
  if (!EVM_ADDRESS.test(awardVerification.signerAddress)) {
    verificationErrors.push("The verified Award signer is not a valid EVM address.");
  }
  if (!awardVerification.trustPolicyId.trim()) {
    verificationErrors.push("The verified Award is missing its signer trust-policy identifier.");
  }
  if (verificationErrors.length) {
    throw new PeopleCourtDisputeValidationError(verificationErrors);
  }
  return adapter.reportServedAward({
    ...request,
    verification: awardVerification,
  });
}
