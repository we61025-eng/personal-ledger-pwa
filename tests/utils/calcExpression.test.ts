import { describe, expect, it } from 'vitest';
import { evaluateSimpleExpression } from '../../src/utils/calcExpression';

describe('Quick Entry keypad expression evaluator', () => {
  it('evaluates addition and subtraction without floating-point error', () => {
    expect(evaluateSimpleExpression('120+85-20')).toBe('185');
    expect(evaluateSimpleExpression('0.1+0.2')).toBe('0.30');
    expect(evaluateSimpleExpression('1500')).toBe('1500');
  });

  it('rejects malformed or non-positive expressions safely', () => {
    expect(evaluateSimpleExpression('')).toBeNull();
    expect(evaluateSimpleExpression('10+')).toBeNull();
    expect(evaluateSimpleExpression('10-20')).toBe('0');
  });
});
