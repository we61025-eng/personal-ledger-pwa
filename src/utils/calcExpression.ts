/**
 * 安全計算快速記帳鍵盤上的簡易加減算式（僅支援非負數字與 + / -，不使用 eval）。
 * 例：'120+85-20' -> '185'
 */
export function evaluateSimpleExpression(expr: string): string | null {
  const cleaned = expr.replace(/\s+/g, '');
  if (!cleaned) return null;
  if (!/^\d+(\.\d{1,2})?([+-]\d+(\.\d{1,2})?)*$/.test(cleaned)) {
    return null;
  }

  const tokens = cleaned.match(/[+-]?\d+(?:\.\d{1,2})?/g);
  if (!tokens) return null;

  let totalCents = 0;
  for (const token of tokens) {
    const sign = token.startsWith('-') ? -1 : 1;
    const unsigned = token.replace(/^[+-]/, '');
    const [whole, frac = ''] = unsigned.split('.');
    const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
    totalCents += sign * cents;
  }

  if (totalCents <= 0) return '0';
  const whole = Math.floor(totalCents / 100);
  const frac = totalCents % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`;
}
