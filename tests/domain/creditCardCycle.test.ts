import { describe, expect, it } from 'vitest';
import {
  calculateCreditCardSummary,
  getBillingPeriodForDate,
  resolveStatementPeriod,
} from '../../src/domain/creditCardCycle';
import type { Account, CreditCardConfig, Transaction } from '../../src/domain/types';

function makeCard(
  config: CreditCardConfig,
  initialBalance = 0,
): Account {
  return {
    id: 'card-1',
    name: 'Test Card',
    type: 'credit_card',
    currency: 'TWD',
    initialBalance,
    creditCardConfig: config,
    isArchived: false,
    sortOrder: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

function makeTx(
  overrides: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'amount' | 'transactionDate'>,
): Transaction {
  return {
    accountId: 'card-1',
    categoryId: overrides.type === 'transfer' ? undefined : 'cat-1',
    note: '',
    status: 'posted',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('Credit Card Billing Cycle Engine (CC-01 ~ CC-06)', () => {
  it('CC-01: includes statementDay transactions in the closing period and next day in next period', () => {
    const config: CreditCardConfig = {
      statementDay: 15,
      paymentDueDay: 3,
      paymentDueMonthOffset: 1,
    };

    const pOnCutoff = getBillingPeriodForDate('2026-11-15', config);
    const pAfterCutoff = getBillingPeriodForDate('2026-11-16', config);

    expect(pOnCutoff.statementMonth).toBe('2026-11');
    expect(pOnCutoff.periodStart).toBe('2026-10-16');
    expect(pOnCutoff.periodEnd).toBe('2026-11-15');

    expect(pAfterCutoff.statementMonth).toBe('2026-12');
    expect(pAfterCutoff.periodStart).toBe('2026-11-16');
    expect(pAfterCutoff.periodEnd).toBe('2026-12-15');

    const card = makeCard(config);
    const txs: Transaction[] = [
      makeTx({ id: 't1', type: 'expense', amount: 100_00, transactionDate: '2026-11-15' }),
      makeTx({ id: 't2', type: 'expense', amount: 250_00, transactionDate: '2026-11-16' }),
    ];

    const summary = calculateCreditCardSummary(card, txs, '2026-11-20');
    expect(summary.latestClosedPeriod.statementMonth).toBe('2026-11');
    expect(summary.closedStatementBalance).toBe(100_00);
    expect(summary.remainingStatementDue).toBe(100_00);
    expect(summary.unbilledSpending).toBe(250_00);
    expect(summary.status).toBe('open_due');
  });

  it('CC-02: clamps statementDay=31 accurately for non-leap Feb, leap Feb, and 30-day months', () => {
    const config: CreditCardConfig = {
      statementDay: 31,
      paymentDueDay: 15,
      paymentDueMonthOffset: 1,
    };

    const nonLeapFeb = resolveStatementPeriod(2026, 2, config);
    expect(nonLeapFeb.periodStart).toBe('2026-02-01');
    expect(nonLeapFeb.periodEnd).toBe('2026-02-28');

    const leapFeb = resolveStatementPeriod(2024, 2, config);
    expect(leapFeb.periodStart).toBe('2024-02-01');
    expect(leapFeb.periodEnd).toBe('2024-02-29');

    const april = resolveStatementPeriod(2026, 4, config);
    expect(april.periodStart).toBe('2026-04-01');
    expect(april.periodEnd).toBe('2026-04-30');
  });

  it('CC-03: resolves cross-year payment dueDate when offset=1', () => {
    const config: CreditCardConfig = {
      statementDay: 25,
      paymentDueDay: 12,
      paymentDueMonthOffset: 1,
    };

    const dec = resolveStatementPeriod(2026, 12, config);
    expect(dec.periodEnd).toBe('2026-12-25');
    expect(dec.dueDate).toBe('2027-01-12');
  });

  it('CC-04: handles partial payment and overpayment (positive credit balance)', () => {
    const config: CreditCardConfig = {
      statementDay: 15,
      paymentDueDay: 3,
      paymentDueMonthOffset: 1,
      creditLimit: 50000_00,
    };
    const card = makeCard(config);

    const partialTxs: Transaction[] = [
      makeTx({ id: 'e1', type: 'expense', amount: 10000_00, transactionDate: '2026-11-10' }),
      makeTx({
        id: 'p1',
        type: 'transfer',
        accountId: 'bank-1',
        toAccountId: 'card-1',
        amount: 6000_00,
        transactionDate: '2026-11-25',
      }),
    ];

    const partialSummary = calculateCreditCardSummary(card, partialTxs, '2026-11-26');
    expect(partialSummary.closedStatementBalance).toBe(10000_00);
    expect(partialSummary.repaidSinceStatementClose).toBe(6000_00);
    expect(partialSummary.remainingStatementDue).toBe(4000_00);
    expect(partialSummary.postedBalance).toBe(-4000_00);
    expect(partialSummary.availableCredit).toBe(46000_00);

    const overpaidTxs: Transaction[] = [
      ...partialTxs,
      makeTx({
        id: 'p2',
        type: 'transfer',
        accountId: 'bank-1',
        toAccountId: 'card-1',
        amount: 6000_00,
        transactionDate: '2026-11-26',
      }),
    ];

    const overpaidSummary = calculateCreditCardSummary(card, overpaidTxs, '2026-11-26');
    expect(overpaidSummary.remainingStatementDue).toBe(0);
    expect(overpaidSummary.postedBalance).toBe(2000_00);
    expect(overpaidSummary.availableCredit).toBe(52000_00);
    expect(overpaidSummary.status).toBe('paid');
  });

  it('CC-05: marks statement overdue after dueDate and paid once settled', () => {
    const config: CreditCardConfig = {
      statementDay: 15,
      paymentDueDay: 3,
      paymentDueMonthOffset: 1,
    };
    const card = makeCard(config);
    const charge = makeTx({
      id: 'e1',
      type: 'expense',
      amount: 3000_00,
      transactionDate: '2026-11-10',
    });

    // Latest closed on 2026-12-04 is 2026-11 (dueDate = 2026-12-03)
    const overdue = calculateCreditCardSummary(card, [charge], '2026-12-04');
    expect(overdue.status).toBe('overdue');
    expect(overdue.remainingStatementDue).toBe(3000_00);

    const settled = calculateCreditCardSummary(
      card,
      [
        charge,
        makeTx({
          id: 'p1',
          type: 'transfer',
          accountId: 'bank-1',
          toAccountId: 'card-1',
          amount: 3000_00,
          transactionDate: '2026-12-04',
        }),
      ],
      '2026-12-04',
    );
    expect(settled.status).toBe('paid');
    expect(settled.remainingStatementDue).toBe(0);
  });

  it('CC-06: keeps future installment postings out of unbilledSpending and reduces availableCredit', () => {
    const config: CreditCardConfig = {
      statementDay: 15,
      paymentDueDay: 3,
      paymentDueMonthOffset: 1,
      creditLimit: 30000_00,
    };
    const card = makeCard(config);

    const txs: Transaction[] = [
      makeTx({ id: 'i1', type: 'expense', amount: 2000_00, transactionDate: '2026-11-18' }),
      makeTx({ id: 'i2', type: 'expense', amount: 2000_00, transactionDate: '2026-12-18' }),
      makeTx({ id: 'i3', type: 'expense', amount: 2000_00, transactionDate: '2027-01-18' }),
    ];

    const summary = calculateCreditCardSummary(card, txs, '2026-11-20');
    expect(summary.unbilledSpending).toBe(2000_00);
    expect(summary.futureInstallmentTotal).toBe(4000_00);
    expect(summary.postedBalance).toBe(-2000_00);
    expect(summary.availableCredit).toBe(24000_00);
  });
});
