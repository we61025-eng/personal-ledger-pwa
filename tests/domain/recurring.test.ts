import { describe, expect, it } from 'vitest';
import {
  buildRecurringOccurrenceKey,
  computeRecurringCatchUp,
} from '../../src/domain/recurring';
import type { RecurringRule } from '../../src/domain/types';

function makeRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'rule-rent',
    name: '房租',
    type: 'expense',
    amount: 15000_00,
    accountId: 'bank-1',
    categoryId: 'cat-housing',
    frequency: 'monthly',
    interval: 1,
    anchorDay: 1,
    startDate: '2026-09-01',
    nextRunDate: '2026-10-01',
    isActive: true,
    note: '月繳房租',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function createIdGen() {
  let i = 0;
  return () => `rec-tx-${++i}`;
}

describe('Recurring Catch-Up Engine (RC-01 ~ RC-05)', () => {
  it('RC-01: catches up multiple missed occurrences up to asOfDate', () => {
    const rule = makeRule({ nextRunDate: '2026-10-01' });
    const res = computeRecurringCatchUp(
      [rule],
      new Set(),
      '2026-11-15',
      createIdGen(),
      5000,
    );

    expect(res.transactionsToInsert).toHaveLength(2);
    expect(res.transactionsToInsert.map((t) => t.transactionDate)).toEqual([
      '2026-10-01',
      '2026-11-01',
    ]);
    expect(res.updatedRules).toHaveLength(1);
    expect(res.updatedRules[0].nextRunDate).toBe('2026-12-01');
  });

  it('RC-02: guarantees idempotency when executed repeatedly with existing keys', () => {
    const rule = makeRule({ nextRunDate: '2026-10-01' });
    const gen = createIdGen();

    const first = computeRecurringCatchUp([rule], new Set(), '2026-11-15', gen, 5000);
    const existingKeys = new Set(
      first.transactionsToInsert.map((t) =>
        buildRecurringOccurrenceKey(t.recurringRuleId!, t.recurringOccurrenceDate!),
      ),
    );

    // Even if rule wasn't persisted yet (stale nextRunDate), existingKeys prevents duplicates
    const staleRetry = computeRecurringCatchUp([rule], existingKeys, '2026-11-15', gen, 6000);
    expect(staleRetry.transactionsToInsert).toHaveLength(0);
    expect(staleRetry.updatedRules[0].nextRunDate).toBe('2026-12-01');

    // Running again with updated rule does nothing at all
    const second = computeRecurringCatchUp(
      first.updatedRules,
      existingKeys,
      '2026-11-15',
      gen,
      6000,
    );
    expect(second.transactionsToInsert).toHaveLength(0);
    expect(second.updatedRules).toHaveLength(0);
  });

  it('RC-03: stops generating transactions beyond rule.endDate', () => {
    const rule = makeRule({
      nextRunDate: '2026-10-01',
      endDate: '2026-10-31',
    });

    const res = computeRecurringCatchUp(
      [rule],
      new Set(),
      '2026-12-01',
      createIdGen(),
      5000,
    );

    expect(res.transactionsToInsert).toHaveLength(1);
    expect(res.transactionsToInsert[0].transactionDate).toBe('2026-10-01');
    expect(res.updatedRules[0].nextRunDate).toBe('2026-11-01');
  });

  it('RC-04: preserves anchorDay=31 across February without drifting March', () => {
    const rule = makeRule({
      id: 'rule-31',
      anchorDay: 31,
      startDate: '2026-01-31',
      nextRunDate: '2026-01-31',
    });

    const res = computeRecurringCatchUp(
      [rule],
      new Set(),
      '2026-04-01',
      createIdGen(),
      5000,
    );

    expect(res.transactionsToInsert.map((t) => t.transactionDate)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
    expect(res.updatedRules[0].nextRunDate).toBe('2026-04-30');
  });

  it('RC-05: ignores paused rules (isActive = false)', () => {
    const paused = makeRule({ isActive: false, nextRunDate: '2026-10-01' });
    const res = computeRecurringCatchUp(
      [paused],
      new Set(),
      '2026-11-15',
      createIdGen(),
      5000,
    );

    expect(res.transactionsToInsert).toHaveLength(0);
    expect(res.updatedRules).toHaveLength(0);
  });
});
