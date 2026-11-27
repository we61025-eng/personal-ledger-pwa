import { describe, expect, it } from 'vitest';
import {
  cancelInstallmentPlan,
  createInstallmentPlan,
  rebuildInstallmentTransactions,
} from '../../src/domain/installment';
import { splitInstallmentAmounts } from '../../src/domain/money';

function createSeqIdGenerator(prefix = 'id') {
  let seq = 0;
  return () => `${prefix}-${++seq}`;
}

describe('Installment Engine (IN-01 ~ IN-05)', () => {
  it('IN-01: expands evenly divisible installment plan with 1..N indices', () => {
    const genId = createSeqIdGenerator('inst');
    const { plan, transactions } = createInstallmentPlan(
      {
        accountId: 'card-1',
        categoryId: 'cat-tech',
        totalAmount: 12000_00,
        totalInstallments: 6,
        startDate: '2026-11-10',
        note: '耳機',
      },
      genId,
      1000,
    );

    expect(plan.totalInstallments).toBe(6);
    expect(transactions).toHaveLength(6);
    expect(transactions.map((t) => t.amount)).toEqual([
      2000_00, 2000_00, 2000_00, 2000_00, 2000_00, 2000_00,
    ]);
    expect(transactions.map((t) => t.installmentIndex)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(transactions[0].note).toBe('耳機 (1/6)');
  });

  it('IN-02: allocates indivisible remainder to first or last installment accurately', () => {
    const first = splitInstallmentAmounts(1000, 3, 'first');
    expect(first).toEqual([334, 333, 333]);
    expect(first.reduce((a, b) => a + b, 0)).toBe(1000);

    const last = splitInstallmentAmounts(1000, 3, 'last');
    expect(last).toEqual([333, 333, 334]);
    expect(last.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('IN-03: preserves anchor day 31 across February without drifting March', () => {
    const genId = createSeqIdGenerator('anchor');
    const { transactions } = createInstallmentPlan(
      {
        accountId: 'card-1',
        categoryId: 'cat-1',
        totalAmount: 4000_00,
        totalInstallments: 4,
        startDate: '2026-01-31',
        note: '筆電',
      },
      genId,
      1000,
    );

    expect(transactions.map((t) => t.transactionDate)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('IN-04: keeps past installments untouched and recalculates future installments', () => {
    const genId = createSeqIdGenerator('reb');
    const { plan, transactions } = createInstallmentPlan(
      {
        accountId: 'card-1',
        categoryId: 'cat-1',
        totalAmount: 12000_00,
        totalInstallments: 4,
        startDate: '2026-09-10',
        note: '課程',
      },
      genId,
      1000,
    );

    const updatedPlanInput = { ...plan, totalAmount: 10000_00 };
    const result = rebuildInstallmentTransactions(
      updatedPlanInput,
      transactions,
      'keep_past_recalculate_future',
      '2026-10-15',
      genId,
      2000,
    );

    // 09-10 and 10-10 (3000+3000=6000) are kept; 11-10 and 12-10 are voided & replaced by 2000+2000
    expect(result.voidTransactionIds).toEqual([transactions[2].id, transactions[3].id]);
    expect(result.newTransactions).toHaveLength(2);
    expect(result.newTransactions.map((t) => t.amount)).toEqual([2000_00, 2000_00]);
    expect(result.newTransactions.map((t) => t.transactionDate)).toEqual([
      '2026-11-10',
      '2026-12-10',
    ]);
    expect(result.newTransactions.map((t) => t.installmentIndex)).toEqual([3, 4]);
  });

  it('IN-05: cancels installment plan by voiding only future transactions', () => {
    const genId = createSeqIdGenerator('can');
    const { plan, transactions } = createInstallmentPlan(
      {
        accountId: 'card-1',
        categoryId: 'cat-1',
        totalAmount: 9000_00,
        totalInstallments: 3,
        startDate: '2026-10-05',
        note: '健身房',
      },
      genId,
      1000,
    );

    const cancelled = cancelInstallmentPlan(plan, transactions, '2026-11-10', 3000);
    expect(cancelled.cancelledPlan.status).toBe('cancelled');
    expect(cancelled.voidTransactionIds).toEqual([transactions[2].id]);
  });
});
