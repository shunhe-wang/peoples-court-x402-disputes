/** Identifier syntax, not a semantic determination or signer trust policy. */
export function sameSettlementIdentifier(
  network: string,
  left: string,
  right: string,
): boolean {
  if (
    network.startsWith("eip155:") &&
    /^0x[0-9a-fA-F]+$/.test(left) &&
    /^0x[0-9a-fA-F]+$/.test(right)
  ) {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}
