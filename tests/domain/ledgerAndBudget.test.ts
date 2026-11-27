import { describe, expect, it } from 'vitest';
import { evaluateMonthlyBudgets } from '../../src/domain/budget';
import {
  calculateBalancesAndNetWorth,
  calculateMonthlyCashflow,
} from '../../src/domain/ledger';
import type { Account, Budget, Transaction } from '../../src/domain/types';

const bank: Account = {
  id: 'bank-1',
  name: '薪轉銀行',
  type: 'bank',
  currency: 'TWD',
  initialBalance: 50000_00,
  isArchived: false,
  sortOrder: 1,
  createdAt: 1,
  updatedAt: 1,
};

const card: Account = {
  id: 'card-1',
  name: '信用卡',
  type: 'credit_card',
  currency: 'TWD',
  initialBalance: -5000_00,
  creditCardConfig: {
    statementDay: 15,
    paymentDueDay: 3,
    paymentDueMonthOffset: 1,
  },
  isArchived: false,
  sortOrder: 2,
  createdAt: 1,
  updatedAt: 1,
};

describe('Ledger, Cashflow & Budget Engine (LB-01 ~ LB-05)', () => {
  it('LB-01: keeps transfers and credit card repayments out of expenses and net worth changes', () => {
    const repayment: Transaction = {
      id: 'tx-pay',
      type: 'transfer',
      amount: 5000_00,
      accountId: 'bank-1',
      toAccountId: 'card-1',
      transactionDate: '2026-11-20',
      note: '繳卡費',
      status: 'posted',
      createdAt: 1,
      updatedAt: 1,
    };

    const nw = calculateBalancesAndNetWorth([bank, card], [repayment], '2026-11-27');
    expect(nw.byAccountId['bank-1'].postedBalance).toBe(45000_00);
    expect(nw.byAccountId['card-1'].postedBalance).toBe(0);
    expect(nw.totalAssets).toBe(45000_00);
    expect(nw.totalLiabilities).toBe(0);
    expect(nw.netWorth).toBe(45000_00);

    const cashflow = calculateMonthlyCashflow([repayment], '2026-11');
    expect(cashflow.totalExpense).toBe(0);
    expect(cashflow.totalIncome).toBe(0);
  });

  it('LB-02: reflects historical transaction edits immediately via derived recalculation', () => {
    const oldTx: Transaction = {
      id: 'tx-old',
      type: 'expense',
      amount: 1000_00,
      accountId: 'bank-1',
      categoryId: 'cat-food',
      transactionDate: '2026-08-15',
      note: '聚餐',
      status: 'posted',
      createdAt: 1,
      updatedAt: 1,
    };

    const before = calculateBalancesAndNetWorth([bank, card], [oldTx], '2026-11-27');
    expect(before.byAccountId['bank-1'].postedBalance).toBe(49000_00);

    const editedTx: Transaction = { ...oldTx, amount: 2500_00 };
    const after = calculateBalancesAndNetWorth([bank, card], [editedTx], '2026-11-27');
    expect(after.byAccountId['bank-1'].postedBalance).toBe(47500_00);
    expect(after.netWorth).toBe(42500_00);
  });

  it('LB-03: excludes void transactions from balances, cashflow, and budgets', () => {
    const voidTx: Transaction = {
      id: 'tx-void',
      type: 'expense',
      amount: 3000_00,
      accountId: 'bank-1',
      categoryId: 'cat-food',
      transactionDate: '2026-11-10',
      note: '作廢測試',
      status: 'void',
      createdAt: 1,
      updatedAt: 1,
    };

    const nw = calculateBalancesAndNetWorth([bank], [voidTx], '2026-11-27');
    expect(nw.byAccountId['bank-1'].postedBalance).toBe(50000_00);

    const cashflow = calculateMonthlyCashflow([voidTx], '2026-11');
    expect(cashflow.totalExpense).toBe(0);
  });

  it('LB-04: evaluates monthly budget overrides, warning threshold, and exceeded state', () => {
    const budgets: Budget[] = [
      {
        id: 'b-default-food',
        categoryId: 'cat-food',
        amount: 10000_00,
        yearMonth: null,
        alertThresholdPercent: 80,
        isActive: true,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'b-nov-food',
        categoryId: 'cat-food',
        amount: 12000_00,
        yearMonth: '2026-11',
        alertThresholdPercent: 80,
        isActive: true,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'b-total',
        categoryId: null,
        amount: 20000_00,
        yearMonth: null,
        alertThresholdPercent: 80,
        isActive: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    const txsWarning: Transaction[] = [
      {
        id: 't1',
        type: 'expense',
        amount: 9600_00,
        accountId: 'bank-1',
        categoryId: 'cat-food',
        transactionDate: '2026-11-10',
        note: '',
        status: 'posted',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 't-transfer',
        type: 'transfer',
        amount: 15000_00,
        accountId: 'bank-1',
        toAccountId: 'card-1',
        transactionDate: '2026-11-11',
        note: '',
        status: 'posted',
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    const progress1 = evaluateMonthlyBudgets(budgets, txsWarning, '2026-11');
    const food1 = progress1.find((p) => p.categoryId === 'cat-food')!;
    const total1 = progress1.find((p) => p.categoryId === null)!;

    expect(food1.budgetId).toBe('b-nov-food');
    expect(food1.limitAmount).toBe(12000_00);
    expect(food1.usagePercent).toBe(80);
    expect(food1.alertLevel).toBe('warning');
    expect(total1.alertLevel).toBe('ok');
    expect(total1.spentAmount).toBe(9600_00);

    const txsExceeded: Transaction[] = [
      ...txsWarning,
      {
        id: 't2',
        type: 'expense',
        amount: 2500_00,
        accountId: 'bank-1',
        categoryId: 'cat-food',
        transactionDate: '2026-11-20',
        note: '',
        status: 'posted',
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    const progress2 = evaluateMonthlyBudgets(budgets, txsExceeded, '2026-11');
    const food2 = progress2.find((p) => p.categoryId === 'cat-food')!;
    expect(food2.spentAmount).toBe(12100_00);
    expect(food2.remainingAmount).toBe(-100_00);
    expect(food2.alertLevel).toBe('exceeded');
  });

  it('LB-05: separates postedBalance (<= asOfDate) from projectedBalance (> asOfDate)', () => {
    const txs: Transaction[] = [
      {
        id: 'tx-now',
        type: 'expense',
        amount: 1000_00,
        accountId: 'card-1',
        categoryId: 'cat-1',
        transactionDate: '2026-11-20',
        note: '1/2',
        status: 'posted',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'tx-future',
        type: 'expense',
        amount: 1000_00,
        accountId: 'card-1',
        categoryId: 'cat-1',
        transactionDate: '2026-12-20',
        note: '2/2',
        status: 'posted',
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    const nw = calculateBalancesAndNetWorth([card], txs, '2026-11-27');
    expect(nw.byAccountId['card-1'].postedBalance).toBe(-6000_00);
    expect(nw.byAccountId['card-1'].projectedBalance).toBe(-7000_00);
  });
});
