import { describe, expect, it } from 'vitest';
import type { Account, Transaction } from '../../src/domain/types';

describe('Domain types smoke check', () => {
  it('accepts valid integer minor-unit transaction shape', () => {
    const card: Account = {
      id: 'acc-1',
      name: '主力信用卡',
      type: 'credit_card',
      currency: 'TWD',
      initialBalance: 0,
      creditCardConfig: {
        statementDay: 15,
        paymentDueDay: 3,
        paymentDueMonthOffset: 1,
      },
      isArchived: false,
      sortOrder: 1,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    };

    const tx: Transaction = {
      id: 'tx-1',
      type: 'expense',
      amount: 15000,
      accountId: card.id,
      categoryId: 'cat-food',
      transactionDate: '2026-11-27',
      note: '午餐',
      status: 'posted',
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    };

    expect(tx.amount).toBeGreaterThan(0);
    expect(card.creditCardConfig?.statementDay).toBe(15);
  });
});
