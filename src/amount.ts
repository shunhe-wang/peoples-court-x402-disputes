const DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;

function normalizePlainDecimal(value: string): string | null {
  if (!DECIMAL.test(value)) return null;
  if (!value.includes(".")) return value;
  const normalized = value.replace(/0+$/, "").replace(/\.$/, "");
  return normalized || "0";
}

function finiteNumberAsPlainDecimal(value: number): string | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const source = String(value);
  if (!/[eE]/.test(source)) return normalizePlainDecimal(source);
  const [coefficient = "", exponentText = ""] = source.toLowerCase().split("e");
  const exponent = Number(exponentText);
  if (!Number.isSafeInteger(exponent)) return null;
  const [whole = "", fraction = ""] = coefficient.split(".");
  const digits = `${whole}${fraction}`;
  const decimalIndex = whole.length + exponent;
  const expanded =
    decimalIndex <= 0
      ? `0.${"0".repeat(-decimalIndex)}${digits}`
      : decimalIndex >= digits.length
        ? `${digits}${"0".repeat(decimalIndex - digits.length)}`
        : `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
  return normalizePlainDecimal(expanded);
}

export function decimalAmountMatchesNumber(
  amount: string,
  value: number,
): boolean {
  const normalizedAmount = normalizePlainDecimal(amount);
  const normalizedValue = finiteNumberAsPlainDecimal(value);
  return (
    normalizedAmount !== null &&
    normalizedValue !== null &&
    normalizedAmount === normalizedValue
  );
}
