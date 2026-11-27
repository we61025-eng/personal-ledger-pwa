import type { MinorUnits } from './types';

export const DEFAULT_CURRENCY_SCALE = 100;

export function assertMinorUnits(value: MinorUnits, label = 'amount'): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer in minor units, got ${value}`);
  }
}

export function assertPositiveAmount(value: MinorUnits, label = 'amount'): void {
  assertMinorUnits(value, label);
  if (value <= 0) {
    throw new RangeError(`${label} must be greater than 0, got ${value}`);
  }
}

/**
 * 將使用者輸入字串或數字解析為最小貨幣單位整數，全程以字串拆解小數位避免浮點誤差。
 * 例：scale = 100 時，'12.34' -> 1234，'1,500' -> 150000。
 */
export function parseInputToMinor(
  input: string | number,
  scale = DEFAULT_CURRENCY_SCALE,
): MinorUnits {
  if (!Number.isInteger(scale) || scale <= 0 || Math.log10(scale) % 1 !== 0) {
    throw new RangeError(`scale must be a positive power of 10, got ${scale}`);
  }
  const decimals = Math.round(Math.log10(scale));
  const raw = typeof input === 'number' ? String(input) : input;
  const cleaned = raw.replace(/,/g, '').trim();

  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    throw new RangeError(`Invalid monetary input: "${raw}"`);
  }

  const isNegative = cleaned.startsWith('-');
  const unsigned = isNegative ? cleaned.slice(1) : cleaned;
  const [intPart, fracPart = ''] = unsigned.split('.');

  if (fracPart.length > decimals) {
    throw new RangeError(
      `Input "${raw}" exceeds allowed precision of ${decimals} decimal places`,
    );
  }

  const paddedFrac = fracPart.padEnd(decimals, '0');
  const combined = Number(`${intPart}${paddedFrac}`);
  const signed = isNegative ? -combined : combined;

  if (!Number.isSafeInteger(signed)) {
    throw new RangeError(`Monetary value out of safe integer range: "${raw}"`);
  }
  return signed === 0 ? 0 : signed;
}

/** 格式化最小貨幣單位為可讀金額字串 */
export function formatMinorToDisplay(
  amount: MinorUnits,
  currency = 'TWD',
  scale = DEFAULT_CURRENCY_SCALE,
): string {
  assertMinorUnits(amount);
  const major = amount / scale;
  const hasFraction = amount % scale !== 0;
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency,
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(major);
}

/**
 * 將總金額拆為 N 個整數金額，確保加總恆等於 totalAmount。
 * - strategy = 'first'：餘數併入第 1 期
 * - strategy = 'last'：餘數併入最後一期
 */
export function splitInstallmentAmounts(
  totalAmount: MinorUnits,
  totalInstallments: number,
  strategy: 'first' | 'last' = 'first',
): MinorUnits[] {
  assertPositiveAmount(totalAmount, 'totalAmount');
  if (!Number.isInteger(totalInstallments) || totalInstallments < 2) {
    throw new RangeError(`totalInstallments must be an integer >= 2, got ${totalInstallments}`);
  }

  const base = Math.floor(totalAmount / totalInstallments);
  const remainder = totalAmount % totalInstallments;
  const result = new Array<MinorUnits>(totalInstallments).fill(base);

  if (remainder > 0) {
    const targetIdx = strategy === 'first' ? 0 : totalInstallments - 1;
    result[targetIdx] += remainder;
  }
  return result;
}
