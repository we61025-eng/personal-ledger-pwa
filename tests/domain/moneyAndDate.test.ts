import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsWithAnchor,
  addYearsWithAnchor,
  clampDayToMonth,
  diffDays,
  parseISODate,
} from '../../src/domain/date';
import {
  assertPositiveAmount,
  parseInputToMinor,
} from '../../src/domain/money';

describe('Money & Date Engine (MD-01 ~ MD-04)', () => {
  it('MD-01: avoids floating-point drift on decimal parsing and summation', () => {
    const a = parseInputToMinor('0.1');
    const b = parseInputToMinor('0.2');
    expect(a + b).toBe(30);
    expect(parseInputToMinor('12.34')).toBe(1234);
    expect(parseInputToMinor('1,500')).toBe(150000);
    expect(() => assertPositiveAmount(0)).toThrow();
    expect(() => parseInputToMinor('12.345')).toThrow();
  });

  it('MD-02: preserves anchor day 31 across non-leap February', () => {
    expect(addMonthsWithAnchor('2025-01-31', 1, 31)).toBe('2025-02-28');
    expect(addMonthsWithAnchor('2025-01-31', 2, 31)).toBe('2025-03-31');
    expect(addMonthsWithAnchor('2025-01-31', 3, 31)).toBe('2025-04-30');
  });

  it('MD-03: preserves anchor day 31 across leap-year February', () => {
    expect(addMonthsWithAnchor('2024-01-31', 1, 31)).toBe('2024-02-29');
    expect(addMonthsWithAnchor('2024-01-31', 2, 31)).toBe('2024-03-31');
    expect(addYearsWithAnchor('2024-02-29', 1, 29)).toBe('2025-02-28');
    expect(addYearsWithAnchor('2024-02-29', 4, 29)).toBe('2028-02-29');
  });

  it('MD-04: handles cross-year date shifts and invalid calendar dates', () => {
    expect(addMonthsWithAnchor('2026-12-15', 1)).toBe('2027-01-15');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(diffDays('2026-02-28', '2026-03-01')).toBe(1);
    expect(clampDayToMonth(2026, 2, 31)).toBe('2026-02-28');
    expect(() => parseISODate('2026-02-29')).toThrow();
  });
});
